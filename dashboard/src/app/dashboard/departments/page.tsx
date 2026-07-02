import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import {
    channels,
    channelAgents,
    channelMembers,
    channelMemberAgents,
    agentProfiles,
    users,
} from "../../../storage/schema";
import { eq } from "drizzle-orm";
import DepartmentsClient from "./DepartmentsClient";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const [channelRows, agentRows, userRows, agentLinks, memberLinks, memberAgentLinks] = await Promise.all([
        db.select().from(channels).where(eq(channels.tenantId, tenantId)),
        db.select({ id: agentProfiles.id, name: agentProfiles.name })
            .from(agentProfiles).where(eq(agentProfiles.tenantId, tenantId)),
        db.select({ id: users.id, name: users.name, email: users.email })
            .from(users).where(eq(users.tenantId, tenantId)),
        db.select().from(channelAgents),
        db.select().from(channelMembers),
        db.select().from(channelMemberAgents),
    ]);

    // Only links for this tenant's channels (channelAgents/Members aren't tenant-scoped columns).
    const channelIds = new Set(channelRows.map((c) => c.id));
    const agents = agentLinks.filter((l) => channelIds.has(l.channelId));
    const members = memberLinks.filter((l) => channelIds.has(l.channelId));
    const memberAgents = memberAgentLinks.filter((l) => channelIds.has(l.channelId));

    return (
        <DepartmentsClient
            channels={channelRows}
            allAgents={agentRows}
            allUsers={userRows}
            channelAgents={agents}
            channelMembers={members}
            channelMemberAgents={memberAgents}
        />
    );
}
