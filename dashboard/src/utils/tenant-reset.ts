import "server-only";
import { db } from "../storage/db";
import { sql } from "drizzle-orm";

/**
 * Escalating reset scopes. Each is a superset of the previous:
 *  - "chat":   conversations + messages (and their FK children)
 *  - "memory": the above + agent memory (vector / auto-memory)
 *  - "all":    the above + usage records + agent execution logs
 *
 * NEVER touched: agents, channels, users, credentials, provider keys,
 * tenant_skills (config), or the platform security audit trail (audit_logs).
 * Wiping the accountability log during a destructive reset would defeat its
 * whole purpose, so it is deliberately preserved.
 */
export type ResetScope = "chat" | "memory" | "all";

export interface ResetCounts {
    conversations: number;
    messages: number;
    memoryEntries: number;
    usageRecords: number;
    execAuditLog: number;
}

/**
 * Reset a tenant's operational data in a single all-or-nothing transaction.
 * Returns the number of rows deleted per bucket (for the UI + audit metadata).
 * Scoped strictly by tenantId — cannot cross tenants.
 */
export async function resetTenantWorkspace(
    tenantId: string,
    scope: ResetScope
): Promise<ResetCounts> {
    const counts: ResetCounts = {
        conversations: 0,
        messages: 0,
        memoryEntries: 0,
        usageRecords: 0,
        execAuditLog: 0,
    };

    await db.transaction(async (tx) => {
        const count = async (q: ReturnType<typeof sql>): Promise<number> => {
            const rows = (await tx.execute(q)) as unknown as Array<{ n: number }>;
            return Number(rows?.[0]?.n ?? 0);
        };
        // Reusable subquery: the ids of this tenant's conversations.
        const convIds = sql`SELECT id FROM conversations WHERE tenant_id = ${tenantId}::uuid`;

        // ── chat (always) ──
        counts.conversations = await count(
            sql`SELECT count(*)::int AS n FROM conversations WHERE tenant_id = ${tenantId}::uuid`
        );
        counts.messages = await count(
            sql`SELECT count(*)::int AS n FROM messages WHERE conversation_id IN (${convIds})`
        );
        // Children first so conversation deletes don't hit FK constraints / orphan rows.
        await tx.execute(sql`DELETE FROM agent_delegations WHERE conversation_id IN (${convIds})`);
        await tx.execute(sql`DELETE FROM exec_audit_log WHERE conversation_id IN (${convIds})`);
        await tx.execute(sql`DELETE FROM usage_records WHERE conversation_id IN (${convIds})`);
        await tx.execute(sql`DELETE FROM messages WHERE conversation_id IN (${convIds})`);
        await tx.execute(sql`DELETE FROM conversations WHERE tenant_id = ${tenantId}::uuid`);

        // ── memory ──
        if (scope === "memory" || scope === "all") {
            counts.memoryEntries = await count(
                sql`SELECT count(*)::int AS n FROM memory_entries WHERE tenant_id = ${tenantId}::uuid`
            );
            await tx.execute(sql`DELETE FROM memory_entries WHERE tenant_id = ${tenantId}::uuid`);
        }

        // ── usage + agent execution logs ──
        if (scope === "all") {
            counts.usageRecords = await count(
                sql`SELECT count(*)::int AS n FROM usage_records WHERE tenant_id = ${tenantId}::uuid`
            );
            counts.execAuditLog = await count(
                sql`SELECT count(*)::int AS n FROM exec_audit_log WHERE tenant_id = ${tenantId}::uuid`
            );
            await tx.execute(sql`DELETE FROM usage_records WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM exec_audit_log WHERE tenant_id = ${tenantId}::uuid`);
        }
    });

    return counts;
}
