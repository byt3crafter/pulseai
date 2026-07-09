import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../../storage/db";
import { getActiveProvidersAction } from "../[id]/actions";
import { eq, and } from "drizzle-orm";
import NewAgentClient from "./NewAgentClient";

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    // Single source of truth for selectable providers (excludes OAuth-only
    // OpenAI, includes host-level codex) — same list as the edit page.
    const connectedProviders = await getActiveProvidersAction();

    return <NewAgentClient connectedProviders={connectedProviders} />;
}
