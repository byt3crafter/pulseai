/**
 * Codex App-Server Provider — runs an agent turn on the user's ChatGPT/Codex
 * *subscription* (no API key), the same way Hermes and OpenClaw drive it.
 *
 * Persistent harness (OpenClaw/Hermes-style "one client per session"): a POOL
 * of `codex app-server` subprocesses, ONE PER CONVERSATION. Each holds its own
 * Codex thread (history server-side, so turn 2+ skips cold start) and its own
 * serial turn queue. Different conversations run on different subprocesses →
 * true parallelism with no cross-talk; same-conversation turns serialize
 * (a client has a single notification slot). See the pool docs below.
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
import { createHash } from "node:crypto";
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
// Verbose: log the agent's reasoning/plan trace. Off by default (private
// reasoning shouldn't hit logs unless an operator opts in for debugging).
const CODEX_VERBOSE = process.env.CODEX_VERBOSE === "true";
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
/** Max concurrent codex subprocesses (one per active conversation); LRU-evicted
 *  beyond this. Each is a real process (~50-100MB), so keep it modest. */
const POOL_MAX = Number(process.env.CODEX_POOL_MAX) || 16;

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

/**
 * ONE codex app-server PROCESS PER CONVERSATION (the Hermes/OpenClaw model:
 * "one client per session"). Each pool entry owns its own subprocess, its own
 * Codex thread, and its own serial turn queue. This is what makes concurrency
 * SAFE: CodexRpcClient has a single notification-handler slot, so a client can
 * only ever drive ONE turn at a time — but different conversations use
 * different clients, so their turns run in TRUE PARALLEL with zero cross-talk.
 * (The earlier single-shared-process design had to serialize everything and
 * still cross-contaminated when it didn't — this fixes the root cause.)
 */
interface PoolEntry {
    client: CodexRpcClient | null;
    clientInit: Promise<CodexRpcClient> | null;
    threadId?: string;
    /**
     * Hash of the developerInstructions this thread was STARTED with.
     *
     * Codex takes the system prompt once, at thread/start, and a reused thread
     * never sees it again. Without this, changing an agent's skills, persona or
     * standing orders had no effect on a live conversation — the thread kept
     * whatever it was created with until the process restarted, which made
     * settings look broken in a way nothing in the logs explained.
     */
    promptHash?: string;
    tokenExpiresAt: number;
    lastUsed: number;
    queue: Promise<unknown>; // serializes turns within THIS conversation
    busyCount: number; // in-flight turns; eviction must not kill a busy entry
}
const pool = new Map<string, PoolEntry>();
let oneshotCounter = 0;

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

function getPoolEntry(key: string): PoolEntry {
    let e = pool.get(key);
    if (!e) {
        evictPool();
        e = { client: null, clientInit: null, tokenExpiresAt: Infinity, lastUsed: Date.now(), queue: Promise.resolve(), busyCount: 0 };
        pool.set(key, e);
    }
    return e;
}

/** Ensure the entry has a live, initialized codex client (lazy spawn per conversation). */
async function ensureClient(entry: PoolEntry, codexBin: string): Promise<CodexRpcClient> {
    if (entry.client?.isAlive()) return entry.client;
    // Dead/absent client → its server-side thread is gone too.
    entry.client = null;
    entry.threadId = undefined;
    if (!entry.clientInit) {
        entry.clientInit = (async () => {
            const client = new CodexRpcClient(codexBin);
            await client.request(
                "initialize",
                { clientInfo: { name: "pulse", title: "Pulse AI", version: "1.0" }, capabilities: null },
                INITIALIZE_TIMEOUT_MS
            );
            client.notify("initialized");
            // Approval/elicitation handling is stateless — register once per client.
            client.onServerRequest((msg) => handleServerRequest(client, msg));
            entry.client = client;
            logger.info({ component: "codex-app-server" }, "codex app-server client started (per-conversation)");
            return client;
        })();
    }
    try {
        return await withTimeout(entry.clientInit, INITIALIZE_TIMEOUT_MS + 5_000, "codex app-server init");
    } catch (err) {
        entry.client = null; // failed/hung startup — don't reuse it
        throw err;
    } finally {
        entry.clientInit = null;
    }
}

/** Cap the number of concurrent codex processes; close the least-recently-used. */
function evictPool(): void {
    if (pool.size < POOL_MAX) return;
    // Prefer the least-recently-used IDLE entry — never evict one with a turn in
    // flight (that would kill a running conversation mid-turn). Only if every
    // entry is busy do we fall back to the oldest, and log it.
    let oldestKey: string | null = null;
    let oldest = Infinity;
    let oldestBusyKey: string | null = null;
    let oldestBusy = Infinity;
    for (const [key, entry] of pool) {
        if (entry.busyCount > 0) {
            if (entry.lastUsed < oldestBusy) { oldestBusy = entry.lastUsed; oldestBusyKey = key; }
            continue;
        }
        if (entry.lastUsed < oldest) { oldest = entry.lastUsed; oldestKey = key; }
    }
    const evictKey = oldestKey ?? oldestBusyKey;
    if (!oldestKey && oldestBusyKey) {
        logger.warn({ component: "codex-app-server", poolSize: pool.size }, "codex pool full and every entry busy — evicting a busy conversation");
    }
    if (evictKey) {
        pool.get(evictKey)?.client?.close();
        pool.delete(evictKey);
    }
}

/** Kill ALL codex subprocesses (next chats respawn per conversation). Exported for shutdown/tests. */
export function shutdownCodexAppServer(): void {
    for (const entry of pool.values()) entry.client?.close();
    pool.clear();
}

// ── Live model list (the OpenClaw approach) ─────────────────────────────────
//
// The Codex/ChatGPT catalogue used to be a hardcoded snapshot in
// model-registry.ts — it went stale the moment OpenAI shipped a new model
// (e.g. GPT-5.6-Sol), so the picker never showed the latest. The app-server
// exposes `model/list`, exactly what the Codex CLI itself uses to populate its
// model picker; we call it and cache the result. Where there is no ChatGPT
// login (a plain server, or a container with no `~/.codex/auth.json`) the call
// fails and the caller falls back to the static list — so this never makes the
// picker EMPTIER than before, only fresher when a login is present.

export interface CodexModel {
    id: string;
    displayName: string;
    description?: string;
}

let modelCache: { at: number; models: CodexModel[] } | null = null;
let modelInflight: Promise<CodexModel[] | null> | null = null;
const MODEL_CACHE_TTL_MS = 10 * 60_000; // models change rarely; 10 min is plenty
const MODEL_FAIL_TTL_MS = 60_000; // when unavailable, don't respawn on every keystroke

/**
 * The live Codex/ChatGPT model catalogue via `model/list`, or null when Codex
 * is unavailable here (no binary, no login). Cached; safe to call often. Never
 * throws — a picker asking "what models?" must not crash on a missing login.
 */
export async function listCodexModels(
    codexBin: string = process.env.CODEX_BIN || "codex",
): Promise<CodexModel[] | null> {
    const now = Date.now();
    if (modelCache && now - modelCache.at < MODEL_CACHE_TTL_MS) {
        // A cached empty array means "asked recently, none available" — honour
        // the shorter fail-TTL so a fresh login is picked up within a minute.
        if (modelCache.models.length > 0 || now - modelCache.at < MODEL_FAIL_TTL_MS) {
            return modelCache.models.length ? modelCache.models : null;
        }
    }
    if (modelInflight) return modelInflight;

    modelInflight = (async () => {
        let client: CodexRpcClient | null = null;
        try {
            client = new CodexRpcClient(codexBin);
            await client.request(
                "initialize",
                { clientInfo: { name: "pulse", title: "Pulse AI", version: "1.0" }, capabilities: null },
                INITIALIZE_TIMEOUT_MS,
            );
            client.notify("initialized");
            const res = await client.request("model/list", { includeHidden: false }, INITIALIZE_TIMEOUT_MS);
            const data: any[] = Array.isArray(res?.data) ? res.data : [];
            const models: CodexModel[] = data
                .filter((m) => m && typeof m.id === "string" && !m.hidden)
                .map((m) => ({
                    id: m.id,
                    displayName: typeof m.displayName === "string" && m.displayName ? m.displayName : m.id,
                    description: typeof m.description === "string" ? m.description : undefined,
                }));
            modelCache = { at: Date.now(), models };
            return models.length ? models : null;
        } catch (err: any) {
            logger.info(
                { component: "codex-app-server", err: err?.message },
                "codex model/list unavailable — falling back to static list",
            );
            modelCache = { at: Date.now(), models: [] };
            return null;
        } finally {
            try { client?.close(); } catch { /* already dead */ }
            modelInflight = null;
        }
    })();
    return modelInflight;
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
        /** Live progress callback — invoked as the agent calls tools / reasons,
         *  so the channel can show "working…" activity during long turns. */
        onProgress?: (text: string) => void;
        progressVerbosity?: string;
    }): Promise<ProviderResponse> {
        // Per-conversation pooling: same-conversation turns serialize on this
        // entry's queue (its client has one notification slot); DIFFERENT
        // conversations use different entries/clients and run in true parallel.
        // Each turn is hard-bounded by withTimeout so a hang can't wedge the
        // queue — the chain always advances even if internal awaits stall.
        const poolKey = params.conversationId
            ? `${params.tenantId ?? "host"}:${params.agentProfileId ?? "none"}:${params.conversationId}`
            : `oneshot:${++oneshotCounter}`;
        const entry = getPoolEntry(poolKey);
        const run = () => withTimeout(
            this.runTurn(params, poolKey, entry),
            TURN_ABSOLUTE_MAX_MS + 30_000,
            "codex turn (overall)",
        ).catch((err) => {
            // An overall-timeout almost always means THIS conversation's
            // subprocess is wedged — recycle just it (not everyone else's).
            if (/exceeded \d+ms/.test(err?.message ?? "")) {
                entry.client?.close();
                entry.client = null;
                entry.threadId = undefined;
            }
            throw err;
        });
        entry.busyCount++;
        const result = entry.queue.then(run, run);
        entry.queue = result.catch(() => {});
        result.finally(() => { entry.busyCount--; }).catch(() => {});
        // Ephemeral (no conversationId) entries are throwaway — close + drop after use.
        if (!params.conversationId) {
            entry.queue.finally(() => {
                entry.client?.close();
                pool.delete(poolKey);
            });
        }
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
        onProgress?: (text: string) => void;
        progressVerbosity?: string;
    }, poolKey: string, entry: PoolEntry): Promise<ProviderResponse> {
        // `remaining()` only bounds the short setup RPCs (initialize/thread/turn
        // start); the turn itself is governed by the inactivity watchdog below,
        // not this deadline — so base it on the absolute ceiling, never 120s.
        const deadline = Date.now() + TURN_ABSOLUTE_MAX_MS;
        const remaining = () => Math.max(1000, deadline - Date.now());
        const reasoningEffort = (params as any).reasoningEffort || DEFAULT_REASONING_EFFORT;
        const log = logger.child({ component: "codex-app-server", model: params.model });

        let client: CodexRpcClient;
        try {
            client = await ensureClient(entry, this.codexBin);
        } catch (err: any) {
            log.error({ err: err.message }, "Failed to start codex app-server client");
            throw new Error(`Failed to start "codex app-server": ${err.message}`);
        }

        // Reuse this conversation's thread (on this entry's own client) unless
        // its MCP token is near expiry. A reusable conversation is any non-
        // ephemeral pool key.
        const reusable = !poolKey.startsWith("oneshot:");
        const cacheKey = reusable ? poolKey : null;
        let cached = (reusable && entry.threadId) ? { threadId: entry.threadId, tokenExpiresAt: entry.tokenExpiresAt } : undefined;
        if (cached && cached.tokenExpiresAt - Date.now() < MCP_TOKEN_ROTATE_MARGIN_MS) {
            entry.threadId = undefined;
            cached = undefined;
        }

        /*
         * Start a new thread when the instructions have changed.
         *
         * This is the only way a settings change reaches a live Codex
         * conversation: developerInstructions are read once at thread/start, so
         * a reused thread is frozen with the prompt it was born with. Assigning
         * a skill, editing a persona or changing a standing order would
         * otherwise do nothing until the gateway restarted.
         *
         * A thread restart costs one round-trip and loses no history — the
         * conversation is replayed from our own store, not Codex's.
         */
        const promptHash = createHash("sha256").update(params.systemPrompt || "").digest("hex").slice(0, 16);
        if (cached && entry.promptHash !== promptHash) {
            log.info(
                { conversationId: params.conversationId, was: entry.promptHash, now: promptHash },
                "System prompt changed — starting a fresh Codex thread so the change takes effect",
            );
            entry.threadId = undefined;
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
                entry.threadId = threadId;
                entry.promptHash = promptHash;
                entry.tokenExpiresAt = started.tokenExpiresAt;
                entry.lastUsed = Date.now();
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
                entry.threadId = undefined;
                const started = await startThread();
                threadId = started.threadId;
                reusedThread = false;
                if (cacheKey) {
                    entry.threadId = threadId;
                    entry.tokenExpiresAt = started.tokenExpiresAt;
                    entry.lastUsed = Date.now();
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
                        // Recycle ONLY this conversation's wedged subprocess — never
                        // shutdownCodexAppServer(), which would tear down every other
                        // tenant's in-flight turn. Next call for this conversation
                        // respawns its client (same as the overall-timeout path).
                        try { client.close(); } catch { /* already dead */ }
                        entry.client = null;
                        entry.threadId = undefined;
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
                        entry.client = null; // this conversation's client died → respawn next call
                        entry.threadId = undefined;
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

                const onProgress = params.onProgress;
                // Pull the most meaningful single detail out of a tool's args so
                // progress reads like a terminal ("server_exec  df -h") instead of
                // a bare tool name.
                const detailOf = (args: any): string => {
                    if (!args || typeof args !== "object") return "";
                    const prefer = ["command", "url", "query", "path", "to", "subject", "prompt", "name", "doctype", "selector"];
                    let v: any;
                    for (const k of prefer) { if (typeof args[k] === "string" && args[k]) { v = args[k]; break; } }
                    if (v === undefined) v = Object.values(args).find((x) => typeof x === "string" && x);
                    if (typeof v !== "string") return "";
                    return v.replace(/\s+/g, " ").trim().slice(0, 64);
                };
                const emitProgress = (item: any) => {
                    if (!onProgress || !item?.type) return;
                    try {
                        // Reasoning ("thinking") is intentionally dropped — it's noise;
                        // real actions are the signal.
                        if (item.type === "mcpToolCall") {
                            const d = detailOf(item.arguments);
                            onProgress(`${item.tool || "tool"}${d ? "  " + d : ""}`);
                        } else if (item.type === "commandExecution") {
                            const d = detailOf(item);
                            onProgress(`$ ${d || "command"}`);
                        } else if (item.type === "webSearch") {
                            onProgress(`web_search  ${detailOf(item) || ""}`.trim());
                        } else if (item.type === "fileChange") {
                            onProgress("edit files");
                        } else if (item.type === "reasoning" && params.progressVerbosity === "verbose") {
                            const sum = Array.isArray(item.summary) ? item.summary.join(" ") : "";
                            onProgress(`💭 ${(sum || "reasoning").replace(/\s+/g, " ").trim().slice(0, 80)}`);
                        }
                    } catch { /* progress is best-effort */ }
                };

                client.onNotification((msg) => {
                    if (isOtherThread(msg.params)) return;

                    // Any activity for this thread means Codex is alive and working.
                    resetInactivity();

                    // Progress: surface tool/reasoning activity as it STARTS so the
                    // human sees the agent working during a long, silent turn.
                    if (msg.method === "item/started") {
                        emitProgress(msg.params?.item);
                        return;
                    }

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
                        // Verbose: surface the agent's reasoning ("thinking") + its
                        // plan/tool-use trace to the logs. Codex emits a dedicated
                        // `reasoning` thread-item; log it so operators can see HOW an
                        // agent reached its answer (gated by CODEX_VERBOSE to avoid
                        // noise + keep private reasoning out of logs by default).
                        if (CODEX_VERBOSE) {
                            const summary = item?.summary || item?.text;
                            if (item?.type === "reasoning" && summary) {
                                log.info({ threadId, reasoning: String(summary).slice(0, 2000) }, "codex reasoning");
                            } else if (item?.type === "plan" && item?.plan) {
                                log.info({ threadId, plan: item.plan }, "codex plan");
                            }
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
            entry.lastUsed = Date.now();
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
