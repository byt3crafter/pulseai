import { FastifyPluginAsync } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { db } from "../../storage/db.js";
import { oauthTokens, tenants, conversations, messages } from "../../storage/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { InboundMessage } from "../../channels/types.js";
import { AgentRuntime } from "../../agent/runtime.js";

// Per-session transport + server instances
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

/**
 * Resolve a Bearer token to a tenantId.
 * Returns null if the token is invalid, expired, or the tenant has CLI access disabled.
 */
async function resolveToken(authHeader: string | undefined): Promise<{ tenantId: string } | null> {
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);

    const record = await db.query.oauthTokens.findFirst({
        where: eq(oauthTokens.accessToken, token),
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
 */
function createMcpServer(tenantId: string, agentRuntime: AgentRuntime): McpServer {
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

        // New session — create transport + server, let handleRequest process initialize
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });

        const mcp = createMcpServer(auth.tenantId, agentRuntime);
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
