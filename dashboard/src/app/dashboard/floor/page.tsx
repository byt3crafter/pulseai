import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import { getFloorOrg, getFloorState } from "./actions";
import { spriteForAgent, spriteForHuman } from "./sprite-png";
import FloorClient from "./FloorClient";
import type { FloorAgent, FloorHuman } from "./types";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    const [org, snapshot] = await Promise.all([getFloorOrg(), getFloorState()]);

    // Avatars are generated here, in the Server Component: the pipeline is pure
    // Node maths and the sprites go down as plain props. That is what keeps the
    // page free of canvas code, SSR guards and theme-change regeneration.
    const agents: FloorAgent[] = org.agents.map((a) => ({
        ...a,
        sprite: spriteForAgent(a.id, a.name),
    }));

    const humans: FloorHuman[] = org.humans.map((h) => ({
        ...h,
        sprite: spriteForHuman(h.id, h.name),
    }));

    return (
        // Page padding is per-page in this app: <main> in DashboardShell has none.
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
            <PageHeader
                title="The Floor"
                description="Your AI workforce at work. Departments are rooms; every agent has a desk. Work arrives as a slip."
            />
            <FloorClient
                agents={agents}
                departments={org.departments}
                unassigned={org.unassigned}
                humans={humans}
                initial={snapshot}
            />
        </div>
    );
}
