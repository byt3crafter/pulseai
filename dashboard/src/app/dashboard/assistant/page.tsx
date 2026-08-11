import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { agentProfiles, conversations, messages } from "../../../storage/schema";
import { and, eq, asc } from "drizzle-orm";
import AssistantClient from "./AssistantClient";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");
    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) return redirect("/login");

    const agents = await db
        .select({ id: agentProfiles.id, name: agentProfiles.name, avatar: agentProfiles.avatar, title: agentProfiles.title, enabled: agentProfiles.enabled })
        .from(agentProfiles)
        .where(eq(agentProfiles.tenantId, tenantId));
    const activeAgents = agents.filter((a) => a.enabled !== false);

    // Load the persistent web-chat history (same conversation the WS writes to).
    const webContact = `web-${tenantId}`;
    const conv = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.channelType, "webapp"), eq(conversations.channelContactId, webContact)))
        .limit(1);
    let history: { role: string; content: string }[] = [];
    if (conv[0]) {
        const rows = await db
            .select({ role: messages.role, content: messages.content })
            .from(messages)
            .where(eq(messages.conversationId, conv[0].id))
            .orderBy(asc(messages.createdAt))
            .limit(200);
        history = rows
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content }));
    }

    return <AssistantClient agents={activeAgents} history={history} />;
}
