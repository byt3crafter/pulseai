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

/**
 * Split a (possibly still-streaming) assistant chunk into its chain-of-thought
 * and its user-facing answer. Reasoning models emit <think>…</think>; we surface
 * the thinking in a separate collapsible panel and keep it out of the answer.
 * Handles an unclosed trailing <think> mid-stream.
 */
function splitThinking(raw: string): { thinking: string; answer: string } {
    let thinking = "";
    let answer = raw.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, (_m, inner) => {
        thinking += inner;
        return "";
    });
    const openMatch = answer.match(/<think(?:ing)?>/i);
    if (openMatch && openMatch.index !== undefined) {
        thinking += answer.slice(openMatch.index).replace(/<think(?:ing)?>/i, "");
        answer = answer.slice(0, openMatch.index);
    }
    answer = answer.replace(/<\/?think(?:ing)?>/gi, "").trim();
    return { thinking: thinking.trim(), answer };
}

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
                    // Each browser chat "session" is its own conversation (its own
                    // memory thread) via a structured contact id. No sessionId =
                    // the legacy single per-tenant web conversation (back-compat).
                    const sessionId = typeof msg.sessionId === "string" && msg.sessionId.trim()
                        ? msg.sessionId.trim().slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, "")
                        : "";
                    const contactId = sessionId ? `web-${tenantId}-${sessionId}` : `web-${tenantId}`;
                    const inbound: any = {
                        id: randomUUID(),
                        tenantId,
                        agentProfileId: msg.agentProfileId || undefined,
                        channelType: "webapp",
                        channelContactId: contactId,
                        content: text,
                        receivedAt: new Date(),
                        trigger: "chat",
                    };
                    socket.send(JSON.stringify({ type: "chat.accepted", sessionId }));

                    // Reasoning models (e.g. MiniMax) emit <think>…</think> in the
                    // stream. Split it so the browser can show the answer live and
                    // the reasoning in a separate, collapsible panel. Web-only — the
                    // runtime still strips it from the persisted/Telegram content.
                    let lastThinking = "";
                    runtime.processMessage(
                        inbound,
                        async (outbound: any) => {
                            socket.send(JSON.stringify({
                                type: "agent.message",
                                conversationId: outbound.conversationId,
                                agentProfileId: outbound.agentProfileId,
                                content: outbound.content,
                                thinking: lastThinking || undefined,
                                sessionId,
                            }));
                            return { channelMessageId: `web-${Date.now()}` };
                        },
                        {
                            reasoningEffort: typeof msg.reasoningEffort === "string" ? msg.reasoningEffort : undefined,
                            editMessageCallback: async (_tid: string, _cid: string, _mid: string, content: string) => {
                                const { thinking, answer } = splitThinking(content);
                                if (thinking) {
                                    lastThinking = thinking;
                                    socket.send(JSON.stringify({ type: "agent.thinking", content: thinking }));
                                }
                                socket.send(JSON.stringify({ type: "agent.streaming", content: answer }));
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
