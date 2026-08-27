import { db } from "../../../storage/db";
import { conversations, messages } from "../../../storage/schema";
import { scopedTo } from "../../../utils/visibility";
import { eq, sql, desc } from "drizzle-orm";
import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import ConversationsClient from "./ConversationsClient";

// Live data (message counts, last-updated) — never statically cache, or the
// list freezes at the state it had when first rendered (all "0 messages").
export const dynamic = "force-dynamic";

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
        .where(scopedTo(conversations, session.user.tenantId, (session.user as any).id, "conversation"))
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
