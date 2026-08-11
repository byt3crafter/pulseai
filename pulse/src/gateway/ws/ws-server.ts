/**
 * WebSocket Control Plane — real-time event streaming.
 */

import { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { logger } from "../../utils/logger.js";
import { hashToken } from "../middleware/api-token-auth.js";
import { db } from "../../storage/db.js";
import { apiTokens } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getJobRunnerRuntime } from "../../cron/job-runner.js";
import type { WebSocket } from "ws";

interface WsClient {
    ws: WebSocket;
    tenantId: string;
    role: string;
    scopes: string[];
}

const clients = new Map<string, WsClient>();
let clientIdCounter = 0;

export async function registerWebSocket(fastify: FastifyInstance): Promise<void> {
    await fastify.register(websocket);

    fastify.get("/ws", { websocket: true }, (socket, request) => {
        const clientId = `ws-${++clientIdCounter}`;
        let authenticated = false;
        let tenantId = "";

        // Auth via query param token or first frame
        const urlToken = (request.query as any)?.token;
        if (urlToken) {
            authenticateToken(urlToken).then((ctx) => {
                if (ctx) {
                    authenticated = true;
                    tenantId = ctx.tenantId;
                    clients.set(clientId, { ws: socket, tenantId: ctx.tenantId, role: "api", scopes: ctx.scopes });
                    socket.send(JSON.stringify({ type: "auth.success", clientId }));
                } else {
                    socket.send(JSON.stringify({ type: "auth.error", message: "Invalid token" }));
                    socket.close(4001, "Unauthorized");
                }
            });
        }

        socket.on("message", async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());

                if (msg.type === "auth" && msg.token && !authenticated) {
                    const ctx = await authenticateToken(msg.token);
                    if (ctx) {
                        authenticated = true;
                        tenantId = ctx.tenantId;
                        clients.set(clientId, { ws: socket, tenantId: ctx.tenantId, role: "api", scopes: ctx.scopes });
                        socket.send(JSON.stringify({ type: "auth.success", clientId }));
                    } else {
                        socket.send(JSON.stringify({ type: "auth.error", message: "Invalid token" }));
                        socket.close(4001, "Unauthorized");
                    }
                    return;
                }

                if (!authenticated) {
                    socket.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
                    return;
                }

                // Handle ping
                if (msg.type === "ping") {
                    socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
                    return;
                }

                // Live chat: run the agent and stream its response back over this
                // socket. Progressive content arrives as agent.streaming; the final
                // reply as agent.message. Reuses the exact same processMessage brain
                // (memory, tools, approvals) as Telegram — just a browser surface.
                if (msg.type === "chat") {
                    const text = String(msg.text || "").trim();
                    if (!text) return;
                    const runtime = getJobRunnerRuntime();
                    if (!runtime) {
                        socket.send(JSON.stringify({ type: "error", message: "Assistant is starting up — try again in a moment." }));
                        return;
                    }
                    const inbound: any = {
                        id: randomUUID(),
                        tenantId,
                        agentProfileId: msg.agentProfileId || undefined,
                        channelType: "webapp",
                        // Stable per-tenant web contact → one persistent web conversation
                        // (memory carries across reloads, like Telegram).
                        channelContactId: `web-${tenantId}`,
                        content: text,
                        receivedAt: new Date(),
                        trigger: "chat",
                    };
                    socket.send(JSON.stringify({ type: "chat.accepted" }));
                    runtime.processMessage(
                        inbound,
                        async (outbound: any) => {
                            socket.send(JSON.stringify({
                                type: "agent.message",
                                conversationId: outbound.conversationId,
                                agentProfileId: outbound.agentProfileId,
                                content: outbound.content,
                            }));
                            return { channelMessageId: `web-${Date.now()}` };
                        },
                        {
                            // Progressive content (text stream on no-tool turns, step
                            // trail on tool turns) → live "typing" in the browser.
                            editMessageCallback: async (_tid: string, _cid: string, _mid: string, content: string) => {
                                socket.send(JSON.stringify({ type: "agent.streaming", content }));
                            },
                        }
                    ).catch((err: unknown) => {
                        logger.error({ err, tenantId }, "web chat processMessage failed");
                        socket.send(JSON.stringify({ type: "error", message: "The assistant hit an error handling that." }));
                    });
                    return;
                }
            } catch {
                // Ignore malformed messages
            }
        });

        socket.on("close", () => {
            clients.delete(clientId);
        });
    });

    logger.info("WebSocket control plane registered at /ws");
}

async function authenticateToken(token: string): Promise<{ tenantId: string; scopes: string[] } | null> {
    try {
        const tokenHash = hashToken(token);
        const record = await db.query.apiTokens.findFirst({
            where: eq(apiTokens.tokenHash, tokenHash),
        });
        if (!record) return null;
        if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;
        return { tenantId: record.tenantId, scopes: record.scopes || ["chat", "responses"] };
    } catch {
        return null;
    }
}

export function broadcastToTenant(tenantId: string, event: any): void {
    const payload = JSON.stringify(event);
    for (const [, client] of clients) {
        if (client.tenantId === tenantId && client.ws.readyState === 1) {
            client.ws.send(payload);
        }
    }
}

export function broadcastAll(event: any): void {
    const payload = JSON.stringify(event);
    for (const [, client] of clients) {
        if (client.ws.readyState === 1) {
            client.ws.send(payload);
        }
    }
}
