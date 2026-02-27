import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../../storage/db";
import { routingRules, agentProfiles, tenants } from "../../../../storage/schema";
import { eq, asc } from "drizzle-orm";
import RoutingClient from "./RoutingClient";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");

    const tenantId = (session.user as any).tenantId;
    if (!tenantId) return redirect("/login");

    // Check if routing is enabled for this tenant
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
    });
    const routingEnabled = !!(tenant?.config as any)?.multi_agent_routing_enabled;

    if (!routingEnabled) {
        return (
            <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold text-slate-900 mb-6">Message Routing</h1>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-amber-900 mb-2">Feature Not Enabled</h2>
                    <p className="text-sm text-amber-800">
                        Multi-agent routing is not enabled for your workspace. Contact your administrator to enable this feature.
                    </p>
                </div>
            </div>
        );
    }

    // Fetch rules with agent names
    const rules = await db
        .select({
            id: routingRules.id,
            agentProfileId: routingRules.agentProfileId,
            agentName: agentProfiles.name,
            ruleType: routingRules.ruleType,
            matchValue: routingRules.matchValue,
            priority: routingRules.priority,
            enabled: routingRules.enabled,
            description: routingRules.description,
            createdAt: routingRules.createdAt,
        })
        .from(routingRules)
        .leftJoin(agentProfiles, eq(routingRules.agentProfileId, agentProfiles.id))
        .where(eq(routingRules.tenantId, tenantId))
        .orderBy(asc(routingRules.priority));

    // Fetch agents for the dropdown
    const agents = await db.query.agentProfiles.findMany({
        where: eq(agentProfiles.tenantId, tenantId),
    });

    return (
        <div className="max-w-5xl mx-auto">
            <RoutingClient
                rules={rules.map((r) => ({
                    ...r,
                    agentName: r.agentName ?? "Unknown Agent",
                    description: r.description ?? "",
                    createdAt: r.createdAt?.toISOString() ?? "",
                }))}
                agents={agents.map((a) => ({ id: a.id, name: a.name }))}
            />
        </div>
    );
}
