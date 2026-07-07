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
import { logger } from "../../utils/logger.js";

// Registry instance for agent-scoped MCP sessions (reads enablement from DB per call).
const mcpToolRegistry = new ToolRegistry();

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
async function createMcpServer(tenantId: string, agentRuntime: AgentRuntime, agentProfileId?: string): Promise<McpServer> {
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
        const reserved = new Set(["send_message", "list_conversations", "get_conversation"]);
        try {
            const agentTools = await mcpToolRegistry.getEnabledTools(tenantId, agentProfileId);
            for (const tool of agentTools) {
                if (reserved.has(tool.name)) continue;
                mcp.tool(
                    tool.name,
                    tool.description,
                    jsonSchemaToZodShape(tool.parameters),
                    async (args: Record<string, any>) => {
                        try {
                            const result = await tool.execute({
                                tenantId,
                                conversationId: `codex-mcp-${agentProfileId}`,
                                args: { ...args, _agentId: agentProfileId },
                            });
                            return { content: [{ type: "text" as const, text: result.result }] };
                        } catch (err: any) {
                            logger.error({ err, tool: tool.name, tenantId, agentProfileId }, "Agent MCP tool failed");
                            return {
                                content: [{ type: "text" as const, text: `Tool error: ${err?.message || "unknown"}` }],
                                isError: true,
                            };
                        }
                    },
                );
            }
            logger.info({ tenantId, agentProfileId, toolCount: agentTools.length }, "Agent tools exposed on MCP session");
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
                columns: { id: true },
            });
            if (profile) agentProfileId = profile.id;
        }

        // New session — create transport + server, let handleRequest process initialize
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });

        const mcp = await createMcpServer(auth.tenantId, agentRuntime, agentProfileId);
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
