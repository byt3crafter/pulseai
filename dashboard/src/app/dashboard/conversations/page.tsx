import { db } from "../../../storage/db";
import { conversations, messages } from "../../../storage/schema";
import { eq, sql, desc } from "drizzle-orm";
import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import ConversationsClient from "./ConversationsClient";

export default async function ConversationsPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    const rows = await db
        .select({
            id: conversations.id,
            channelType: conversations.channelType,
            channelContactId: conversations.channelContactId,
            contactName: conversations.contactName,
            status: conversations.status,
            createdAt: conversations.createdAt,
            updatedAt: conversations.updatedAt,
            messageCount: sql<number>`(select count(*) from messages where messages.conversation_id = ${conversations.id})`,
        })
        .from(conversations)
        .where(eq(conversations.tenantId, session.user.tenantId))
        .orderBy(desc(conversations.updatedAt));

    const data = rows.map((r) => ({
        id: r.id,
        channelType: r.channelType,
        channelContactId: r.channelContactId,
        contactName: r.contactName,
        status: r.status,
        createdAt: r.createdAt?.toISOString() ?? "",
        updatedAt: r.updatedAt?.toISOString() ?? "",
        messageCount: Number(r.messageCount),
    }));

    return <ConversationsClient conversations={data} />;
}
