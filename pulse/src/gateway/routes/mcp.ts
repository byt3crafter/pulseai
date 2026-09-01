import { FastifyPluginAsync } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { db } from "../../storage/db.js";
import { oauthTokens, tenants, conversations, messages, agentProfiles } from "../../storage/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { z } from "zod";
import { InboundMessage } from "../../channels/types.js";
import { AgentRuntime } from "../../agent/runtime.js";
import { ToolRegistry } from "../../agent/tools/registry.js";
import { ensureToolApproved } from "../../agent/tools/approval-gate.js";
import { recordConversationToolCall } from "../../agent/run-recorder.js";
import {
    parseToolSearchConfig, rankDeferredTools, formatSearchResult,
    toolSearchDefinition, TOOL_SEARCH_NAME,
} from "../../agent/tools/tool-search.js";
import type { Tool } from "../../agent/tools/tool.interface.js";
import { logger } from "../../utils/logger.js";

// Registry instance for agent-scoped MCP sessions (reads enablement from DB per call).
const mcpToolRegistry = new ToolRegistry();

/**
 * Partition a tool list into what to register and what to skip, deduping by
 * name against `reservedNames` and against earlier entries. The MCP SDK's
 * `mcp.tool()` THROWS on a duplicate name, and a Codex agent's enabled-tool
 * list legitimately carries the same name twice (a tool that exists as both a
 * built-in and a plugin). Registering blindly threw and aborted the whole
 * exposure, leaving the agent with no tools; this makes the dedup explicit and
 * testable. First occurrence wins; later duplicates land in `skipped`.
 */
/*
 * Progressive tool disclosure for the Codex bridge.
 *
 * Codex gets its Pulse tools over MCP, and the bridge used to register EVERY
 * enabled tool (111 for a fully-loaded agent) — ~48k prompt tokens the model
 * re-reads on every single turn, which is most of why Codex felt slow. The
 * native provider path already trims via tool-search; the MCP bridge never did.
 *
 * Now the bridge registers only what THIS question needs: a tiny always-core
 * set + tools whose name/description match the user's latest message + a
 * `tool_search` meta-tool. Everything else is deferred and revealed on demand
 * (registering a tool after connect auto-sends tools/list_changed). "hello" →
 * ~8 tools, fast; "check the erpnext invoice" → core + erpnext_* tools.
 */
const CODEX_CORE_TOOLS = new Set([
    "get_current_time", "memory_search", "memory_store", "notify",
    "delegate_to_agent", "list_agents", "activity_log", "pulse_help",
]);
const LEAN_TOOL_THRESHOLD = 20; // below this, registering everything is cheap — don't bother

/** Relevance of a tool to the user's message tokens (name weighed over desc). */
function scoreToolByTokens(tool: { name: string; description?: string }, tokens: string[]): number {
    const name = tool.name.toLowerCase();
    const desc = (tool.description || "").toLowerCase();
    let s = 0;
    for (const tok of tokens) {
        // Stem a trailing plural 's' so "servers" matches server_list/server_exec,
        // "invoices" matches erpnext invoice tools, etc. — a real query is plural
        // far more often than a tool name is.
        const stem = tok.endsWith("s") && tok.length > 3 ? tok.slice(0, -1) : tok;
        if (name.includes(tok) || name.includes(stem)) s += 3;
        else if (desc.includes(tok) || desc.includes(stem)) s += 1;
    }
    return s;
}

// Words that must NOT drive tool relevance. Without this, "do you have access
// to any servers" matched ~50 tools because "access"/"have"/"any"/"you" appear
// in dozens of tool descriptions — defeating the whole point. Only meaningful
// nouns/verbs should pull a tool in.
const STOPWORDS = new Set([
    "the", "and", "for", "you", "your", "are", "can", "have", "has", "will", "would",
    "could", "should", "any", "all", "some", "was", "were", "with", "that", "this",
    "there", "their", "them", "they", "what", "when", "where", "who", "why", "how",
    "please", "tell", "give", "show", "let", "get", "got", "make", "need", "want",
    "access", "use", "using", "used", "help", "know", "about", "into", "from", "out",
    "now", "just", "like", "than", "then", "but", "not", "yes", "hey", "hello", "man",
    "one", "two", "our", "own", "its", "his", "her", "him", "she", "does", "did", "done",
]);

// Never register more than this many tools up front — even a broad question
// shouldn't blow the context back up. Extras stay deferred behind tool_search.
const MAX_INITIAL_MATCHES = 12;

/**
 * Split a tool list into what to register up front (`initial`) vs what to defer
 * behind tool_search (`deferred`), for a given question. Always-core tools plus
 * the top few tools whose name/description match the question's MEANINGFUL words
 * (stopwords removed) are initial; everything else is deferred. Pure + exported
 * so the selection is unit-tested.
 */
export function selectLeanToolset<T extends { name: string; description?: string }>(
    tools: T[],
    query: string,
    coreNames: Set<string>,
): { initial: T[]; deferred: T[] } {
    const tokens = query.toLowerCase().split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w));

    const core: T[] = [];
    const scored: { tool: T; score: number }[] = [];
    const rest: T[] = [];
    for (const tool of tools) {
        if (coreNames.has(tool.name)) { core.push(tool); continue; }
        const score = tokens.length ? scoreToolByTokens(tool, tokens) : 0;
        if (score > 0) scored.push({ tool, score });
        else rest.push(tool);
    }
    // Best-matching tools first, capped — the long tail stays searchable.
    scored.sort((a, b) => b.score - a.score);
    const matched = scored.slice(0, MAX_INITIAL_MATCHES).map((s) => s.tool);
    const overflow = scored.slice(MAX_INITIAL_MATCHES).map((s) => s.tool);
    return { initial: [...core, ...matched], deferred: [...overflow, ...rest] };
}

export function dedupeToolsForMcp<T extends { name: string }>(
    tools: T[],
    reservedNames: string[] = [],
): { toRegister: T[]; skipped: string[] } {
    const seen = new Set(reservedNames);
    const toRegister: T[] = [];
    const skipped: string[] = [];
    for (const tool of tools) {
        if (seen.has(tool.name)) {
            skipped.push(tool.name);
            continue;
        }
        seen.add(tool.name);
        toRegister.push(tool);
    }
    return { toRegister, skipped };
}

/**
 * Convert a tool's JSON-schema `parameters` into a Zod raw shape the MCP SDK
 * accepts. Top-level properties only (string/number/boolean/array/object),
 * which covers Pulse's built-in tool schemas.
 */
function jsonSchemaToZodShape(schema: any): Record<string, z.ZodTypeAny> {
    const shape: Record<string, z.ZodTypeAny> = {};
    const props = schema?.properties || {};
    const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
    for (const [key, raw] of Object.entries<any>(props)) {
        let t: z.ZodTypeAny;
        switch (raw?.type) {
            case "string": t = raw.enum ? z.enum(raw.enum as [string, ...string[]]) : z.string(); break;
            case "number":
            case "integer": t = z.number(); break;
            case "boolean": t = z.boolean(); break;
            case "array": t = z.array(z.any()); break;
            case "object": t = z.record(z.string(), z.any()); break;
            default: t = z.any();
        }
        if (raw?.description) t = t.describe(String(raw.description));
        shape[key] = required.includes(key) ? t : t.optional();
    }
    return shape;
}

// Per-session transport + server instances
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

/**
 * Resolve a Bearer token to a tenantId.
 * Returns null if the token is invalid, expired, or the tenant has CLI access disabled.
 */
async function resolveToken(authHeader: string | undefined): Promise<{ tenantId: string } | null> {
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const record = await db.query.oauthTokens.findFirst({
        where: eq(oauthTokens.accessToken, tokenHash),
    });

    if (!record || record.expiresAt < new Date()) return null;

    // Verify tenant has third-party CLI enabled
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, record.tenantId),
    });

    const tenantConfig = tenant?.config as Record<string, any>;
    if (!tenantConfig?.enable_third_party_cli) return null;

    return { tenantId: record.tenantId };
}

/**
 * Create a new McpServer instance with tools scoped to a tenant.
 * When `agentProfileId` is provided (Codex operator mode — the codex provider
 * appends ?agent=<id> to the mcp_servers URL), the agent's own enabled Pulse
 * tools (workspace_update, memory_*, sandbox, custom tools, …) are also
 * exposed, so a Codex-backed agent is an operator, not just a chat box.
 */
async function createMcpServer(tenantId: string, agentRuntime: AgentRuntime, agentProfileId?: string, conversationId?: string): Promise<McpServer> {
    const mcp = new McpServer(
        { name: "pulse-ai", version: "1.0.0" },
        { capabilities: { tools: {} } },
    );

    // ── Tool: send_message ─────────────────────────────────────────
    mcp.tool(
        "send_message",
        "Send a message to the tenant's AI agent and get a response",
        { message: z.string().describe("The message to send to the AI agent"), conversation_id: z.string().optional().describe("Optional conversation ID to continue an existing conversation") },
        async ({ message, conversation_id }) => {
            // Resolve or create conversation
            let conversationId = conversation_id;
            const channelContactId = `mcp-${tenantId}`;

            if (!conversationId) {
                // Look for an existing MCP conversation or create one
                let conversation = await db.query.conversations.findFirst({
                    where: and(
                        eq(conversations.tenantId, tenantId),
                        eq(conversations.channelType, "mcp"),
                        eq(conversations.channelContactId, channelContactId),
                    ),
                });

                if (!conversation) {
                    const [inserted] = await db.insert(conversations).values({
                        tenantId,
                        channelType: "mcp",
                        channelContactId,
                        contactName: "Claude Code",
                    }).returning();
                    conversation = inserted;
                }

                conversationId = conversation.id;
            }

            // Build InboundMessage
            const inbound: InboundMessage = {
                id: randomUUID(),
                tenantId,
                channelType: "webchat", // Use webchat to avoid allowlist checks
                channelContactId,
                contactName: "Claude Code",
                content: message,
                raw: {},
                receivedAt: new Date(),
            };

            // Capture the agent response via callback
            let responseText = "";

            await agentRuntime.processMessage(inbound, async (outbound) => {
                responseText = outbound.content;
                return { channelMessageId: randomUUID() };
            });

            return {
                content: [{ type: "text" as const, text: responseText || "(No response from agent)" }],
            };
        },
    );

    // ── Tool: list_conversations ───────────────────────────────────
    mcp.tool(
        "list_conversations",
        "List recent conversations for this tenant",
        { limit: z.number().optional().default(20).describe("Maximum number of conversations to return") },
        async ({ limit }) => {
            const results = await db.query.conversations.findMany({
                where: eq(conversations.tenantId, tenantId),
                orderBy: [desc(conversations.updatedAt)],
                limit: Math.min(limit, 50),
            });

            const items = results.map((c) => ({
                id: c.id,
                channel: c.channelType,
                contact: c.contactName || c.channelContactId,
                status: c.status,
                updated_at: c.updatedAt?.toISOString(),
            }));

            return {
                content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
            };
        },
    );

    // ── Tool: get_conversation ─────────────────────────────────────
    mcp.tool(
        "get_conversation",
        "Get messages from a specific conversation",
        {
            conversation_id: z.string().describe("The conversation ID to retrieve messages from"),
            limit: z.number().optional().default(20).describe("Maximum number of messages to return"),
        },
        async ({ conversation_id, limit }) => {
            // Verify the conversation belongs to this tenant
            const conversation = await db.query.conversations.findFirst({
                where: and(
                    eq(conversations.id, conversation_id),
                    eq(conversations.tenantId, tenantId),
                ),
            });

            if (!conversation) {
                return {
                    content: [{ type: "text" as const, text: "Conversation not found or access denied." }],
                    isError: true,
                };
            }

            const msgs = await db.query.messages.findMany({
                where: eq(messages.conversationId, conversation_id),
                orderBy: [desc(messages.createdAt)],
                limit: Math.min(limit, 100),
            });

            msgs.reverse(); // Chronological order

            const items = msgs.map((m) => ({
                role: m.role,
                content: m.content,
                created_at: m.createdAt?.toISOString(),
            }));

            return {
                content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
            };
        },
    );

    // ── Agent-scoped tools (Codex operator mode) ────────────────────
    if (agentProfileId) {
        try {
            const agentTools = await mcpToolRegistry.getEnabledTools(tenantId, agentProfileId);
            // Dedupe by name against the conversation tools already registered
            // above AND against each other. getEnabledTools can return the SAME
            // name twice (e.g. commitment_create exists both as a built-in and in
            // the commitments plugin). mcp.tool() THROWS on a duplicate, and that
            // one throw used to abort the whole loop — leaving a Codex agent with
            // NONE of the tools listed after the dupe, including
            // server_list/server_exec. Skip repeats; keep the rest.
            const { toRegister, skipped } = dedupeToolsForMcp(
                agentTools,
                ["send_message", "list_conversations", "get_conversation", TOOL_SEARCH_NAME],
            );
            for (const name of skipped) {
                logger.warn({ tenantId, agentProfileId, tool: name }, "Skipping duplicate agent tool on MCP session");
            }

            // Registers ONE Pulse tool onto this MCP session, isolated so a single
            // bad tool can never take down the rest, and idempotent so the reveal
            // path can't double-register. Returns true only when it just added it.
            const registeredNames = new Set<string>();
            const registerOne = (tool: Tool): boolean => {
                if (registeredNames.has(tool.name)) return false;
                try {
                    mcp.tool(
                        tool.name,
                        tool.description,
                        jsonSchemaToZodShape(tool.parameters),
                        async (args: Record<string, any>) => {
                            try {
                                // Hard approval gate (same as the native runtime path): a tool
                                // marked "ask" in the agent's Tool Policy must be approved first.
                                const gate = await ensureToolApproved({ tenantId, agentProfileId, toolName: tool.name, args });
                                if (!gate.ok) {
                                    return { content: [{ type: "text" as const, text: gate.message }], isError: true };
                                }
                                const toolStart = Date.now();
                                const result = await tool.execute({
                                    tenantId,
                                    conversationId: conversationId || `codex-mcp-${agentProfileId}`,
                                    args: { ...args, _agentId: agentProfileId },
                                });
                                recordConversationToolCall(conversationId, tool.name, true, Date.now() - toolStart);
                                logger.info(
                                    { tenantId, agentProfileId, tool: tool.name, resultHead: String(result.result).slice(0, 200) },
                                    "Agent MCP tool executed",
                                );
                                return { content: [{ type: "text" as const, text: result.result }] };
                            } catch (err: any) {
                                recordConversationToolCall(conversationId, tool.name, false, 0);
                                logger.error({ err, tool: tool.name, tenantId, agentProfileId }, "Agent MCP tool failed");
                                return { content: [{ type: "text" as const, text: `Tool error: ${err?.message || "unknown"}` }], isError: true };
                            }
                        },
                    );
                    registeredNames.add(tool.name);
                    return true;
                } catch (regErr: any) {
                    logger.error(
                        { regErr: regErr?.message, tool: tool.name, tenantId, agentProfileId },
                        "Failed to register one agent tool on MCP session — skipping it, keeping the rest",
                    );
                    return false;
                }
            };

            // The user's latest message drives which tools are relevant this turn.
            let query = "";
            if (conversationId) {
                const last = await db.query.messages.findFirst({
                    where: eq(messages.conversationId, conversationId),
                    orderBy: [desc(messages.createdAt)],
                });
                query = (last?.content as string) || "";
            }

            const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
            const tsConfig = parseToolSearchConfig(tenant?.config);
            // Only trim when there's a real question to trim against and enough
            // tools to matter; otherwise register everything (old behavior) so a
            // tool-less CLI session or a huge-context turn is never surprised.
            const leanActive = tsConfig.mode !== "off" && !!query.trim() && toRegister.length > LEAN_TOOL_THRESHOLD;

            let deferred: Tool[] = [];
            if (leanActive) {
                const split = selectLeanToolset(toRegister, query, CODEX_CORE_TOOLS);
                deferred = split.deferred;
                for (const tool of split.initial) registerOne(tool);
                // tool_search: the escape hatch. When the lean set doesn't cover
                // the task, the agent describes what it needs and the matches are
                // registered live (auto tools/list_changed) so it can call them.
                try {
                    mcp.tool(
                        TOOL_SEARCH_NAME,
                        toolSearchDefinition().description,
                        { query: z.string().describe("What you want to do, in plain language.") },
                        async ({ query: q }: { query: string }) => {
                            const stillDeferred = deferred.filter((t) => !registeredNames.has(t.name));
                            const { matches, total } = rankDeferredTools(stillDeferred, q, tsConfig.maxResults);
                            let revealed = 0;
                            for (const m of matches) if (registerOne(m)) revealed++;
                            logger.info({ tenantId, agentProfileId, query: q, revealed, remaining: total }, "tool_search revealed tools");
                            return { content: [{ type: "text" as const, text: formatSearchResult(matches, total, q) }] };
                        },
                    );
                    registeredNames.add(TOOL_SEARCH_NAME);
                } catch (regErr: any) {
                    logger.error({ regErr: regErr?.message, tenantId, agentProfileId }, "Failed to register tool_search on MCP session");
                }
            } else {
                for (const tool of toRegister) registerOne(tool);
            }

            logger.info(
                {
                    tenantId, agentProfileId,
                    registered: registeredNames.size, requested: agentTools.length,
                    lean: leanActive, deferred: deferred.length,
                },
                "Agent tools exposed on MCP session",
            );
        } catch (err) {
            logger.error({ err, tenantId, agentProfileId }, "Failed to expose agent tools on MCP session");
        }
    }

    return mcp;
}

export const mcpRoutes: FastifyPluginAsync = async (fastify) => {
    // ── POST /mcp — Main JSON-RPC endpoint ─────────────────────────
    fastify.post("/mcp", async (request, reply) => {
        const auth = await resolveToken(request.headers.authorization);
        if (!auth) {
            return reply.code(401).send({
                jsonrpc: "2.0",
                error: { code: -32001, message: "Unauthorized: invalid or expired token" },
                id: null,
            });
        }

        const agentRuntime = (fastify as any).agentRuntime as AgentRuntime;
        if (!agentRuntime) {
            return reply.code(500).send({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Agent runtime not available" },
                id: null,
            });
        }

        const sessionId = request.headers["mcp-session-id"] as string | undefined;
        const existingSession = sessionId ? sessions.get(sessionId) : undefined;

        if (existingSession) {
            // Reuse existing session
            await existingSession.transport.handleRequest(request.raw, reply.raw, request.body);
            reply.hijack();
            return;
        }

        // Agent scoping (Codex operator mode): ?agent=<agentProfileId> exposes that
        // agent's enabled tools on this session. Validated against the tenant.
        let agentProfileId: string | undefined;
        const agentParam = (request.query as Record<string, string> | undefined)?.agent;
        if (agentParam) {
            const profile = await db.query.agentProfiles.findFirst({
                where: and(eq(agentProfiles.id, agentParam), eq(agentProfiles.tenantId, auth.tenantId)),
                columns: { id: true, enabled: true },
            });
            // A disabled agent is paused: the runtime refuses to act for it, so the
            // MCP/operator path must not expose its tools either.
            if (profile && profile.enabled !== false) agentProfileId = profile.id;
        }

        // ?conv=<conversationId> — the real conversation this codex thread
        // serves (validated against the tenant), for channel-aware tools.
        let mcpConversationId: string | undefined;
        const convParam = (request.query as Record<string, string> | undefined)?.conv;
        if (convParam) {
            const conv = await db.query.conversations.findFirst({
                where: and(eq(conversations.id, convParam), eq(conversations.tenantId, auth.tenantId)),
                columns: { id: true },
            });
            if (conv) mcpConversationId = conv.id;
        }

        // New session — create transport + server, let handleRequest process initialize
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });

        const mcp = await createMcpServer(auth.tenantId, agentRuntime, agentProfileId, mcpConversationId);
        await mcp.connect(transport);

        // handleRequest processes initialize and generates the session ID
        await transport.handleRequest(request.raw, reply.raw, request.body);

        // Now the transport has a session ID — store it
        const newSessionId = transport.sessionId;
        if (newSessionId) {
            sessions.set(newSessionId, { transport, server: mcp });
            transport.onclose = () => {
                sessions.delete(newSessionId);
            };
        }

        reply.hijack();
    });

    // ── GET /mcp — SSE stream for server-initiated notifications ───
    fastify.get("/mcp", async (request, reply) => {
        const auth = await resolveToken(request.headers.authorization);
        if (!auth) {
            return reply.code(401).send({
                jsonrpc: "2.0",
                error: { code: -32001, message: "Unauthorized" },
                id: null,
            });
        }

        const sessionId = request.headers["mcp-session-id"] as string | undefined;
        const session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session) {
            return reply.code(400).send({
                jsonrpc: "2.0",
                error: { code: -32000, message: "No active session. Send an initialize request first via POST." },
                id: null,
            });
        }

        await session.transport.handleRequest(request.raw, reply.raw);
        reply.hijack();
    });

    // ── DELETE /mcp — Terminate session ────────────────────────────
    fastify.delete("/mcp", async (request, reply) => {
        const sessionId = request.headers["mcp-session-id"] as string | undefined;
        const session = sessionId ? sessions.get(sessionId) : undefined;

        if (session) {
            await session.transport.close();
            sessions.delete(sessionId!);
        }

        return reply.code(200).send({ ok: true });
    });
};
