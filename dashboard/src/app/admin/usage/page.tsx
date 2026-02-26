import { db } from "../../../storage/db";
import { usageRecords, tenants } from "../../../storage/schema";
import { eq, sql, desc } from "drizzle-orm";
import AdminUsageClient from "./AdminUsageClient";

export default async function AdminUsagePage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const [platformTotals, topTenantsByUsage, modelDistribution] =
        await Promise.all([
            // Total platform usage
            db
                .select({
                    totalInputTokens: sql<string>`coalesce(sum(${usageRecords.inputTokens}::numeric), 0)`,
                    totalOutputTokens: sql<string>`coalesce(sum(${usageRecords.outputTokens}::numeric), 0)`,
                    totalCost: sql<string>`coalesce(sum(${usageRecords.costUsd}::numeric), 0)`,
                    totalCredits: sql<string>`coalesce(sum(${usageRecords.creditsUsed}::numeric), 0)`,
                    totalRequests: sql<number>`count(*)`,
                })
                .from(usageRecords),

            // Top 10 tenants by cost
            db
                .select({
                    tenantId: usageRecords.tenantId,
                    tenantName: tenants.name,
                    totalCost: sql<string>`coalesce(sum(${usageRecords.costUsd}::numeric), 0)`,
                    totalTokens: sql<string>`coalesce(sum(${usageRecords.inputTokens}::numeric + ${usageRecords.outputTokens}::numeric), 0)`,
                    requestCount: sql<number>`count(*)`,
                })
                .from(usageRecords)
                .leftJoin(tenants, eq(usageRecords.tenantId, tenants.id))
                .groupBy(usageRecords.tenantId, tenants.name)
                .orderBy(desc(sql`sum(${usageRecords.costUsd}::numeric)`))
                .limit(10),

            // Model distribution
            db
                .select({
                    model: usageRecords.model,
                    totalCost: sql<string>`coalesce(sum(${usageRecords.costUsd}::numeric), 0)`,
                    totalTokens: sql<string>`coalesce(sum(${usageRecords.inputTokens}::numeric + ${usageRecords.outputTokens}::numeric), 0)`,
                    requestCount: sql<number>`count(*)`,
                })
                .from(usageRecords)
                .groupBy(usageRecords.model)
                .orderBy(desc(sql`sum(${usageRecords.costUsd}::numeric)`)),
        ]);

    const totals = platformTotals[0] ?? {
        totalInputTokens: "0",
        totalOutputTokens: "0",
        totalCost: "0",
        totalCredits: "0",
        totalRequests: 0,
    };

    const serializedTenants = topTenantsByUsage.map((t) => ({
        tenantId: t.tenantId,
        tenantName: t.tenantName ?? "Unknown",
        totalCost: parseFloat(t.totalCost),
        totalTokens: parseFloat(t.totalTokens),
        requestCount: Number(t.requestCount),
    }));

    const serializedModels = modelDistribution.map((m) => ({
        model: m.model,
        totalCost: parseFloat(m.totalCost),
        totalTokens: parseFloat(m.totalTokens),
        requestCount: Number(m.requestCount),
    }));

    return (
        <AdminUsageClient
            totalInputTokens={parseFloat(totals.totalInputTokens)}
            totalOutputTokens={parseFloat(totals.totalOutputTokens)}
            totalCost={parseFloat(totals.totalCost)}
            totalCredits={parseFloat(totals.totalCredits)}
            totalRequests={Number(totals.totalRequests)}
            topTenants={serializedTenants}
            modelDistribution={serializedModels}
        />
    );
}
