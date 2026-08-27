import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { agentProfiles } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import AssistantClient from "./AssistantClient";
import { listSessionsAction, getSessionHistoryAction } from "./actions";
import { getBrandingConfig } from "../settings/actions";

export const dynamic = "force-dynamic";

export default async function AssistantPage({
    searchParams,
}: {
    searchParams: Promise<{ session?: string }>;
}) {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");
    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) return redirect("/login");

    const agents = await db
        .select({ id: agentProfiles.id, name: agentProfiles.name, avatar: agentProfiles.avatar, title: agentProfiles.title, enabled: agentProfiles.enabled, modelId: agentProfiles.modelId })
        .from(agentProfiles)
        .where(eq(agentProfiles.tenantId, tenantId));
    const activeAgents = agents.filter((a) => a.enabled !== false);

    const branding = await getBrandingConfig();
    const shared = branding.assistantChatMode === "shared";
    // The agent the UI opens on: its own chats (separate mode) or the shared room.
    const initialAgentId = activeAgents[0]?.id ?? "";

    /*
     * The assistant opens on a NEW chat, not on the last one.
     *
     * It used to resume the most recent conversation, which was fine when a rail
     * listed every chat beside it. With history moved to its own page, that
     * behaviour meant "New chat" in the nav dropped you back into an old thread
     * and the greeting could never appear. A past chat is opened deliberately,
     * from History, via ?session=.
     */
    const sessions = await listSessionsAction(initialAgentId, shared);
    const sp = await searchParams;
    const wanted = typeof sp?.session === "string" ? sp.session : "";
    const initialSessionId = wanted && sessions.some((s) => s.sessionId === wanted) ? wanted : "";
    const initialHistory = initialSessionId
        ? await getSessionHistoryAction(initialSessionId, initialAgentId, shared)
        : [];

    return (
        <AssistantClient
            userName={((session.user as any).name || session.user.email || "").toString()}
            agents={activeAgents}
            sessions={sessions}
            initialSessionId={initialSessionId}
            initialHistory={initialHistory}
            showIdentityPref={branding.showAgentIdentity}
            voiceEnabled={branding.voiceEnabled && branding.voiceConfigured}
            chatMode={branding.assistantChatMode}
        />
    );
}
