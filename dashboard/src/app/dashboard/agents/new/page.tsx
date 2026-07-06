import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../../storage/db";
import { tenantProviderKeys } from "../../../../storage/schema";
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

    const providerRows = await db.select({ provider: tenantProviderKeys.provider })
        .from(tenantProviderKeys)
        .where(and(eq(tenantProviderKeys.tenantId, tenantId), eq(tenantProviderKeys.isActive, true)));
    const connectedProviders = providerRows.map((r) => r.provider);

    return <NewAgentClient connectedProviders={connectedProviders} />;
}
