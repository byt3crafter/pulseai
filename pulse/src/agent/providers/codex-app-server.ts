/**
 * Codex App-Server Provider — runs an agent turn on the user's ChatGPT/Codex
 * *subscription* (no API key), the same way Hermes and OpenClaw drive it.
 *
 * MVP scope: one-shot completion per `chat()` call. Every call spawns a fresh
 * `codex app-server` subprocess, opens a new thread, sends one turn, collects
 * the assistant text, and tears the subprocess down. There is no persistent
 * Codex thread across Pulse messages yet (see docs note in provider-manager
 * registration) — conversation history is folded into the turn's input text
 * instead of relying on Codex's own thread memory.
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
 * minted and handed to the codex subprocess via an env var (never inlined
 * into the JSON-RPC config — codex reads it out of its own process env via
 * `bearer_token_env_var`). Verified live: codex 0.142.1 gates every MCP tool
 * call behind a `mcpServer/elicitation/request` server request (NOT the
 * `item/commandExecution|fileChange/requestApproval` surface, and NOT
 * suppressed by `approvalPolicy: "never"`) — `handleServerRequest()` below
 * auto-accepts that request specifically for Pulse's own server name so
 * tool calls execute headlessly instead of hanging waiting for a human.
 */

import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as os from "os";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { db } from "../../storage/db.js";
import { tenants } from "../../storage/schema.js";
import { mintAppAccessToken } from "../../gateway/oauth.js";
import { ProviderResponse } from "./anthropic.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const INITIALIZE_TIMEOUT_MS = 15_000;
const THREAD_START_TIMEOUT_MS = 20_000;
const TURN_START_TIMEOUT_MS = 15_000;
const STDERR_TAIL_LINES = 60;

// ── Pulse-as-MCP-server wiring (Codex operator mode) ───────────────────────

/** Name the Pulse MCP server is registered under in the thread's mcp_servers config. */
const PULSE_MCP_SERVER_NAME = "pulse";
/** Env var name codex's subprocess reads the bearer token from (never placed in JSON-RPC). */
const PULSE_MCP_TOKEN_ENV_VAR = "PULSE_CODEX_MCP_BEARER_TOKEN";
/**
 * Short-lived on purpose: every `chat()` call spawns a brand-new ephemeral
 * codex subprocess/thread that lives for at most one turn (see class docblock
 * above), so the token only needs to outlive a single turn, not a session.
 */
const MCP_TOKEN_TTL_MS = 15 * 60 * 1000;
/** clientId recorded on the minted oauth_tokens row — identifies the issuer, not an end user. */
const MCP_TOKEN_CLIENT_ID = "pulse-codex-operator";

interface TenantMcpConfig {
    /** Extra env vars to merge into the codex subprocess's environment. */
    env: Record<string, string>;
    /** Value for `thread/start`'s `config.mcp_servers` override. */
    mcpServers: Record<string, unknown>;
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
async function resolveTenantMcpConfig(tenantId: string, agentProfileId?: string): Promise<TenantMcpConfig | null> {
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    const tenantConfig = tenant?.config as Record<string, any> | undefined;
    if (!tenantConfig?.enable_third_party_cli) return null;

    const { token } = await mintAppAccessToken(tenantId, MCP_TOKEN_CLIENT_ID, MCP_TOKEN_TTL_MS);

    // ?agent=<id> scopes the MCP session to that agent's enabled Pulse tools
    // (workspace_update, memory_*, sandbox, custom tools) — operator mode.
    const agentQs = agentProfileId ? `?agent=${encodeURIComponent(agentProfileId)}` : "";

    return {
        env: { [PULSE_MCP_TOKEN_ENV_VAR]: token },
        mcpServers: {
            [PULSE_MCP_SERVER_NAME]: {
                url: `http://127.0.0.1:${config.PORT}/mcp${agentQs}`,
                bearer_token_env_var: PULSE_MCP_TOKEN_ENV_VAR,
            },
        },
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

export class CodexAppServerProvider {
    readonly name = "codex";

    constructor(private codexBin: string = process.env.CODEX_BIN || "codex") {}

    async chat(params: {
        model: string;
        tenantId?: string;
        agentProfileId?: string;
        systemPrompt: string;
        messages: Array<{ role: string; content: string }>;
        timeoutMs?: number;
    }): Promise<ProviderResponse> {
        const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const deadline = Date.now() + timeoutMs;
        const log = logger.child({ component: "codex-app-server", model: params.model });

        // Give this tenant's thread access to Pulse's own tools via MCP when
        // it's allowed to (see resolveTenantMcpConfig docblock). Failure here
        // degrades to plain text chat rather than failing the whole turn —
        // tool access is an enhancement, not a hard requirement.
        let tenantMcp: TenantMcpConfig | null = null;
        if (params.tenantId) {
            try {
                tenantMcp = await resolveTenantMcpConfig(params.tenantId, params.agentProfileId);
            } catch (err: any) {
                log.warn({ err: err.message, tenantId: params.tenantId }, "Failed to resolve tenant MCP tool config; continuing without tools");
            }
        }

        let client: CodexRpcClient;
        try {
            client = new CodexRpcClient(this.codexBin, tenantMcp?.env);
        } catch (err: any) {
            log.error({ err: err.message }, "Failed to spawn codex app-server");
            throw new Error(`Failed to spawn "codex app-server": ${err.message}`);
        }

        try {
            const remaining = () => Math.max(1000, deadline - Date.now());

            // 1. initialize handshake
            await client.request(
                "initialize",
                {
                    clientInfo: { name: "pulse", title: "Pulse AI", version: "1.0" },
                    capabilities: null,
                },
                Math.min(INITIALIZE_TIMEOUT_MS, remaining())
            );
            client.notify("initialized");

            // 2. thread/start — fresh, ephemeral, read-only sandbox, never ask
            // for approval (this is a one-shot text completion, not a coding
            // session with a human able to approve anything). When tool
            // access was resolved above, project it in via the per-thread
            // `config` override (does NOT touch this host's ~/.codex/config.toml).
            const threadStart = await client.request(
                "thread/start",
                {
                    model: params.model,
                    cwd: os.tmpdir(),
                    approvalPolicy: "never",
                    sandbox: "read-only",
                    developerInstructions: params.systemPrompt || undefined,
                    ephemeral: true,
                    ...(tenantMcp ? { config: { mcp_servers: tenantMcp.mcpServers } } : {}),
                },
                Math.min(THREAD_START_TIMEOUT_MS, remaining())
            );
            const threadId: string | undefined = threadStart?.thread?.id;
            if (!threadId) {
                throw new Error(
                    `codex thread/start returned no thread id (payload keys: ${Object.keys(threadStart ?? {}).join(", ")})`
                );
            }

            // 3. turn/start — fold prior conversation into one text input
            // since this MVP re-spawns a brand-new Codex thread per call and
            // has no persistent thread to carry history across messages.
            const turnText = buildTurnText(params.messages);
            let turnId: string | undefined;
            let turnStartResult: any;
            try {
                turnStartResult = await client.request(
                    "turn/start",
                    {
                        threadId,
                        input: [{ type: "text", text: turnText, text_elements: [] }],
                    },
                    Math.min(TURN_START_TIMEOUT_MS, remaining())
                );
                turnId = turnStartResult?.turn?.id;
            } catch (err: any) {
                const tail = client.stderrTail();
                throw new Error(`codex turn/start failed: ${err.message}${tail ? `\ncodex stderr (tail):\n${tail}` : ""}`);
            }

            // 4. drain notifications + server requests until turn/completed.
            let finalText = "";
            let sawAgentMessage = false;
            let usage: { inputTokens: number; outputTokens: number } | null = null;
            let turnError: string | null = null;
            let turnCompleted = false;

            client.onServerRequest((msg) => handleServerRequest(client, msg));

            await new Promise<void>((resolve, reject) => {
                const hardTimeout = setTimeout(() => {
                    cleanup();
                    reject(new Error(`codex turn did not complete within ${timeoutMs}ms`));
                }, remaining());

                const aliveCheck = setInterval(() => {
                    if (!client.isAlive()) {
                        cleanup();
                        const tail = client.stderrTail();
                        reject(new Error(`codex app-server subprocess exited before turn/completed${tail ? `\ncodex stderr (tail):\n${tail}` : ""}`));
                    }
                }, 500);

                const cleanup = () => {
                    clearTimeout(hardTimeout);
                    clearInterval(aliveCheck);
                    client.onNotification(() => {});
                };

                client.onNotification((msg) => {
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

            if (turnError && !sawAgentMessage) {
                const tail = client.stderrTail();
                throw new Error(`${turnError}${tail ? `\ncodex stderr (tail):\n${tail}` : ""}`);
            }

            if (!turnCompleted && !sawAgentMessage) {
                throw new Error("codex turn ended without producing any assistant text");
            }

            const content = finalText || "(Codex returned no text response)";

            // Fall back to a length-based estimate if the app-server never
            // sent a thread/tokenUsage/updated notification (e.g. older
            // builds, or the turn errored before usage was reported).
            const resolvedUsage = usage ?? {
                inputTokens: Math.ceil(turnText.length / 4),
                outputTokens: Math.ceil(content.length / 4),
            };

            return {
                content,
                model: params.model,
                usage: resolvedUsage,
            };
        } finally {
            client.close();
        }
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
