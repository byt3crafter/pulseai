"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { messages, conversations, usageRecords, agentRuns } from "../../../storage/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";
import { deleteConversationsCascade } from "../../../utils/delete-conversation";
import { logAudit } from "../../../utils/audit";

export async function getConversationMessagesAction(conversationId: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return [];

    const rows = await db
        .select()
        .from(messages)
        .where(
            and(
                eq(messages.conversationId, conversationId),
                eq(messages.tenantId, session.user.tenantId)
            )
        )
        .orderBy(asc(messages.createdAt));

    return rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt?.toISOString() ?? "",
    }));
}


/**
 * Delete conversations and everything hanging off them.
 *
 * Ids come from the browser, so every one is re-checked against the caller's
 * tenant before anything is removed — a conversation id is guessable and this
 * is a destructive, cross-channel action.
 *
 * The order matters: usage records and agent runs reference a conversation, and
 * deleting the conversation first throws a foreign-key error. That failure used
 * to be swallowed, which made "delete" quietly do nothing.
 */
export async function deleteConversationsAction(ids: string[]) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const wanted = (ids || []).filter((v) => typeof v === "string" && v.length > 0).slice(0, 200);
    if (wanted.length === 0) return { success: false as const, message: "Nothing selected." };

    try {
        // Only ids that genuinely belong to this workspace survive this.
        const owned = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(and(eq(conversations.tenantId, tenantId), inArray(conversations.id, wanted)));
        const cids = owned.map((c) => c.id);
        if (cids.length === 0) return { success: false as const, message: "Nothing to delete." };

        await deleteConversationsCascade(cids);

        await logAudit({
            action: "conversation.delete",
            targetType: "conversation",
            targetId: cids.length === 1 ? cids[0] : `${cids.length} conversations`,
            tenantId,
            summary: `Deleted ${cids.length} conversation${cids.length === 1 ? "" : "s"}`,
            metadata: { count: cids.length },
        });

        revalidatePath("/dashboard/conversations");
        return { success: true as const, message: `Deleted ${cids.length} conversation${cids.length === 1 ? "" : "s"}.` };
    } catch (err) {
        console.error("Failed to delete conversations:", err);
        return { success: false as const, message: "Failed to delete." };
    }
}
