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

    // Session list + the most-recent session's history (the one the UI opens on).
    const sessions = await listSessionsAction();
    const initialSessionId = sessions[0]?.sessionId ?? "";
    const initialHistory = sessions.length ? await getSessionHistoryAction(initialSessionId) : [];

    const branding = await getBrandingConfig();

    return (
        <AssistantClient
            agents={activeAgents}
            sessions={sessions}
            initialSessionId={initialSessionId}
            initialHistory={initialHistory}
            showIdentityPref={branding.showAgentIdentity}
            voiceEnabled={branding.voiceEnabled && branding.voiceConfigured}
        />
    );
}
