/**
 * WebSocket Control Plane — real-time event streaming.
 */

import { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { logger } from "../../utils/logger.js";
import { hashToken } from "../middleware/api-token-auth.js";
import { db } from "../../storage/db.js";
import { apiTokens, agentProfiles, users } from "../../storage/schema.js";
import { and, eq } from "drizzle-orm";
import { parseMentions, agentMatchesToken } from "../channel-service.js";
import { processAttachments } from "../attachment-extractor.js";
import { randomUUID } from "node:crypto";
import { onFloorEvent } from "../../utils/floor-bus.js";
import { onChatEvent } from "../../utils/chat-bus.js";
import { getJobRunnerRuntime } from "../../cron/job-runner.js";
import type { WebSocket } from "ws";

interface WsClient {
    ws: WebSocket;
    tenantId: string;
    /** Which signed-in human this socket belongs to. Chat output is filtered on
     *  it, so one member never receives another's conversation. */
    userId: string | null;
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
    // Raise the frame cap so base64 file attachments (images/PDF/sheets/docs) fit.
    await fastify.register(websocket, { options: { maxPayload: 40 * 1024 * 1024 } });

    // Live office-floor updates. Clients are registered at auth, so a dashboard
    // socket that only observes (never chats) still receives these.
    onFloorEvent((event) => {
        broadcastToTenant(event.tenantId, { type: "floor", event });
    });

    // Live chat output, routed to the asker rather than the one socket that sent
    // the message — that socket is gone after navigating away, which is why a
    // resumed browser used to see nothing more of its own answer.
    //
    // Scoped to userId on purpose: this carries conversation content, so a
    // tenant-wide broadcast would leak one member's chat to another.
    onChatEvent((event) => {
        if (!event.userId) return;
        const payload = JSON.stringify({ type: "chat.stream", event });
        for (const [, client] of clients) {
            if (client.tenantId !== event.tenantId) continue;
            if (client.userId !== event.userId) continue;
            if (client.ws.readyState !== 1) continue;
            client.ws.send(payload);
        }
    });

    fastify.get("/ws", { websocket: true }, (socket, request) => {
        const clientId = `ws-${++clientIdCounter}`;
        let authenticated = false;
        let tenantId = "";
        let userId: string | null = null;

        // Auth via query param token or first frame
        const urlToken = (request.query as any)?.token;
        if (urlToken) {
            authenticateToken(urlToken).then((ctx) => {
                if (ctx) {
                    authenticated = true;
                    tenantId = ctx.tenantId;
                    userId = ctx.userId;
                    clients.set(clientId, { ws: socket, tenantId: ctx.tenantId, userId: ctx.userId ?? null, role: "api", scopes: ctx.scopes });
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
                        userId = ctx.userId;
                        clients.set(clientId, { ws: socket, tenantId: ctx.tenantId, userId: ctx.userId ?? null, role: "api", scopes: ctx.scopes });
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
                    const rawAttachments = Array.isArray(msg.attachments) ? msg.attachments : [];
                    if (!text && rawAttachments.length === 0) return;
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

                    // Resolve the responder SET. An @mention overrides the selected agent
                    // (reusing the channels' parseMentions/name-match). In the "shared" team
                    // room, mentioning several agents fans out to each — a bounded "meeting"
                    // where each mentioned agent replies once into the one thread. In a
                    // separate DM there is always exactly one responder.
                    const shared = msg.shared === true;
                    const MAX_MEETING_AGENTS = 3; // cap fan-out so a mass-mention can't stampede
                    const tokens = parseMentions(text);
                    let matched: string[] = [];
                    if (tokens.length > 0) {
                        const roster = await db
                            .select({ id: agentProfiles.id, name: agentProfiles.name })
                            .from(agentProfiles)
                            .where(and(eq(agentProfiles.tenantId, tenantId), eq(agentProfiles.enabled, true)));
                        // Preserve mention order, de-dup, and keep the roster match.
                        const seen = new Set<string>();
                        for (const t of tokens) {
                            const a = roster.find((r) => agentMatchesToken(r.name, t));
                            if (a && !seen.has(a.id)) { seen.add(a.id); matched.push(a.id); }
                        }
                    }
                    const responders: (string | undefined)[] = shared
                        ? (matched.length ? matched.slice(0, MAX_MEETING_AGENTS) : [msg.agentProfileId || undefined])
                        : [matched[0] || msg.agentProfileId || undefined];

                    // Conversation scope (its own memory thread). Separate → per agent
                    // (`web-<tenant>-<agent>-<session>`); shared → one team room.
                    const agentSeg = shared ? "shared" : (responders[0] || "default");
                    const contactId = sessionId
                        ? `web-${tenantId}-${agentSeg}-${sessionId}`
                        : `web-${tenantId}-${agentSeg}`;

                    socket.send(JSON.stringify({
                        type: "chat.accepted", sessionId,
                        agentProfileId: responders[0], mentionAgentId: matched[0],
                        responders: responders.filter(Boolean),
                    }));

                    const modelOverride = typeof msg.model === "string" && msg.model.trim() ? msg.model.trim() : undefined;
                    const reasoningEffort = typeof msg.reasoningEffort === "string" ? msg.reasoningEffort : undefined;

                    // Turn any attachments into vision images + extracted-text context.
                    // Text is prepended so the agent sees file contents alongside the ask.
                    let imageAttachments: any[] = [];
                    let effectiveContent = text;
                    if (rawAttachments.length > 0) {
                        try {
                            const processed = await processAttachments(rawAttachments);
                            imageAttachments = processed.images;
                            effectiveContent = [processed.contextText, text].filter(Boolean).join("\n\n").trim();
                        } catch (err) {
                            logger.warn({ err, tenantId }, "Attachment processing failed");
                        }
                    }

                    // Resolve WHO is talking so the agent addresses the actual signed-in
                    // user (not whoever it remembers). The token is per-user; fall back to
                    // no name (tenant-level tokens) rather than guessing.
                    let senderName: string | undefined;
                    let senderRole: string | undefined;
                    if (userId) {
                        try {
                            const [u] = await db.select({ name: users.name, email: users.email, accessRole: users.accessRole })
                                .from(users).where(eq(users.id, userId)).limit(1);
                            if (u) {
                                senderName = (u.name && u.name.trim()) || (u.email ? u.email.split("@")[0] : undefined);
                                senderRole = u.accessRole || undefined;
                            }
                        } catch { /* non-fatal — just no name */ }
                    }

                    // Run each responder in turn (sequentially) so their replies land as
                    // distinct, attributed messages in the shared thread. Reasoning models
                    // emit <think>…</think>; split it so the browser shows the answer live
                    // and the reasoning in its own collapsible panel.
                    (async () => {
                        for (const rid of responders) {
                            let lastThinking = "";
                            const inbound: any = {
                                id: randomUUID(),
                                tenantId,
                                agentProfileId: rid,
                                channelType: "webapp",
                                channelContactId: contactId,
                                content: effectiveContent,
                                attachments: imageAttachments.length ? imageAttachments : undefined,
                                contactName: senderName,   // "Who you're talking to" in the system prompt
                                senderUserId: userId ?? undefined,
                                // On this surface senderUserId already IS a real
                                // users.id (the token is per-user), so the run can
                                // be attributed to whoever is signed in.
                                actorUserId: userId ?? null,
                                senderRole,
                                receivedAt: new Date(),
                                trigger: "chat",
                            };
                            try {
                                await runtime.processMessage(
                                    inbound,
                                    async (outbound: any) => {
                                        socket.send(JSON.stringify({
                                            type: "agent.message",
                                            conversationId: outbound.conversationId,
                                            agentProfileId: outbound.agentProfileId ?? rid,
                                            content: outbound.content,
                                            thinking: outbound.thinkingSuppressed ? undefined : (outbound.thinking || lastThinking || undefined),
                                            model: outbound.model,          // which model answered (transparency badge)
                                            routeReason: outbound.routeReason,
                                            sessionId,
                                        }));
                                        return { channelMessageId: `web-${Date.now()}` };
                                    },
                                    {
                                        reasoningEffort,
                                        modelOverride,
                                        forceStream: true,
                                        onToolStep: (step: { name: string; label: string; phase: "start" | "done" | "error"; detail?: string }) => {
                                            try { socket.send(JSON.stringify({ type: "agent.tool", ...step, agentProfileId: rid, sessionId })); } catch { /* socket closed */ }
                                        },
                                        editMessageCallback: async (_tid: string, _cid: string, _mid: string, content: string) => {
                                            const { thinking, answer } = splitThinking(content);
                                            if (thinking) {
                                                lastThinking = thinking;
                                                socket.send(JSON.stringify({ type: "agent.thinking", content: thinking, agentProfileId: rid, sessionId }));
                                            }
                                            socket.send(JSON.stringify({ type: "agent.streaming", content: answer, agentProfileId: rid, sessionId }));
                                        },
                                    }
                                );
                            } catch (err) {
                                logger.error({ err, tenantId, agentProfileId: rid }, "web chat processMessage failed");
                                socket.send(JSON.stringify({ type: "error", message: "The assistant hit an error handling that." }));
                            }
                        }
                    })();
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

async function authenticateToken(token: string): Promise<{ tenantId: string; scopes: string[]; userId: string | null } | null> {
    try {
        const tokenHash = hashToken(token);
        const record = await db.query.apiTokens.findFirst({
            where: eq(apiTokens.tokenHash, tokenHash),
        });
        if (!record) return null;
        if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;
        return { tenantId: record.tenantId, scopes: record.scopes || ["chat", "responses"], userId: (record as any).userId ?? null };
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
