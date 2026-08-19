import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { agentProfiles } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import AssistantClient from "./AssistantClient";
import { listSessionsAction, getSessionHistoryAction } from "./actions";
import { getBrandingConfig } from "../settings/actions";

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

    const branding = await getBrandingConfig();
    const shared = branding.assistantChatMode === "shared";
    // The agent the UI opens on: its own chats (separate mode) or the shared room.
    const initialAgentId = activeAgents[0]?.id ?? "";

    // Session list + the most-recent session's history (the one the UI opens on),
    // scoped to that agent (or the shared room) so nothing mixes.
    const sessions = await listSessionsAction(initialAgentId, shared);
    const initialSessionId = sessions[0]?.sessionId ?? "";
    const initialHistory = sessions.length ? await getSessionHistoryAction(initialSessionId, initialAgentId, shared) : [];

    return (
        <AssistantClient
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
