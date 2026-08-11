"use server";

import { db } from "../../../storage/db";
import { apiTokens, conversations, messages } from "../../../storage/schema";
import { and, eq, asc, desc, like } from "drizzle-orm";
import crypto from "crypto";
import { requireTenant } from "../../../utils/tenant-auth";

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

    try {
        await db.delete(apiTokens).where(and(eq(apiTokens.tenantId, tenantId), eq(apiTokens.name, WEBCHAT_TOKEN_NAME)));
        const rawToken = `pulse-sk-${crypto.randomBytes(32).toString("hex")}`;
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        await db.insert(apiTokens).values({
            tenantId,
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
}

function contactPrefix(tenantId: string) {
    return `web-${tenantId}`;
}

function sessionIdFromContact(tenantId: string, contactId: string): string {
    const prefix = `${contactPrefix(tenantId)}-`;
    if (contactId === contactPrefix(tenantId)) return ""; // legacy
    return contactId.startsWith(prefix) ? contactId.slice(prefix.length) : "";
}

function contactFromSession(tenantId: string, sessionId: string): string {
    return sessionId ? `${contactPrefix(tenantId)}-${sessionId}` : contactPrefix(tenantId);
}

/** List the tenant's web chat sessions, most-recently-active first. */
export async function listSessionsAction(): Promise<ChatSession[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const convs = await db
            .select({ id: conversations.id, contactId: conversations.channelContactId, title: conversations.contactName, updatedAt: conversations.updatedAt })
            .from(conversations)
            .where(and(
                eq(conversations.tenantId, tenantId),
                eq(conversations.channelType, "webapp"),
                like(conversations.channelContactId, `${contactPrefix(tenantId)}%`),
            ))
            .orderBy(desc(conversations.updatedAt))
            .limit(100);

        const out: ChatSession[] = [];
        for (const c of convs) {
            // Derive a title/preview from the first + last user message when unnamed.
            const firstUser = await db
                .select({ content: messages.content, role: messages.role })
                .from(messages)
                .where(eq(messages.conversationId, c.id))
                .orderBy(asc(messages.createdAt))
                .limit(1);
            const lastMsg = await db
                .select({ content: messages.content })
                .from(messages)
                .where(eq(messages.conversationId, c.id))
                .orderBy(desc(messages.createdAt))
                .limit(1);
            const derived = firstUser[0]?.content?.slice(0, 60) || "New chat";
            out.push({
                sessionId: sessionIdFromContact(tenantId, c.contactId),
                title: (c.title && c.title.trim()) || derived,
                updatedAt: c.updatedAt?.toISOString() ?? new Date(0).toISOString(),
                preview: (lastMsg[0]?.content || "").replace(/<\/?think(?:ing)?>[\s\S]*?/gi, "").slice(0, 80),
            });
        }
        return out;
    } catch (e) {
        console.error("Failed to list chat sessions:", e);
        return [];
    }
}

/** Load a session's message history (user + assistant only). */
export async function getSessionHistoryAction(sessionId: string): Promise<{ role: string; content: string }[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const contactId = contactFromSession(tenantId, (sessionId || "").slice(0, 64));
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
            .select({ role: messages.role, content: messages.content })
            .from(messages)
            .where(eq(messages.conversationId, conv[0].id))
            .orderBy(asc(messages.createdAt))
            .limit(500);
        return rows
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content }));
    } catch (e) {
        console.error("Failed to load session history:", e);
        return [];
    }
}

/** Rename a session (stored on conversations.contactName). */
export async function renameSessionAction(sessionId: string, title: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    const clean = (title || "").trim().slice(0, 120);
    if (!clean) return { success: false as const, message: "Title is required." };
    try {
        const contactId = contactFromSession(tenantId, (sessionId || "").slice(0, 64));
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
export async function deleteSessionAction(sessionId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    try {
        const contactId = contactFromSession(tenantId, (sessionId || "").slice(0, 64));
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
            await db.delete(messages).where(eq(messages.conversationId, conv[0].id));
            await db.delete(conversations).where(eq(conversations.id, conv[0].id));
        }
        return { success: true as const };
    } catch (e) {
        console.error("Failed to delete session:", e);
        return { success: false as const, message: "Could not delete this chat." };
    }
}
