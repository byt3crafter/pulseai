import { db } from "../../../../storage/db";
import { conversations, messages } from "../../../../storage/schema";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "../../../../auth";
import { redirect, notFound } from "next/navigation";
import ConversationDetailClient from "./ConversationDetailClient";

export default async function ConversationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    const { id } = await params;

    const conversation = await db.query.conversations.findFirst({
        where: and(
            eq(conversations.id, id),
            eq(conversations.tenantId, session.user.tenantId)
        ),
    });

    if (!conversation) notFound();

    const msgs = await db
        .select()
        .from(messages)
        .where(
            and(
                eq(messages.conversationId, id),
                eq(messages.tenantId, session.user.tenantId)
            )
        )
        .orderBy(asc(messages.createdAt));

    const serializedMessages = msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt?.toISOString() ?? "",
    }));

    return (
        <ConversationDetailClient
            conversation={{
                id: conversation.id,
                channelType: conversation.channelType,
                channelContactId: conversation.channelContactId,
                contactName: conversation.contactName,
                status: conversation.status,
                createdAt: conversation.createdAt?.toISOString() ?? "",
            }}
            messages={serializedMessages}
        />
    );
}
