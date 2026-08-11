import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../../storage/db";
import { routingRules, agentProfiles, tenants } from "../../../../storage/schema";
import { eq, asc } from "drizzle-orm";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { PageHeader, Card } from "../../../../components/dashboard/ui";
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
            <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
                <PageHeader
                    title="Message Routing"
                    description="Route incoming messages to different agents based on rules."
                />
                <Card>
                    <div className="flex items-start gap-3 p-5">
                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <div>
                            <h2 className="text-sm font-semibold text-pulse-text">Feature not enabled</h2>
                            <p className="text-sm text-pulse-muted mt-1">
                                Multi-agent routing is not enabled for your workspace. Contact your administrator to enable this feature.
                            </p>
                        </div>
                    </div>
                </Card>
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
        <RoutingClient
            rules={rules.map((r) => ({
                ...r,
                agentName: r.agentName ?? "Unknown Agent",
                description: r.description ?? "",
                createdAt: r.createdAt?.toISOString() ?? "",
            }))}
            agents={agents.map((a) => ({ id: a.id, name: a.name }))}
        />
    );
}
