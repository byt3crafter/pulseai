"use server";

import { db } from "../../../storage/db";
import { apiTokens, conversations, messages, usageRecords, agentRuns, agentProfiles } from "../../../storage/schema";
import { and, eq, asc, desc, gt, like, or, isNull } from "drizzle-orm";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";
import { visibleTo } from "../../../utils/visibility";
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
                // Row scope as well as tenant scope. A contact-id prefix says
                // which agent a thread belongs to, not which person — so once
                // threads can be private it is not, on its own, a permission.
                visibleTo(conversations, tenantCheck.userId),
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
                // Row scope as well as tenant scope. A contact-id prefix says
                // which agent a thread belongs to, not which person — so once
                // threads can be private it is not, on its own, a permission.
                visibleTo(conversations, tenantCheck.userId),
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
                // Row scope as well as tenant scope. A contact-id prefix says
                // which agent a thread belongs to, not which person — so once
                // threads can be private it is not, on its own, a permission.
                visibleTo(conversations, tenantCheck.userId),
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
                // Row scope as well as tenant scope. A contact-id prefix says
                // which agent a thread belongs to, not which person — so once
                // threads can be private it is not, on its own, a permission.
                visibleTo(conversations, tenantCheck.userId),
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
                // Row scope as well as tenant scope. A contact-id prefix says
                // which agent a thread belongs to, not which person — so once
                // threads can be private it is not, on its own, a permission.
                visibleTo(conversations, tenantCheck.userId),
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

/**
 * Is a run still in flight for this chat session?
 *
 * The browser used to lose all knowledge of a run the moment it navigated away:
 * `busy` is component state, and no run id was ever sent to the client. The run
 * itself kept going and the reply was saved — it just looked like nothing had
 * happened. This is how the UI re-attaches on the way back.
 *
 * No schema lookup gymnastics needed: agent_runs.channelContactId already holds
 * exactly the `web-<tenant>-<agent>-<session>` key contactFromSession() builds.
 */
export async function getInFlightRunAction(
    sessionId: string,
    agentId: string = "",
    shared: boolean = false,
): Promise<{ runId: string; startedAt: string; partialContent: string; agentProfileId: string | null } | null> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return null;
    const tenantId = tenantCheck.tenantId;

    try {
        const contactId = contactFromSession(tenantId, agentId, shared, (sessionId || "").slice(0, 64));
        // Bounded by the same window the stale-run sweeper uses, so a run the
        // sweeper is about to reap never shows as live.
        const cutoff = new Date(Date.now() - 30 * 60 * 1000);
        const rows = await db
            .select({
                id: agentRuns.id,
                startedAt: agentRuns.startedAt,
                partialContent: agentRuns.partialContent,
                agentProfileId: agentRuns.agentProfileId,
            })
            .from(agentRuns)
            .where(and(
                eq(agentRuns.tenantId, tenantId),
                eq(agentRuns.channelContactId, contactId),
                eq(agentRuns.status, "running"),
                gt(agentRuns.startedAt, cutoff),
            ))
            .orderBy(desc(agentRuns.startedAt))
            .limit(1);

        const run = rows[0];
        if (!run) return null;
        return {
            runId: run.id,
            startedAt: (run.startedAt ?? new Date()).toISOString(),
            partialContent: run.partialContent ?? "",
            agentProfileId: run.agentProfileId ?? null,
        };
    } catch (e) {
        console.error("Failed to check for an in-flight run:", e);
        return null;
    }
}

/**
 * Every web chat in the workspace, for the History page.
 *
 * listSessionsAction filters by a per-agent contact-id prefix
 * (`web-<tenant>-<agent>-…`), which is right for the composer's own scope and
 * wrong here: chats created before per-agent scoping existed use the older
 * `web-<tenant>-…` shape, so History showed one row out of forty-six. This
 * matches every web conversation for the tenant and resolves the agent from
 * the contact id where it is present.
 */
export async function listAllWebSessionsAction(): Promise<
    (ChatSession & { agentName: string | null; agentId: string })[]
> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const convs = await db
            .select({
                id: conversations.id,
                contactId: conversations.channelContactId,
                updatedAt: conversations.updatedAt,
                metadata: conversations.metadata,
            })
            .from(conversations)
            .where(and(
                eq(conversations.tenantId, tenantId),
                eq(conversations.channelType, "webapp"),
                // Row scope as well as tenant scope. A contact-id prefix says
                // which agent a thread belongs to, not which person — so once
                // threads can be private it is not, on its own, a permission.
                visibleTo(conversations, tenantCheck.userId),
                like(conversations.channelContactId, `web-${tenantId}%`),
            ))
            .orderBy(desc(conversations.updatedAt))
            .limit(300);

        const profiles = await db
            .select({ id: agentProfiles.id, name: agentProfiles.name })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, tenantId));
        const nameById = new Map(profiles.map((p) => [p.id, p.name]));

        const out: (ChatSession & { agentName: string | null; agentId: string })[] = [];
        for (const c of convs) {
            const firstUser = await db
                .select({ content: messages.content })
                .from(messages)
                .where(and(eq(messages.conversationId, c.id), eq(messages.role, "user")))
                .orderBy(asc(messages.createdAt))
                .limit(1);
            if (!firstUser[0]) continue; // a chat nobody ever typed in is not history

            // `web-<tenant>-<agent>-<session>`: the segment after the tenant is the
            // agent when it matches one, and part of the session id when it does not.
            const rest = (c.contactId || "").slice(`web-${tenantId}-`.length);
            const firstSeg = rest.split("-").slice(0, 5).join("-");
            const agentId = nameById.has(firstSeg) ? firstSeg : "";
            const sessionId = agentId ? rest.slice(agentId.length + 1) : rest;

            out.push({
                sessionId,
                agentId,
                agentName: agentId ? nameById.get(agentId) ?? null : null,
                title: firstUser[0].content.replace(/\s+/g, " ").slice(0, 80) || "New chat",
                updatedAt: c.updatedAt?.toISOString() ?? new Date(0).toISOString(),
                preview: "",
                pinned: (c.metadata as any)?.pinned === true,
            });
        }
        return out;
    } catch (err) {
        console.error("Failed to list web sessions:", err);
        return [];
    }
}

/**
 * Delete several chats at once, from the History page.
 *
 * Each id is re-resolved through the same per-agent contact-id path a single
 * delete uses, and every conversation is re-checked against the caller's tenant
 * AND row visibility before anything is removed — a session id is guessable and
 * this destroys messages.
 */
export async function deleteSessionsAction(
    items: { sessionId: string; agentId: string }[],
    shared: boolean = false,
) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const wanted = (items || []).filter((i) => i && typeof i.sessionId === "string").slice(0, 200);
    if (wanted.length === 0) return { success: false as const, message: "Nothing selected." };

    let removed = 0;
    try {
        for (const { sessionId, agentId } of wanted) {
            const contactId = contactFromSession(tenantId, agentId || "", shared, sessionId.slice(0, 64));
            const conv = await db
                .select({ id: conversations.id })
                .from(conversations)
                .where(and(
                    eq(conversations.tenantId, tenantId),
                    eq(conversations.channelType, "webapp"),
                    eq(conversations.channelContactId, contactId),
                    visibleTo(conversations, tenantCheck.userId),
                ))
                .limit(1);
            if (!conv[0]) continue;

            const cid = conv[0].id;
            // Same order as the single delete: rows that reference the
            // conversation go first, or the delete throws on a foreign key.
            await db.delete(usageRecords).where(eq(usageRecords.conversationId, cid));
            await db.update(agentRuns).set({ conversationId: null }).where(eq(agentRuns.conversationId, cid));
            await db.delete(messages).where(eq(messages.conversationId, cid));
            await db.delete(conversations).where(eq(conversations.id, cid));
            removed++;
        }

        revalidatePath("/dashboard/assistant/history");
        return { success: true as const, message: `Deleted ${removed} chat${removed === 1 ? "" : "s"}.` };
    } catch (err) {
        console.error("Failed to delete chats:", err);
        return { success: false as const, message: "Failed to delete." };
    }
}
