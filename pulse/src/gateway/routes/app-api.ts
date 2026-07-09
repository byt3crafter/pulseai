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
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../storage/db.js";
import { users, agentProfiles, conversations, messages } from "../../storage/schema.js";
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
};
