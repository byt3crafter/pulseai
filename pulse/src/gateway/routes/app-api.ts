/**
 * App API — the endpoint the Pulse desktop/mobile app talks to.
 *
 * Real user login (password + 2FA, honored so the app can't bypass it), then a
 * simple chat surface over the same agent runtime that powers every channel.
 * Auth is a short-lived HS256 app token (Bearer). CORS is open so packaged
 * desktop/mobile clients can connect.
 */
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { eq, and, asc, desc, like } from "drizzle-orm";
import { randomUUID, randomBytes, createHash } from "crypto";
import { db } from "../../storage/db.js";
import { users, agentProfiles, conversations, messages, apiTokens } from "../../storage/schema.js";
import { decrypt } from "../../utils/crypto.js";
import { checkSecondFactor } from "../../utils/totp.js";
import { signAppToken, verifyAppToken, AppTokenPayload } from "../app-token.js";
import { AgentRuntime } from "../../agent/runtime.js";
import { logger } from "../../utils/logger.js";
import {
    listUserChannels,
    getChannelContext,
    resolveResponder,
    channelContactFor,
} from "../channel-service.js";

const CHANNEL = "webapp";
const contactFor = (userId: string) => `app-${userId}`;

function getAuth(request: FastifyRequest): AppTokenPayload | null {
    const h = request.headers["authorization"];
    if (!h || Array.isArray(h) || !h.startsWith("Bearer ")) return null;
    return verifyAppToken(h.slice(7));
}

export const appApiRoutes: FastifyPluginAsync = async (fastify) => {
    // CORS for packaged desktop/mobile clients (cross-origin fetch from the
    // Electron/mobile app). The hook stamps headers on real responses.
    fastify.addHook("onRequest", async (request, reply) => {
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (request.method === "OPTIONS") {
            reply.code(204).send();
        }
    });

    // Preflight: without an explicit OPTIONS route, cross-origin preflight
    // requests hit Fastify's 404 BEFORE the hook runs → no CORS headers → the
    // browser/Electron blocks the real request ("nothing happens" on login).
    // This wildcard OPTIONS route makes preflight match so the hook answers it.
    fastify.route({
        method: "OPTIONS",
        url: "/api/app/*",
        handler: async (_request, reply) => reply.code(204).send(),
    });

    // ── Login ──
    fastify.post("/api/app/login", async (request, reply) => {
        const { email, password, totp } = (request.body || {}) as { email?: string; password?: string; totp?: string };
        if (!email || !password) return reply.code(400).send({ error: "Email and password are required." });

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return reply.code(401).send({ error: "Invalid email or password." });
        }
        if (!user.tenantId) {
            return reply.code(403).send({ error: "This account has no workspace to sign into." });
        }
        // Honor 2FA
        if ((user as any).twoFactorEnabled) {
            let secret: string | null = null;
            try { secret = (user as any).twoFactorSecret ? decrypt((user as any).twoFactorSecret) : null; } catch { secret = null; }
            const backup = Array.isArray((user as any).twoFactorBackupCodes) ? (user as any).twoFactorBackupCodes as string[] : [];
            const check = checkSecondFactor(secret, backup, totp || "");
            if (!check.ok) return reply.code(401).send({ error: "2fa_required", message: "A valid authentication code is required." });
            if (check.viaBackup) {
                await db.update(users).set({ twoFactorBackupCodes: check.remaining }).where(eq(users.id, user.id));
            }
        }

        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        const token = signAppToken({ sub: user.id, tid: user.tenantId, role: user.role, accessRole: (user as any).accessRole });
        return reply.send({
            token,
            user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role },
        });
    });

    // ── Authenticated routes ──
    const requireApp = async (request: FastifyRequest, reply: any): Promise<AppTokenPayload | null> => {
        const auth = getAuth(request);
        if (!auth || !auth.tid) {
            reply.code(401).send({ error: "Unauthorized" });
            return null;
        }
        return auth;
    };

    // Resolve the signed-in user's display name so the agent knows who it's
    // talking to (never the hardcoded "App User"). Cheap single-row lookup.
    const senderNameFor = async (userId: string): Promise<string | undefined> => {
        const [u] = await db.select({ name: users.name, email: users.email })
            .from(users).where(eq(users.id, userId)).limit(1);
        return u?.name?.trim() || u?.email?.split("@")[0] || undefined;
    };

    // List the tenant's agents ("employees")
    fastify.get("/api/app/agents", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const rows = await db.select({ id: agentProfiles.id, name: agentProfiles.name })
            .from(agentProfiles).where(eq(agentProfiles.tenantId, auth.tid!));
        return reply.send({ agents: rows });
    });

    // Current user's app conversation thread + recent messages
    fastify.get("/api/app/history", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const [conv] = await db.select().from(conversations)
            .where(and(
                eq(conversations.tenantId, auth.tid!),
                eq(conversations.channelType, CHANNEL),
                eq(conversations.channelContactId, contactFor(auth.sub)),
            )).limit(1);
        if (!conv) return reply.send({ conversationId: null, messages: [] });
        const msgs = await db.select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
            .from(messages).where(eq(messages.conversationId, conv.id))
            .orderBy(desc(messages.createdAt)).limit(100);
        return reply.send({ conversationId: conv.id, messages: msgs.reverse() });
    });

    // Send a message → run the agent → return the reply
    fastify.post("/api/app/chat", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const { content, agentProfileId } = (request.body || {}) as { content?: string; agentProfileId?: string };
        if (!content?.trim()) return reply.code(400).send({ error: "content is required." });

        const runtime: AgentRuntime = (fastify as any).agentRuntime;
        if (!runtime) return reply.code(503).send({ error: "Agent runtime unavailable." });

        const inbound = {
            id: randomUUID(),
            tenantId: auth.tid!,
            agentProfileId: agentProfileId || undefined,
            channelType: CHANNEL as any,
            channelContactId: contactFor(auth.sub),
            contactName: (await senderNameFor(auth.sub)) || "App User",
            content: content.trim(),
            receivedAt: new Date().toISOString(),
        };

        let replyText = "";
        try {
            await runtime.processMessage(inbound, async (outbound) => {
                replyText = outbound.content;
                return { channelMessageId: randomUUID() };
            });
        } catch (err) {
            logger.error({ err, tenantId: auth.tid }, "App chat failed");
            return reply.code(500).send({ error: "Failed to process message." });
        }
        return reply.send({ reply: replyText });
    });

    // ── Channels (org: departments/groups the user belongs to) ──
    fastify.get("/api/app/channels", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const rows = await listUserChannels(auth.tid!, auth.sub);
        return reply.send({ channels: rows });
    });

    // Shared channel thread history
    fastify.get<{ Params: { id: string } }>("/api/app/channels/:id/history", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const ctx = await getChannelContext(auth.tid!, auth.sub, request.params.id);
        if (!ctx) return reply.code(404).send({ error: "Channel not found." });

        const [conv] = await db.select().from(conversations)
            .where(and(
                eq(conversations.tenantId, auth.tid!),
                eq(conversations.channelType, "channel"),
                eq(conversations.channelContactId, channelContactFor(ctx.channel.id)),
            )).limit(1);
        if (!conv) return reply.send({ channelId: ctx.channel.id, agents: ctx.agents, access: ctx.membership.access, messages: [] });

        const msgs = await db.select({
            role: messages.role, content: messages.content,
            senderType: messages.senderType, senderUserId: messages.senderUserId,
            senderAgentId: messages.senderAgentId, createdAt: messages.createdAt,
        })
            .from(messages).where(eq(messages.conversationId, conv.id))
            .orderBy(desc(messages.createdAt)).limit(100);
        return reply.send({
            channelId: ctx.channel.id,
            agents: ctx.agents,
            access: ctx.membership.access,
            messages: msgs.reverse(),
        });
    });

    // Post to a channel → resolve responder (lead or @mention) → run agent → reply
    fastify.post<{ Params: { id: string } }>("/api/app/channels/:id/messages", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const { content } = (request.body || {}) as { content?: string };
        if (!content?.trim()) return reply.code(400).send({ error: "content is required." });

        const ctx = await getChannelContext(auth.tid!, auth.sub, request.params.id);
        if (!ctx) return reply.code(404).send({ error: "Channel not found." });
        if (ctx.membership.access !== "talk") {
            return reply.code(403).send({ error: "You have read-only access to this channel." });
        }

        const responder = resolveResponder(ctx, content.trim());
        if (!responder) return reply.code(409).send({ error: "No agent is available to you in this channel." });

        const runtime: AgentRuntime = (fastify as any).agentRuntime;
        if (!runtime) return reply.code(503).send({ error: "Agent runtime unavailable." });

        const inbound = {
            id: randomUUID(),
            tenantId: auth.tid!,
            agentProfileId: responder.agentProfileId,
            channelType: "channel" as const,
            channelContactId: channelContactFor(ctx.channel.id),
            channelId: ctx.channel.id,
            contactName: (await senderNameFor(auth.sub)) || "App User",
            senderUserId: auth.sub,
            content: content.trim(),
            receivedAt: new Date().toISOString(),
        };

        let replyText = "";
        try {
            await runtime.processMessage(inbound, async (outbound) => {
                replyText = outbound.content;
                return { channelMessageId: randomUUID() };
            });
        } catch (err) {
            logger.error({ err, tenantId: auth.tid, channelId: ctx.channel.id }, "Channel chat failed");
            return reply.code(500).send({ error: "Failed to process message." });
        }
        return reply.send({
            reply: replyText,
            agent: { id: responder.agentProfileId, name: responder.name },
            viaMention: responder.viaMention,
        });
    });

    // ── Streaming assistant (desktop client parity with the web assistant) ──
    // The desktop connects to the gateway /ws for live streaming, but /ws auths
    // against the apiTokens table, not the app JWT. Mint a short-lived chat token
    // for the signed-in user (mirrors the dashboard's getChatTokenAction).
    const WEBCHAT_TOKEN_NAME = "__desktopchat__";
    fastify.post("/api/app/chat-token", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        try {
            await db.delete(apiTokens).where(and(eq(apiTokens.tenantId, auth.tid!), eq(apiTokens.name, WEBCHAT_TOKEN_NAME)));
            const rawToken = `pulse-sk-${randomBytes(32).toString("hex")}`;
            const tokenHash = createHash("sha256").update(rawToken).digest("hex");
            await db.insert(apiTokens).values({
                tenantId: auth.tid!,
                tokenHash,
                name: WEBCHAT_TOKEN_NAME,
                scopes: ["chat"],
                expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            });
            return reply.send({ token: rawToken });
        } catch (err) {
            logger.error({ err, tenantId: auth.tid }, "Failed to mint desktop chat token");
            return reply.code(500).send({ error: "Could not start the assistant session." });
        }
    });

    // Per-agent conversation scoping shared with the web assistant.
    const scopePrefix = (tid: string, agentId: string, shared: boolean) => `web-${tid}-${shared ? "shared" : (agentId || "default")}`;
    const contactFromSession = (tid: string, agentId: string, shared: boolean, sessionId: string) => {
        const base = scopePrefix(tid, agentId, shared);
        return sessionId ? `${base}-${sessionId}` : base;
    };

    // List an agent's chat sessions (or the shared room's), most-recent first.
    fastify.get("/api/app/assistant/sessions", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const q = (request.query || {}) as { agentId?: string; shared?: string };
        const shared = q.shared === "1" || q.shared === "true";
        const agentId = (q.agentId || "").trim();
        const convs = await db
            .select({ id: conversations.id, contactId: conversations.channelContactId, title: conversations.contactName, updatedAt: conversations.updatedAt, metadata: conversations.metadata })
            .from(conversations)
            .where(and(eq(conversations.tenantId, auth.tid!), eq(conversations.channelType, "webapp"), like(conversations.channelContactId, `${scopePrefix(auth.tid!, agentId, shared)}%`)))
            .orderBy(desc(conversations.updatedAt)).limit(100);
        const base = scopePrefix(auth.tid!, agentId, shared);
        const out: any[] = [];
        for (const c of convs) {
            const firstUser = await db.select({ content: messages.content }).from(messages)
                .where(and(eq(messages.conversationId, c.id), eq(messages.role, "user"))).orderBy(asc(messages.createdAt)).limit(1);
            const lastMsg = await db.select({ content: messages.content }).from(messages)
                .where(eq(messages.conversationId, c.id)).orderBy(desc(messages.createdAt)).limit(1);
            if (!lastMsg[0]) continue;
            const sessionId = c.contactId === base ? "" : (c.contactId.startsWith(base + "-") ? c.contactId.slice(base.length + 1) : "");
            out.push({
                sessionId,
                title: (c.title && c.title.trim()) || (firstUser[0]?.content || "New chat").replace(/\s+/g, " ").slice(0, 60),
                updatedAt: c.updatedAt?.toISOString() ?? new Date(0).toISOString(),
                preview: (lastMsg[0]?.content || "").replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").replace(/<\/?think(?:ing)?>/gi, "").trim().slice(0, 80),
            });
        }
        return reply.send({ sessions: out });
    });

    // Load one session's messages (user + assistant), carrying the sending agent.
    fastify.get("/api/app/assistant/history", async (request, reply) => {
        const auth = await requireApp(request, reply); if (!auth) return;
        const q = (request.query || {}) as { agentId?: string; sessionId?: string; shared?: string };
        const shared = q.shared === "1" || q.shared === "true";
        const contactId = contactFromSession(auth.tid!, (q.agentId || "").trim(), shared, (q.sessionId || "").slice(0, 64));
        const [conv] = await db.select({ id: conversations.id }).from(conversations)
            .where(and(eq(conversations.tenantId, auth.tid!), eq(conversations.channelType, "webapp"), eq(conversations.channelContactId, contactId))).limit(1);
        if (!conv) return reply.send({ messages: [] });
        const rows = await db.select({ role: messages.role, content: messages.content, senderAgentId: messages.senderAgentId })
            .from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt)).limit(500);
        return reply.send({ messages: rows.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content, agentProfileId: m.senderAgentId ?? null })) });
    });
};
