"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { messages } from "../../../storage/schema";
import { eq, and, asc } from "drizzle-orm";

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
