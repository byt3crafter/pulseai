import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../../storage/db";
import { agentProfiles } from "../../../../storage/schema";
import { eq } from "drizzle-orm";
import ToolEditor from "../ToolEditor";

export const dynamic = "force-dynamic";

export default async function NewToolPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const agents = await db.select({ id: agentProfiles.id, name: agentProfiles.name })
        .from(agentProfiles)
        .where(eq(agentProfiles.tenantId, tenantId));

    return <ToolEditor agents={agents} />;
}
