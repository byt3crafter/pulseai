import { db } from "../../../storage/db";
import { conversations, messages, tenants } from "../../../storage/schema";
import { eq, sql, desc } from "drizzle-orm";
import AdminConversationsClient from "./AdminConversationsClient";

export default async function AdminConversationsPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const rows = await db
        .select({
            id: conversations.id,
            tenantId: conversations.tenantId,
            tenantName: tenants.name,
            channelType: conversations.channelType,
            channelContactId: conversations.channelContactId,
            contactName: conversations.contactName,
            status: conversations.status,
            createdAt: conversations.createdAt,
            updatedAt: conversations.updatedAt,
            messageCount: sql<number>`(select count(*) from messages where messages.conversation_id = ${conversations.id})`,
        })
        .from(conversations)
        .leftJoin(tenants, eq(conversations.tenantId, tenants.id))
        .orderBy(desc(conversations.updatedAt))
        .limit(200);

    const data = rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenantName ?? "Unknown",
        channelType: r.channelType,
        channelContactId: r.channelContactId,
        contactName: r.contactName,
        status: r.status,
        createdAt: r.createdAt?.toISOString() ?? "",
        updatedAt: r.updatedAt?.toISOString() ?? "",
        messageCount: Number(r.messageCount),
    }));

    // Extract unique tenant names for filter
    const tenantNames = [...new Set(data.map((d) => d.tenantName))].sort();

    return (
        <AdminConversationsClient
            conversations={data}
            tenantNames={tenantNames}
        />
    );
}
