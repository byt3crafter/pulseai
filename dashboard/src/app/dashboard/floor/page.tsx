import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import { getFloorOrg, getFloorState } from "./actions";
import { spriteForAgent } from "./sprite-png";
import FloorClient from "./FloorClient";
import type { FloorAgent } from "./types";

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

    return (
        <div>
            <PageHeader
                title="The Floor"
                description="Your AI workforce at work. Departments are rooms; every agent has a desk. Work arrives as a slip."
            />
            <FloorClient
                agents={agents}
                departments={org.departments}
                unassigned={org.unassigned}
                initial={snapshot}
            />
        </div>
    );
}
