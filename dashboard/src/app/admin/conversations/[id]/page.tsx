import { db } from "../../../../storage/db";
import { conversations, messages, tenants } from "../../../../storage/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import AdminConversationDetailClient from "./AdminConversationDetailClient";

export default async function AdminConversationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const { id } = await params;

    const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
    });

    if (!conversation) notFound();

    // Get tenant name
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, conversation.tenantId),
    });

    const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(asc(messages.createdAt));

    const serializedMessages = msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt?.toISOString() ?? "",
    }));

    return (
        <AdminConversationDetailClient
            conversation={{
                id: conversation.id,
                channelType: conversation.channelType,
                channelContactId: conversation.channelContactId,
                contactName: conversation.contactName,
                status: conversation.status,
                createdAt: conversation.createdAt?.toISOString() ?? "",
                tenantName: tenant?.name ?? "Unknown",
            }}
            messages={serializedMessages}
        />
    );
}
