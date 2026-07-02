"use server";

import { db } from "../../../../../storage/db";
import { memoryEntries } from "../../../../../storage/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../../utils/tenant-auth";

export async function getAgentMemories(agentId: string, page = 0, pageSize = 30) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { memories: [], total: 0, page, pageSize };
    const tenantId = tenantCheck.tenantId;

    const offset = page * pageSize;
    const memories = await db
        .select({
            id: memoryEntries.id,
            content: memoryEntries.content,
            category: memoryEntries.category,
            importance: memoryEntries.importance,
            accessCount: memoryEntries.accessCount,
            createdAt: memoryEntries.createdAt,
            accessedAt: memoryEntries.accessedAt,
        })
        .from(memoryEntries)
        .where(and(eq(memoryEntries.agentId, agentId), eq(memoryEntries.tenantId, tenantId)))
        .orderBy(desc(memoryEntries.createdAt))
        .limit(pageSize)
        .offset(offset);

    const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(memoryEntries)
        .where(and(eq(memoryEntries.agentId, agentId), eq(memoryEntries.tenantId, tenantId)));
    const total = Number(countResult[0]?.count || 0);

    return { memories, total, page, pageSize };
}

export async function getMemoryStats(agentId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return {};
    const tenantId = tenantCheck.tenantId;

    const result = await db.execute(sql`
        SELECT
            count(*) as total,
            count(*) FILTER (WHERE category = 'fact') as facts,
            count(*) FILTER (WHERE category = 'preference') as preferences,
            count(*) FILTER (WHERE category = 'decision') as decisions,
            count(*) FILTER (WHERE category = 'task') as tasks,
            count(*) FILTER (WHERE category = 'relationship') as relationships,
            count(*) FILTER (WHERE category = 'general') as general
        FROM memory_entries
        WHERE agent_id = ${agentId} AND tenant_id = ${tenantId}
    `);
    return (result as any[])[0] || {};
}

export async function deleteMemory(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const memoryId = formData.get("memoryId") as string;
    const agentId = formData.get("agentId") as string;
    await db.delete(memoryEntries).where(and(eq(memoryEntries.id, memoryId), eq(memoryEntries.tenantId, tenantId)));
    revalidatePath(`/dashboard/agents/${agentId}/memory`);
}

export async function bulkDeleteMemories(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const agentId = formData.get("agentId") as string;
    const category = formData.get("category") as string;

    if (category === "all") {
        await db.delete(memoryEntries).where(and(eq(memoryEntries.agentId, agentId), eq(memoryEntries.tenantId, tenantId)));
    } else if (category) {
        await db.delete(memoryEntries).where(
            and(eq(memoryEntries.agentId, agentId), eq(memoryEntries.tenantId, tenantId), eq(memoryEntries.category, category))
        );
    }

    revalidatePath(`/dashboard/agents/${agentId}/memory`);
}
