import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../../storage/db";
import { agentProfiles } from "../../../../storage/schema";
import { eq } from "drizzle-orm";
import { listSessionsAction } from "../actions";
import HistoryClient from "./HistoryClient";

export const dynamic = "force-dynamic";

/**
 * Chat history as a page, not a rail.
 *
 * v4 gives past conversations a full canvas — title, which agent, when — instead
 * of a permanently docked column. The column cost 256px on every screen for
 * something you need a few times a day, and truncated every title to fit.
 */
export default async function AssistantHistoryPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) redirect("/login");

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) redirect("/login");

    const agents = (await db
        .select({ id: agentProfiles.id, name: agentProfiles.name, enabled: agentProfiles.enabled })
        .from(agentProfiles)
        .where(eq(agentProfiles.tenantId, tenantId))).filter((a) => a.enabled !== false);
    // Sessions are per-agent, so the page gathers every agent's and merges them —
    // the rail could only ever show the agent you had selected.
    const perAgent = await Promise.all(
        agents.map(async (a) => (await listSessionsAction(a.id, false)).map((s) => ({ ...s, agentName: a.name })))
    );
    const sessions = perAgent.flat().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    return <HistoryClient sessions={sessions} />;
}
