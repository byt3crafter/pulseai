import { requireTenant } from "../../../utils/tenant-auth";
import { redirect } from "next/navigation";
import { listLibrary, listAgentAssignments } from "./actions";
import SkillsClient from "./SkillsClient";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const check = await requireTenant();
    if (!check.authorized) return redirect("/login");

    const [library, agents] = await Promise.all([listLibrary(), listAgentAssignments()]);
    return <SkillsClient library={library} agents={agents} />;
}
