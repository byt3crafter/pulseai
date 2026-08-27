import { inArray } from "drizzle-orm";
import { db } from "../storage/db";
import {
    agentDelegations,
    agentRuns,
    conversations,
    execAuditLog,
    messages,
    usageRecords,
} from "../storage/schema";

/**
 * Delete conversations and release everything that references them.
 *
 * There are three delete paths (single chat, bulk chats, the Conversations
 * page) and each had grown its own idea of what to clear first. They were all
 * incomplete in different ways, and the symptom is always the same: a foreign
 * key error surfaced as "Failed to delete", or worse, swallowed so the button
 * appeared to do nothing. One implementation, used by all three.
 *
 * What is deleted and what is kept is a deliberate distinction:
 *
 *   messages          DELETED  — they ARE the conversation
 *   usage_records     KEPT     — billing history must outlive a deleted chat
 *   agent_runs        KEPT     — the operational record of what ran
 *   agent_delegations KEPT     — who handed work to whom
 *   exec_audit_log    KEPT     — an audit log you can erase by deleting a chat
 *                                is not an audit log
 *
 * Everything kept has its conversation_id set to NULL, which is why each of
 * those columns is nullable. Order matters: references are released before the
 * row they point at goes.
 */
export async function deleteConversationsCascade(conversationIds: string[]): Promise<number> {
    const cids = conversationIds.filter(Boolean);
    if (cids.length === 0) return 0;

    await db.update(usageRecords).set({ conversationId: null }).where(inArray(usageRecords.conversationId, cids));
    await db.update(agentRuns).set({ conversationId: null }).where(inArray(agentRuns.conversationId, cids));
    await db.update(agentDelegations).set({ conversationId: null }).where(inArray(agentDelegations.conversationId, cids));
    await db.update(execAuditLog).set({ conversationId: null }).where(inArray(execAuditLog.conversationId, cids));

    await db.delete(messages).where(inArray(messages.conversationId, cids));
    await db.delete(conversations).where(inArray(conversations.id, cids));
    return cids.length;
}
