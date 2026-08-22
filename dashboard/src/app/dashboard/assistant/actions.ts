"use server";

import { db } from "../../../storage/db";
import { apiTokens, conversations, messages, usageRecords, agentRuns } from "../../../storage/schema";
import { and, eq, asc, desc, like, or, isNull } from "drizzle-orm";
import crypto from "crypto";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

const WEBCHAT_TOKEN_NAME = "__webchat__";

/**
 * Mint a short-lived chat token for the browser to authenticate its WebSocket
 * to the gateway. Scoped to the caller's tenant (from session). Prunes the prior
 * web-chat token so we don't accumulate one per page load — there's only ever
 * one active browser-chat token per workspace.
 */
export async function getChatTokenAction() {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { ok: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    const userId = tenantCheck.userId;

    try {
        // Per-user token so the agent knows exactly who is talking. Only replace THIS
        // user's own token (don't clobber other signed-in team members'), and sweep any
        // legacy tenant-level webchat token.
        await db.delete(apiTokens).where(and(
            eq(apiTokens.tenantId, tenantId), eq(apiTokens.name, WEBCHAT_TOKEN_NAME),
            or(eq(apiTokens.userId, userId), isNull(apiTokens.userId)),
        ));
        const rawToken = `pulse-sk-${crypto.randomBytes(32).toString("hex")}`;
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        await db.insert(apiTokens).values({
            tenantId,
            userId,
            tokenHash,
            name: WEBCHAT_TOKEN_NAME,
            scopes: ["chat"],
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h
        });
        return { ok: true as const, token: rawToken };
    } catch (e) {
        console.error("Failed to mint chat token:", e);
        return { ok: false as const, message: "Could not start the assistant session." };
    }
}

// ─── Chat sessions ───────────────────────────────────────────────────────────
// Each browser chat session is its own conversation, keyed by a structured
// contact id: `web-<tenantId>-<sessionId>`. The legacy single web conversation
// (`web-<tenantId>`) still shows up as the "General" session for back-compat.

export interface ChatSession {
    sessionId: string;
    title: string;
    updatedAt: string;
    preview: string;
    pinned: boolean;
}

// Conversations are scoped per agent so chats never mix:
//   separate mode → `web-<tenant>-<agentId>-<session>`
//   shared mode   → `web-<tenant>-shared-<session>`  (one team room)
// The agent segment is always known (from the selected agent / mode), so
// slicing the prefix off to recover the sessionId is exact even though UUIDs
// contain hyphens.
function agentSeg(agentId: string, shared: boolean) {
    return shared ? "shared" : (agentId || "default");
}

function scopePrefix(tenantId: string, agentId: string, shared: boolean) {
    return `web-${tenantId}-${agentSeg(agentId, shared)}`;
}

function sessionIdFromContact(tenantId: string, agentId: string, shared: boolean, contactId: string): string {
    const base = scopePrefix(tenantId, agentId, shared);
    if (contactId === base) return ""; // scope's default (no explicit session)
    const prefix = `${base}-`;
    return contactId.startsWith(prefix) ? contactId.slice(prefix.length) : "";
}

function contactFromSession(tenantId: string, agentId: string, shared: boolean, sessionId: string): string {
    const base = scopePrefix(tenantId, agentId, shared);
    return sessionId ? `${base}-${sessionId}` : base;
}

/** List a single agent's web chat sessions (or the shared room's), most-recent first. */
export async function listSessionsAction(agentId: string = "", shared: boolean = false): Promise<ChatSession[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const convs = await db
            .select({ id: conversations.id, contactId: conversations.channelContactId, title: conversations.contactName, updatedAt: conversations.updatedAt, metadata: conversations.metadata })
            .from(conversations)
            .where(and(
                eq(conversations.tenantId, tenantId),
                eq(conversations.channelType, "webapp"),
                like(conversations.channelContactId, `${scopePrefix(tenantId, agentId, shared)}%`),
            ))
            .orderBy(desc(conversations.updatedAt))
            .limit(100);

        const out: ChatSession[] = [];
        for (const c of convs) {
            // Title = first USER message (fallback: first message); preview = last
            // message. Skip conversations that have no messages at all (ghost rows)
            // so the switcher only shows real chats.
            const firstUser = await db
                .select({ content: messages.content })
                .from(messages)
                .where(and(eq(messages.conversationId, c.id), eq(messages.role, "user")))
                .orderBy(asc(messages.createdAt))
                .limit(1);
            const lastMsg = await db
                .select({ content: messages.content })
                .from(messages)
                .where(eq(messages.conversationId, c.id))
                .orderBy(desc(messages.createdAt))
                .limit(1);
            if (!lastMsg[0]) continue; // empty conversation — don't surface it
            const derived = firstUser[0]?.content?.replace(/\s+/g, " ").slice(0, 60) || "New chat";
            out.push({
                sessionId: sessionIdFromContact(tenantId, agentId, shared, c.contactId),
                title: (c.title && c.title.trim()) || derived,
                updatedAt: c.updatedAt?.toISOString() ?? new Date(0).toISOString(),
                preview: (lastMsg[0]?.content || "").replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").replace(/<\/?think(?:ing)?>/gi, "").trim().slice(0, 80),
                pinned: (c.metadata as any)?.pinned === true,
            });
        }
        // Pinned first, then most-recent — the client renders them in two groups.
        out.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt.localeCompare(a.updatedAt)));
        return out;
    } catch (e) {
        console.error("Failed to list chat sessions:", e);
        return [];
    }
}

/** Pin or unpin a session (stored on conversations.metadata.pinned). */
export async function pinSessionAction(sessionId: string, pinned: boolean, agentId: string = "", shared: boolean = false) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    try {
        const contactId = contactFromSession(tenantId, agentId, shared, (sessionId || "").slice(0, 64));
        const [conv] = await db
            .select({ id: conversations.id, metadata: conversations.metadata })
            .from(conversations)
            .where(and(
                eq(conversations.tenantId, tenantId),
                eq(conversations.channelType, "webapp"),
                eq(conversations.channelContactId, contactId),
            ))
            .limit(1);
        if (!conv) return { success: false as const, message: "Chat not found." };
        const meta = { ...((conv.metadata as Record<string, any>) || {}), pinned: !!pinned };
        await db.update(conversations).set({ metadata: meta }).where(eq(conversations.id, conv.id));
        return { success: true as const };
    } catch (e) {
        console.error("Failed to pin session:", e);
        return { success: false as const, message: "Could not update this chat." };
    }
}

/** Load a session's message history (user + assistant only). Carries the sending
 *  agent id on each assistant row so the shared-room UI can attribute correctly. */
export async function getSessionHistoryAction(sessionId: string, agentId: string = "", shared: boolean = false): Promise<{ role: string; content: string; agentProfileId: string | null }[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const contactId = contactFromSession(tenantId, agentId, shared, (sessionId || "").slice(0, 64));
        const conv = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(and(
                eq(conversations.tenantId, tenantId),
                eq(conversations.channelType, "webapp"),
                eq(conversations.channelContactId, contactId),
            ))
            .limit(1);
        if (!conv[0]) return [];
        const rows = await db
            .select({ role: messages.role, content: messages.content, senderAgentId: messages.senderAgentId })
            .from(messages)
            .where(eq(messages.conversationId, conv[0].id))
            .orderBy(asc(messages.createdAt))
            .limit(500);
        return rows
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content, agentProfileId: m.senderAgentId ?? null }));
    } catch (e) {
        console.error("Failed to load session history:", e);
        return [];
    }
}

/** Rename a session (stored on conversations.contactName). */
export async function renameSessionAction(sessionId: string, title: string, agentId: string = "", shared: boolean = false) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    const clean = (title || "").trim().slice(0, 120);
    if (!clean) return { success: false as const, message: "Title is required." };
    try {
        const contactId = contactFromSession(tenantId, agentId, shared, (sessionId || "").slice(0, 64));
        await db.update(conversations)
            .set({ contactName: clean })
            .where(and(
                eq(conversations.tenantId, tenantId),
                eq(conversations.channelType, "webapp"),
                eq(conversations.channelContactId, contactId),
            ));
        return { success: true as const };
    } catch (e) {
        console.error("Failed to rename session:", e);
        return { success: false as const, message: "Could not rename this chat." };
    }
}

/** Delete a session and all its messages. */
export async function deleteSessionAction(sessionId: string, agentId: string = "", shared: boolean = false) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    try {
        const contactId = contactFromSession(tenantId, agentId, shared, (sessionId || "").slice(0, 64));
        const conv = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(and(
                eq(conversations.tenantId, tenantId),
                eq(conversations.channelType, "webapp"),
                eq(conversations.channelContactId, contactId),
            ))
            .limit(1);
        if (conv[0]) {
            const cid = conv[0].id;
            // Clear rows that FK-reference the conversation, else the delete throws
            // (which previously made "delete" silently do nothing).
            await db.delete(usageRecords).where(eq(usageRecords.conversationId, cid));
            await db.update(agentRuns).set({ conversationId: null }).where(eq(agentRuns.conversationId, cid));
            await db.delete(messages).where(eq(messages.conversationId, cid));
            await db.delete(conversations).where(eq(conversations.id, cid));

            await logAudit({
                action: "conversation.delete",
                targetType: "conversation",
                targetId: sessionId,
                tenantId,
                summary: "Deleted chat session",
            });
        }
        return { success: true as const };
    } catch (e) {
        console.error("Failed to delete session:", e);
        return { success: false as const, message: "Could not delete this chat." };
    }
}
