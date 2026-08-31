import { requireTenant } from "../../../../utils/tenant-auth";
import { redirect } from "next/navigation";
import { listModelGroups } from "./actions";
import { getActiveProvidersAction } from "../[id]/actions";
import { PROVIDERS } from "../../../../utils/models";
import ModelGroupsClient from "./ModelGroupsClient";

export const dynamic = "force-dynamic";

export default async function ModelGroupsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const check = await requireTenant();
    if (!check.authorized) return redirect("/login");

    const [groups, active] = await Promise.all([listModelGroups(), getActiveProvidersAction()]);
    // Only models from providers that actually have a key — you can't group what you can't call.
    const available = PROVIDERS.filter((p) => active.includes(p.id)).flatMap((p) =>
        p.models.map((m) => ({ id: m.id, label: m.displayName ?? m.id, provider: p.name })),
    );
    return <ModelGroupsClient groups={groups} available={available} />;
}
