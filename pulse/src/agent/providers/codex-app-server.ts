/**
 * Codex App-Server Provider — runs an agent turn on the user's ChatGPT/Codex
 * *subscription* (no API key), the same way Hermes and OpenClaw drive it.
 *
 * Persistent harness (OpenClaw/Hermes-style): ONE long-lived `codex
 * app-server` subprocess serves all chats, and each Pulse conversation maps to
 * one Codex thread that carries its history server-side — so turn 2+ skips
 * the cold start and the full-context reload. See the harness docblock above
 * CodexAppServerProvider for the concurrency/recovery model.
 *
 * IMPORTANT — this is a host-level credential, not a per-tenant one. The
 * subprocess inherits `process.env` and reads `~/.codex/auth.json` on the
 * machine running Pulse, so every tenant that selects the `codex` provider
 * shares whichever ChatGPT/Codex account is logged in via `codex login` on
 * this host. That's the intended MVP behavior (mirrors Hermes/OpenClaw's
 * single-user model) but is very different from the existing per-tenant BYOK
 * OAuth path in `openai.ts` (chatViaChatGPTBackend). Do not conflate the two.
 *
 * Protocol: newline-delimited JSON-RPC over stdio. Verified live against the
 * installed `codex-cli 0.142.1` bindings (`codex app-server generate-ts`).
 * See CodexRpcClient below for wire-format specifics and gotchas.
 *
 * Tool access — Codex as an "operator", not just text: this provider gives
 * the Codex thread access to Pulse's own tools (send_message, list/get
 * conversations, ...) the same way Hermes and OpenClaw drive Codex — by
 * projecting an `mcp_servers` entry into `thread/start`'s per-thread `config`
 * override that points at Pulse's own MCP endpoint
 * (`pulse/src/gateway/routes/mcp.ts`, `POST /mcp`, StreamableHTTP). See
 * `resolveTenantMcpConfig()` below for how the tenant-scoped bearer token is
 * minted per thread and passed inline as `bearer_token` in the per-thread
 * config (local stdio pipe only — see MCP_TOKEN_TTL_MS for the tradeoff).
 * Verified live: codex 0.142.1 gates every MCP tool
 * call behind a `mcpServer/elicitation/request` server request (NOT the
 * `item/commandExecution|fileChange/requestApproval` surface, and NOT
 * suppressed by `approvalPolicy: "never"`) — `handleServerRequest()` below
 * auto-accepts that request specifically for Pulse's own server name so
 * tool calls execute headlessly instead of hanging waiting for a human.
 */

import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as os from "os";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { db } from "../../storage/db.js";
import { tenants } from "../../storage/schema.js";
import { mintAppAccessToken } from "../../gateway/oauth.js";
import { sendFileToConversation } from "../../utils/channel-delivery.js";
import { ProviderResponse, ProviderAttachment } from "./anthropic.js";

const DEFAULT_TIMEOUT_MS = 120_000; // legacy param default (RPC math only — NOT a turn cap)
const INITIALIZE_TIMEOUT_MS = 15_000;
const THREAD_START_TIMEOUT_MS = 20_000;
const TURN_START_TIMEOUT_MS = 15_000;
// A turn is NOT capped by wall-clock — high-reasoning turns legitimately run
// long. Instead (matching Hermes) we interrupt only after genuine silence, and
// keep a generous absolute backstop against a truly wedged turn. Any streaming
// notification (reasoning summary, item, token usage) resets the inactivity clock.
const TURN_INACTIVITY_TIMEOUT_MS = Number(process.env.CODEX_TURN_INACTIVITY_MS) || 240_000;
const TURN_ABSOLUTE_MAX_MS = Number(process.env.CODEX_TURN_MAX_MS) || 30 * 60_000;
// Codex reasoning effort (minimal|low|medium|high|xhigh). Default high — Pulse
// agents do multi-step tool work where thinking pays off. Override per deploy.
const DEFAULT_REASONING_EFFORT = process.env.CODEX_REASONING_EFFORT || "high";
const STDERR_TAIL_LINES = 60;

// ── Pulse-as-MCP-server wiring (Codex operator mode) ───────────────────────

/** Name the Pulse MCP server is registered under in the thread's mcp_servers config. */
const PULSE_MCP_SERVER_NAME = "pulse";
/**
 * Per-THREAD token lifetime. With the persistent harness one codex app-server
 * process serves many tenants/threads, so env-var token delivery (fixed at
 * spawn) no longer works — the token is minted per thread and passed INLINE as
 * `bearer_token` in the per-thread `config.mcp_servers`. That value travels
 * only over the local stdio pipe to our own child process (never disk, never
 * argv), which is an acceptable tradeoff for multi-thread token rotation.
 */
const MCP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Rotate the thread (fresh token) when its token has less than this left. */
const MCP_TOKEN_ROTATE_MARGIN_MS = 60 * 60 * 1000;
/** clientId recorded on the minted oauth_tokens row — identifies the issuer, not an end user. */
const MCP_TOKEN_CLIENT_ID = "pulse-codex-operator";
/** Max conversations with a cached codex thread; least-recently-used beyond this are evicted. */
const THREAD_CACHE_MAX = 200;

interface TenantMcpConfig {
    /** Value for `thread/start`'s `config.mcp_servers` override (token inlined). */
    mcpServers: Record<string, unknown>;
    /** When the inlined bearer token expires (epoch ms). */
    tokenExpiresAt: number;
}

/**
 * Build the per-thread `mcp_servers` config that gives this tenant's Codex
 * thread access to Pulse's own tools, by minting a short-lived bearer token
 * for Pulse's `/mcp` endpoint (same issuance scheme as the `/oauth/token`
 * exchange used by Claude Code / other third-party CLIs — see
 * `mintAppAccessToken()` in `gateway/oauth.ts`).
 *
 * Returns `null` (no tool access, falls back to plain text chat) when the
 * tenant hasn't enabled third-party CLI/tool access — `/mcp` enforces this
 * same `enable_third_party_cli` gate on every call, so skipping it here just
 * avoids minting a token that would be rejected on first use.
 */
async function resolveTenantMcpConfig(tenantId: string, agentProfileId?: string, conversationId?: string): Promise<TenantMcpConfig | null> {
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    const tenantConfig = tenant?.config as Record<string, any> | undefined;
    if (!tenantConfig?.enable_third_party_cli) return null;

    const { token } = await mintAppAccessToken(tenantId, MCP_TOKEN_CLIENT_ID, MCP_TOKEN_TTL_MS);

    // ?agent=<id> scopes the MCP session to that agent's enabled Pulse tools
    // (workspace_update, memory_*, sandbox, custom tools) — operator mode.
    const qs = new URLSearchParams();
    if (agentProfileId) qs.set("agent", agentProfileId);
    // Real conversation id → tools that deliver into the chat (e.g. screenshot
    // → Telegram photo) know which conversation this thread belongs to.
    if (conversationId) qs.set("conv", conversationId);
    const agentQs = qs.size ? `?${qs.toString()}` : "";

    return {
        mcpServers: {
            [PULSE_MCP_SERVER_NAME]: {
                url: `http://127.0.0.1:${config.PORT}/mcp${agentQs}`,
                // Per-thread token, inline on purpose (see MCP_TOKEN_TTL_MS docblock).
                // NOTE: codex rejects `bearer_token` for streamable_http transports
                // ("bearer_token is not supported for streamable_http"), but accepts
                // the equivalent Authorization header via `http_headers` — verified
                // against codex-cli 0.142.1.
                http_headers: { Authorization: `Bearer ${token}` },
            },
        },
        tokenExpiresAt: Date.now() + MCP_TOKEN_TTL_MS,
    };
}

export class CodexRpcError extends Error {
    code: number;
    data?: unknown;
    constructor(code: number, message: string, data?: unknown) {
        super(message);
        this.name = "CodexRpcError";
        this.code = code;
        this.data = data;
    }
}

interface PendingRequest {
    method: string;
    resolve: (result: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

/**
 * Minimal JSON-RPC client for `codex app-server` over stdio.
 *
 * Node is single-threaded/event-loop based, so unlike the Python reference
 * (which needs a dedicated reader thread + blocking queues), a plain
 * event-driven stdout parser is sufficient: `dispatch()` runs synchronously
 * on each parsed line, resolving pending request promises or forwarding
 * notifications/server-requests to whatever handler is registered for the
 * current turn.
 */
class CodexRpcClient {
    private child: ChildProcessWithoutNullStreams;
    private stdoutBuffer = "";
    private nextId = 1;
    private pending = new Map<number, PendingRequest>();
    private notificationHandler: ((msg: { method: string; params: any }) => void) | null = null;
    private serverRequestHandler: ((msg: { id: number | string; method: string; params: any }) => void) | null = null;
    private stderrLines: string[] = [];
    private closed = false;
    private exited = false;
    private exitError: Error | null = null;

    constructor(codexBin: string, extraEnv?: Record<string, string>) {
        this.child = spawn(codexBin, ["app-server"], {
            env: { ...process.env, RUST_LOG: process.env.RUST_LOG || "warn", ...extraEnv },
            stdio: ["pipe", "pipe", "pipe"],
        });

        this.child.stdout.setEncoding("utf8");
        this.child.stdout.on("data", (chunk: string) => this.onStdoutChunk(chunk));

        this.child.stderr.setEncoding("utf8");
        this.child.stderr.on("data", (chunk: string) => {
            for (const line of chunk.split("\n")) {
                if (line.trim()) this.stderrLines.push(line);
            }
            if (this.stderrLines.length > 500) {
                this.stderrLines = this.stderrLines.slice(-500);
            }
        });

        this.child.on("error", (err) => {
            this.exited = true;
            this.exitError = err;
            this.failAllPending(new Error(`codex app-server spawn error: ${err.message}`));
        });

        this.child.on("exit", (code, signal) => {
            this.exited = true;
            if (!this.closed) {
                this.exitError = new Error(
                    `codex app-server exited unexpectedly (code=${code}, signal=${signal})`
                );
                this.failAllPending(this.exitError);
            }
        });
    }

    private failAllPending(err: Error): void {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(err);
            this.pending.delete(id);
        }
    }

    private onStdoutChunk(chunk: string): void {
        this.stdoutBuffer += chunk;
        let idx: number;
        while ((idx = this.stdoutBuffer.indexOf("\n")) >= 0) {
            const line = this.stdoutBuffer.slice(0, idx).trim();
            this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
            if (!line) continue;
            let msg: any;
            try {
                msg = JSON.parse(line);
            } catch {
                // Non-JSON on stdout is unexpected (tracing belongs on stderr);
                // stash it for diagnostics instead of crashing the parser.
                this.stderrLines.push(`<non-json stdout> ${line.slice(0, 200)}`);
                continue;
            }
            this.dispatch(msg);
        }
    }

    private dispatch(msg: any): void {
        // Reply to one of our requests: has id + (result or error), no method.
        if (msg.id !== undefined && msg.method === undefined && ("result" in msg || "error" in msg)) {
            const pending = this.pending.get(msg.id);
            if (!pending) return;
            this.pending.delete(msg.id);
            clearTimeout(pending.timer);
            if (msg.error) {
                pending.reject(new CodexRpcError(msg.error.code ?? -1, msg.error.message ?? "unknown error", msg.error.data));
            } else {
                pending.resolve(msg.result);
            }
            return;
        }
        // Server-initiated request: has id + method. Must be answered or the turn hangs.
        if (msg.id !== undefined && msg.method !== undefined) {
            this.serverRequestHandler?.(msg);
            return;
        }
        // Notification: has method, no id.
        if (msg.method !== undefined) {
            this.notificationHandler?.(msg);
        }
    }

    request(method: string, params: any, timeoutMs: number): Promise<any> {
        if (this.closed) return Promise.reject(new Error("codex app-server client is closed"));
        if (this.exited) return Promise.reject(this.exitError ?? new Error("codex app-server subprocess is not running"));

        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`codex app-server method "${method}" timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pending.set(id, { method, resolve, reject, timer });
            try {
                this.send({ id, method, params: params ?? {} });
            } catch (err: any) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(err);
            }
        });
    }

    notify(method: string, params?: any): void {
        this.send({ method, params: params ?? {} });
    }

    respond(id: number | string, result: any): void {
        try {
            this.send({ id, result });
        } catch {
            // Subprocess already gone — nothing useful to do.
        }
    }

    respondError(id: number | string, code: number, message: string): void {
        try {
            this.send({ id, error: { code, message } });
        } catch {
            // Subprocess already gone — nothing useful to do.
        }
    }

    private send(obj: Record<string, unknown>): void {
        if (this.closed) throw new Error("codex app-server client is closed");
        if (!this.child.stdin.writable) throw new Error("codex app-server stdin is not writable");
        this.child.stdin.write(JSON.stringify(obj) + "\n");
    }

    onNotification(handler: (msg: { method: string; params: any }) => void): void {
        this.notificationHandler = handler;
    }

    onServerRequest(handler: (msg: { id: number | string; method: string; params: any }) => void): void {
        this.serverRequestHandler = handler;
    }

    stderrTail(n = STDERR_TAIL_LINES): string {
        return this.stderrLines.slice(-n).join("\n");
    }

    isAlive(): boolean {
        return !this.exited;
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.failAllPending(new Error("codex app-server client closed"));
        try {
            this.child.stdin.end();
        } catch {
            // ignore
        }
        try {
            this.child.kill("SIGTERM");
        } catch {
            // ignore
        }
        // Escalate to SIGKILL if it doesn't exit promptly — never leave a zombie.
        const killTimer = setTimeout(() => {
            try {
                this.child.kill("SIGKILL");
            } catch {
                // ignore
            }
        }, 3000);
        this.child.once("exit", () => clearTimeout(killTimer));
    }
}

/**
 * Respond to any server-initiated approval/elicitation request with a safe
 * denial so a text-only, tool-free turn can never hang waiting on a human
 * who isn't there. Covers both the current (v2 `item/*`) and legacy
 * (`applyPatchApproval` / `execCommandApproval`) approval surfaces, plus the
 * MCP elicitation bridge. `approvalPolicy: "never"` on the thread should
 * mean these rarely if ever fire for a plain chat turn, but we still answer
 * everything defensively.
 *
 * IMPORTANT — verified live against codex 0.142.1: MCP tool calls are gated
 * behind `mcpServer/elicitation/request` with `_meta.codex_approval_kind ===
 * "mcp_tool_call"`, and this fires REGARDLESS of `approvalPolicy: "never"`
 * (that policy only covers the built-in shell/file-change surface). Left
 * unhandled, every call to a Pulse tool would hang until this elicitation is
 * answered. We auto-accept it, but only when `serverName` is Pulse's own MCP
 * server — any other MCP server (e.g. one a human configured globally in
 * `~/.codex/config.toml` on this host) still gets declined below, so this
 * provider never silently grants tool access it didn't itself wire up.
 */
function handleServerRequest(client: CodexRpcClient, msg: { id: number | string; method: string; params: any }): void {
    switch (msg.method) {
        case "item/commandExecution/requestApproval":
        case "item/fileChange/requestApproval":
            client.respond(msg.id, { decision: "decline" });
            return;
        case "item/permissions/requestApproval":
            // No plain "decline" exists in this response shape — granting an
            // empty permissions profile for just this turn is the closest
            // safe equivalent (no additional access granted).
            client.respond(msg.id, { permissions: {}, scope: "turn" });
            return;
        case "mcpServer/elicitation/request":
            if (
                msg.params?.serverName === PULSE_MCP_SERVER_NAME &&
                msg.params?._meta?.codex_approval_kind === "mcp_tool_call"
            ) {
                client.respond(msg.id, { action: "accept", content: null, _meta: null });
                return;
            }
            client.respond(msg.id, { action: "decline", content: null, _meta: null });
            return;
        case "item/tool/requestUserInput":
            client.respond(msg.id, { answers: {} });
            return;
        case "applyPatchApproval":
        case "execCommandApproval":
            // Legacy (pre-v2) approval surface — still reachable per the
            // generated ServerRequest union on codex 0.142.1.
            client.respond(msg.id, { decision: "denied" });
            return;
        default:
            // Unknown/rare server request (e.g. item/tool/call for a
            // client-implemented dynamic tool, account/chatgptAuthTokens/refresh,
            // attestation/generate). We register no dynamic tools and don't
            // request the attestation capability, so these shouldn't fire for
            // a plain chat turn — reject cleanly rather than hang.
            client.respondError(msg.id, -32601, `Unsupported server request: ${msg.method}`);
    }
}

// ── Persistent harness: one shared app-server + per-conversation threads ────
//
// OpenClaw/Hermes-style: instead of spawning a fresh `codex app-server` and a
// brand-new thread for every message (cold start + full context reload each
// turn), one long-lived subprocess serves all chats and each Pulse
// conversation maps to ONE Codex thread that carries its own history
// server-side. Turn 2+ therefore only pays for the new message.
//
// Concurrency model: a single global turn queue. The RPC client's
// notification handling is single-turn, and this deployment is single-tenant,
// so serializing turns is the honest, simple choice. Revisit with per-thread
// notification routing if this ever needs parallel turns.
//
// Recovery model: deliberately NO `thread/resume`. Every spawn of the shared
// process bumps a generation counter; cached threads from an older generation
// (or evicted/failed threads) just get a fresh `thread/start` with the full
// conversation history replayed as text — the universal, low-risk recovery.
//
// Known tradeoff: `developerInstructions` (the agent's system prompt/SOUL) is
// fixed at thread/start, so mid-conversation SOUL edits only take effect on
// the next fresh thread (new conversation, rotation, or recovery).

interface CachedThread {
    threadId: string;
    generation: number;
    tokenExpiresAt: number; // Infinity when the thread has no MCP token
    lastUsed: number;
}

let sharedClient: CodexRpcClient | null = null;
let sharedClientInit: Promise<CodexRpcClient> | null = null;
let clientGeneration = 0;
const threadCache = new Map<string, CachedThread>();
// PER-CONVERSATION turn queues (was a single global queue — one slow/hung turn
// then blocked EVERY agent). Same-conversation turns still serialize because
// they share a Codex thread; different conversations run concurrently.
const turnQueues = new Map<string, Promise<unknown>>();

/**
 * Reject if `p` doesn't settle within `ms`. Guards the WHOLE turn (incl.
 * un-timed awaits like DB/token/client-init) so a hang can never permanently
 * wedge its queue — the queue always advances.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
        p.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}

async function getSharedClient(codexBin: string): Promise<{ client: CodexRpcClient; generation: number }> {
    if (sharedClient?.isAlive()) return { client: sharedClient, generation: clientGeneration };
    if (sharedClientInit) {
        const client = await sharedClientInit;
        return { client, generation: clientGeneration };
    }
    sharedClientInit = (async () => {
        const client = new CodexRpcClient(codexBin);
        await client.request(
            "initialize",
            { clientInfo: { name: "pulse", title: "Pulse AI", version: "1.0" }, capabilities: null },
            INITIALIZE_TIMEOUT_MS
        );
        client.notify("initialized");
        // Approval/elicitation handling is stateless — register once for the
        // process lifetime so tool calls never hang between turns.
        client.onServerRequest((msg) => handleServerRequest(client, msg));
        clientGeneration++;
        sharedClient = client;
        logger.info({ component: "codex-app-server", generation: clientGeneration }, "codex app-server (shared) started");
        return client;
    })();
    try {
        // Bound the init (spawn + initialize handshake) so a wedged startup can
        // never hang the caller forever.
        const client = await withTimeout(sharedClientInit, INITIALIZE_TIMEOUT_MS + 5_000, "codex app-server init");
        return { client, generation: clientGeneration };
    } catch (err) {
        sharedClient = null; // failed/hung startup — don't reuse it
        throw err;
    } finally {
        sharedClientInit = null;
    }
}

/** Kill the shared subprocess (next chat respawns it). Exported for shutdown hooks/tests. */
export function shutdownCodexAppServer(): void {
    sharedClient?.close();
    sharedClient = null;
}

function evictLru(): void {
    if (threadCache.size < THREAD_CACHE_MAX) return;
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [key, entry] of threadCache) {
        if (entry.lastUsed < oldest) {
            oldest = entry.lastUsed;
            oldestKey = key;
        }
    }
    if (oldestKey) threadCache.delete(oldestKey);
}

/**
 * Build a `turn/start` `input` array (codex's `UserInput` union — see
 * `/tmp/codex-proto/v2/UserInput.ts`): one `text` item plus, for each image
 * attachment, an `image` item with the file inlined as a `data:` URL. Inlining
 * (rather than `localImage`'s host path) sidesteps the thread's read-only
 * sandbox policy entirely — the bytes travel over the same stdio pipe as
 * everything else.
 */
async function buildTurnInputItems(
    text: string,
    attachments?: ProviderAttachment[]
): Promise<Array<Record<string, any>>> {
    const items: Array<Record<string, any>> = [{ type: "text", text, text_elements: [] }];
    if (!attachments?.length) return items;

    for (const att of attachments) {
        if (att.type !== "image") continue;
        try {
            const bytes = await readFile(att.path);
            const mime = att.mime || "image/jpeg";
            items.push({ type: "image", url: `data:${mime};base64,${bytes.toString("base64")}`, detail: "auto" });
        } catch (err) {
            logger.warn({ err, path: att.path }, "Failed to read image attachment for Codex; skipping");
        }
    }
    return items;
}

export class CodexAppServerProvider {
    readonly name = "codex";

    constructor(private codexBin: string = process.env.CODEX_BIN || "codex") {}

    async chat(params: {
        model: string;
        tenantId?: string;
        agentProfileId?: string;
        conversationId?: string;
        systemPrompt: string;
        messages: Array<{ role: string; content: string }>;
        timeoutMs?: number;
        /** Images attached to the current turn (e.g. a Telegram photo). */
        attachments?: ProviderAttachment[];
    }): Promise<ProviderResponse> {
        // Serialize only within the same conversation (shared Codex thread);
        // different conversations run concurrently. Each turn is hard-bounded by
        // withTimeout so a hang can never permanently wedge the queue — the
        // chain always advances even if a turn's internal awaits stall.
        const queueKey = params.conversationId
            ? `${params.tenantId ?? "host"}:${params.agentProfileId ?? "none"}:${params.conversationId}`
            : `oneshot:${Math.random()}`; // ephemeral calls never block each other
        const prev = turnQueues.get(queueKey) ?? Promise.resolve();
        const run = () => withTimeout(
            this.runTurn(params),
            TURN_ABSOLUTE_MAX_MS + 30_000,
            "codex turn (overall)",
        ).catch((err) => {
            // An overall-timeout almost always means the shared subprocess is
            // wedged — recycle it so the NEXT turn spawns a clean one instead of
            // inheriting the hang.
            if (/exceeded \d+ms/.test(err?.message ?? "")) shutdownCodexAppServer();
            throw err;
        });
        const result = prev.then(run, run);
        // Keep the queue chain alive on settled state only; prune when idle.
        const tail = result.catch(() => {});
        turnQueues.set(queueKey, tail);
        tail.finally(() => {
            if (turnQueues.get(queueKey) === tail) turnQueues.delete(queueKey);
        });
        return result;
    }

    private async runTurn(params: {
        model: string;
        tenantId?: string;
        agentProfileId?: string;
        conversationId?: string;
        systemPrompt: string;
        messages: Array<{ role: string; content: string }>;
        timeoutMs?: number;
        attachments?: ProviderAttachment[];
    }): Promise<ProviderResponse> {
        // `remaining()` only bounds the short setup RPCs (initialize/thread/turn
        // start); the turn itself is governed by the inactivity watchdog below,
        // not this deadline — so base it on the absolute ceiling, never 120s.
        const deadline = Date.now() + TURN_ABSOLUTE_MAX_MS;
        const remaining = () => Math.max(1000, deadline - Date.now());
        const reasoningEffort = (params as any).reasoningEffort || DEFAULT_REASONING_EFFORT;
        const log = logger.child({ component: "codex-app-server", model: params.model });

        let client: CodexRpcClient;
        let generation: number;
        try {
            ({ client, generation } = await getSharedClient(this.codexBin));
        } catch (err: any) {
            sharedClient = null;
            log.error({ err: err.message }, "Failed to start shared codex app-server");
            throw new Error(`Failed to start "codex app-server": ${err.message}`);
        }

        const cacheKey = params.conversationId
            ? `${params.tenantId ?? "host"}:${params.agentProfileId ?? "none"}:${params.conversationId}`
            : null;

        // Reuse this conversation's thread when it's from the live process
        // generation and its MCP token isn't near expiry.
        let cached = cacheKey ? threadCache.get(cacheKey) : undefined;
        if (cached && (cached.generation !== generation || cached.tokenExpiresAt - Date.now() < MCP_TOKEN_ROTATE_MARGIN_MS)) {
            threadCache.delete(cacheKey!);
            cached = undefined;
        }

        const startThread = async (): Promise<{ threadId: string; tokenExpiresAt: number }> => {
            // Tool access is an enhancement — degrade to plain chat on failure.
            let tenantMcp: TenantMcpConfig | null = null;
            if (params.tenantId) {
                try {
                    tenantMcp = await resolveTenantMcpConfig(params.tenantId, params.agentProfileId, params.conversationId);
                } catch (err: any) {
                    log.warn({ err: err.message, tenantId: params.tenantId }, "Failed to resolve tenant MCP tool config; continuing without tools");
                }
            }
            const threadStart = await client.request(
                "thread/start",
                {
                    model: params.model,
                    cwd: os.tmpdir(),
                    approvalPolicy: "never",
                    sandbox: "read-only",
                    developerInstructions: params.systemPrompt || undefined,
                    // Cached (reusable) threads must not be ephemeral; one-shot
                    // calls without a conversationId keep the ephemeral behavior.
                    ephemeral: cacheKey ? false : true,
                    config: {
                        model_reasoning_effort: reasoningEffort,
                        ...(tenantMcp ? { mcp_servers: tenantMcp.mcpServers } : {}),
                    },
                },
                Math.min(THREAD_START_TIMEOUT_MS, remaining())
            );
            const threadId: string | undefined = threadStart?.thread?.id;
            if (!threadId) {
                throw new Error(
                    `codex thread/start returned no thread id (payload keys: ${Object.keys(threadStart ?? {}).join(", ")})`
                );
            }
            return { threadId, tokenExpiresAt: tenantMcp ? tenantMcp.tokenExpiresAt : Infinity };
        };

        let threadId: string;
        let reusedThread = false;
        if (cached) {
            threadId = cached.threadId;
            reusedThread = true;
        } else {
            const started = await startThread();
            threadId = started.threadId;
            if (cacheKey) {
                evictLru();
                threadCache.set(cacheKey, {
                    threadId,
                    generation,
                    tokenExpiresAt: started.tokenExpiresAt,
                    lastUsed: Date.now(),
                });
            }
        }

        // On a reused thread Codex already holds the history server-side —
        // send only the newest user message. Fresh threads for an ongoing
        // conversation get the full history replayed once.
        const turnTextFor = (reused: boolean) => {
            if (!reused) return buildTurnText(params.messages);
            const lastUser = [...params.messages].reverse().find((m) => m.role === "user" && m.content);
            return lastUser?.content ?? buildTurnText(params.messages);
        };

        const startTurn = async (tid: string, text: string, attachments?: ProviderAttachment[]) =>
            client.request(
                "turn/start",
                { threadId: tid, input: await buildTurnInputItems(text, attachments) },
                Math.min(TURN_START_TIMEOUT_MS, remaining())
            );

        let turnId: string | undefined;
        try {
            turnId = (await startTurn(threadId, turnTextFor(reusedThread), params.attachments))?.turn?.id;
        } catch (err: any) {
            if (reusedThread) {
                // Universal recovery: drop the stale thread, start fresh with
                // full history replay, retry once.
                log.warn({ err: err.message, threadId }, "turn/start failed on cached thread — starting a fresh thread");
                if (cacheKey) threadCache.delete(cacheKey);
                const started = await startThread();
                threadId = started.threadId;
                reusedThread = false;
                if (cacheKey) {
                    evictLru();
                    threadCache.set(cacheKey, {
                        threadId,
                        generation,
                        tokenExpiresAt: started.tokenExpiresAt,
                        lastUsed: Date.now(),
                    });
                }
                turnId = (await startTurn(threadId, turnTextFor(false), params.attachments))?.turn?.id;
            } else {
                const tail = client.stderrTail();
                throw new Error(`codex turn/start failed: ${err.message}${tail ? `\ncodex stderr (tail):\n${tail}` : ""}`);
            }
        }

        // Drain notifications until turn/completed for THIS thread.
        let finalText = "";
        let sawAgentMessage = false;
        const genImages: Array<{ result?: string; savedPath?: string }> = [];
        let usage: { inputTokens: number; outputTokens: number } | null = null;
        let turnError: string | null = null;
        let turnCompleted = false;

        try {
            await new Promise<void>((resolve, reject) => {
                // Inactivity watchdog (NOT a wall-clock turn cap): reset on every
                // streaming notification for this thread. A high-reasoning turn
                // that keeps thinking/streaming is never killed; only true silence
                // (or the absolute backstop) triggers an interrupt.
                let inactivityTimer: NodeJS.Timeout;
                const interruptTurn = (reason: string) => {
                    cleanup();
                    client.request("turn/interrupt", { threadId, turnId }, 3000).catch(() => {
                        shutdownCodexAppServer();
                    });
                    reject(new Error(reason));
                };
                const resetInactivity = () => {
                    clearTimeout(inactivityTimer);
                    inactivityTimer = setTimeout(
                        () => interruptTurn(`codex turn stalled — no activity for ${TURN_INACTIVITY_TIMEOUT_MS}ms`),
                        TURN_INACTIVITY_TIMEOUT_MS
                    );
                };

                const absoluteCeiling = setTimeout(
                    () => interruptTurn(`codex turn exceeded absolute max ${TURN_ABSOLUTE_MAX_MS}ms`),
                    TURN_ABSOLUTE_MAX_MS
                );

                const aliveCheck = setInterval(() => {
                    if (!client.isAlive()) {
                        cleanup();
                        sharedClient = null; // force respawn next call
                        const tail = client.stderrTail();
                        reject(new Error(`codex app-server subprocess exited before turn/completed${tail ? `\ncodex stderr (tail):\n${tail}` : ""}`));
                    }
                }, 500);

                const cleanup = () => {
                    clearTimeout(inactivityTimer);
                    clearTimeout(absoluteCeiling);
                    clearInterval(aliveCheck);
                    client.onNotification(() => {});
                };

                const isOtherThread = (p: any): boolean => {
                    const tid = p?.threadId ?? p?.thread?.id ?? p?.item?.threadId ?? p?.turn?.threadId;
                    return typeof tid === "string" && tid !== threadId;
                };

                resetInactivity(); // arm the watchdog

                client.onNotification((msg) => {
                    if (isOtherThread(msg.params)) return;

                    // Any activity for this thread means Codex is alive and working.
                    resetInactivity();

                    if (msg.method === "thread/tokenUsage/updated") {
                        const last = msg.params?.tokenUsage?.last;
                        if (last) {
                            usage = {
                                inputTokens: (last.inputTokens ?? 0) + (last.cachedInputTokens ?? 0),
                                outputTokens: (last.outputTokens ?? 0) + (last.reasoningOutputTokens ?? 0),
                            };
                        }
                        return;
                    }

                    if (msg.method === "item/completed") {
                        const item = msg.params?.item;
                        if (item?.type === "agentMessage" && typeof item.text === "string") {
                            finalText = item.text;
                            sawAgentMessage = true;
                        }
                        // Codex can generate images natively (ChatGPT plan). Capture
                        // them so they can be delivered to the user's chat instead of
                        // silently dropped with the model claiming success.
                        if (item?.type === "imageGeneration" && (item.result || item.savedPath)) {
                            genImages.push({ result: item.result, savedPath: item.savedPath });
                        }
                        return;
                    }

                    if (msg.method === "turn/completed") {
                        turnCompleted = true;
                        const turn = msg.params?.turn;
                        if (turn?.status && turn.status !== "completed" && turn.status !== "interrupted") {
                            turnError = turn?.error?.message || `codex turn ended with status="${turn.status}"`;
                        }
                        cleanup();
                        resolve();
                    }
                });
            });
        } finally {
            const entry = cacheKey ? threadCache.get(cacheKey) : undefined;
            if (entry) entry.lastUsed = Date.now();
        }

        if (turnError && !sawAgentMessage) {
            const tail = client.stderrTail();
            throw new Error(`${turnError}${tail ? `\ncodex stderr (tail):\n${tail}` : ""}`);
        }

        if (!turnCompleted && !sawAgentMessage) {
            throw new Error("codex turn ended without producing any assistant text");
        }

        let content = finalText || "(Codex returned no text response)";

        // Persist + deliver any natively-generated images (best-effort).
        if (genImages.length && params.tenantId) {
            for (const img of genImages.slice(0, 4)) {
                try {
                    let bytes: Buffer | null = null;
                    if (img.result && !img.result.startsWith("/")) {
                        bytes = Buffer.from(img.result, "base64");
                    } else if (img.savedPath || img.result) {
                        bytes = await readFile((img.savedPath || img.result) as string);
                    }
                    if (!bytes?.length) continue;
                    const agentDir = params.agentProfileId ?? "shared";
                    const dir = join(config.WORKSPACE_BASE_DIR, params.tenantId, agentDir, "images");
                    await mkdir(dir, { recursive: true });
                    const filePath = join(dir, `codex-gen-${Date.now()}.png`);
                    await writeFile(filePath, bytes);
                    const delivery = await sendFileToConversation(params.tenantId, params.conversationId, filePath, "Generated image");
                    log.info({ filePath, delivered: delivery.delivered }, "Codex-generated image captured");
                    if (!delivery.delivered) content += `\n\n(Generated image saved: ${filePath})`;
                } catch (err: any) {
                    log.warn({ err: err.message }, "Failed to persist codex-generated image");
                }
            }
        }

        // Fall back to a length-based estimate if the app-server never sent a
        // thread/tokenUsage/updated notification.
        const resolvedUsage = usage ?? {
            inputTokens: Math.ceil(turnTextFor(reusedThread).length / 4),
            outputTokens: Math.ceil(content.length / 4),
        };

        return {
            content,
            model: params.model,
            usage: resolvedUsage,
        };
    }
}

/**
 * Fold the running conversation into a single text turn. Codex threads
 * normally carry their own history server-side, but this MVP spins up a
 * brand-new ephemeral thread per `chat()` call, so prior turns have to be
 * replayed as plain text instead.
 */
function buildTurnText(messages: Array<{ role: string; content: string }>): string {
    const nonSystem = messages.filter((m) => m.role !== "system" && m.content);
    if (nonSystem.length === 0) return "";
    if (nonSystem.length === 1) return nonSystem[0].content;

    const transcript = nonSystem
        .slice(0, -1)
        .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
        .join("\n\n");
    const last = nonSystem[nonSystem.length - 1];
    return `${transcript}\n\nUser: ${last.content}`;
}
