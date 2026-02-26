"use server";

import { db } from "../../../../../storage/db";
import { memoryEntries } from "../../../../../storage/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getAgentMemories(agentId: string, page = 0, pageSize = 30) {
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
        .where(eq(memoryEntries.agentId, agentId))
        .orderBy(desc(memoryEntries.createdAt))
        .limit(pageSize)
        .offset(offset);

    const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(memoryEntries)
        .where(eq(memoryEntries.agentId, agentId));
    const total = Number(countResult[0]?.count || 0);

    return { memories, total, page, pageSize };
}

export async function getMemoryStats(agentId: string) {
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
        WHERE agent_id = ${agentId}
    `);
    return (result as any[])[0] || {};
}

export async function deleteMemory(formData: FormData) {
    const memoryId = formData.get("memoryId") as string;
    const agentId = formData.get("agentId") as string;
    await db.delete(memoryEntries).where(eq(memoryEntries.id, memoryId));
    revalidatePath(`/dashboard/agents/${agentId}/memory`);
}

export async function bulkDeleteMemories(formData: FormData) {
    const agentId = formData.get("agentId") as string;
    const category = formData.get("category") as string;

    if (category === "all") {
        await db.delete(memoryEntries).where(eq(memoryEntries.agentId, agentId));
    } else if (category) {
        await db.delete(memoryEntries).where(
            sql`${memoryEntries.agentId} = ${agentId} AND ${memoryEntries.category} = ${category}`
        );
    }

    revalidatePath(`/dashboard/agents/${agentId}/memory`);
}
