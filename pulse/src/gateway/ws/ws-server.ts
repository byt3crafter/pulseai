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
