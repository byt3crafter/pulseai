import { db } from "../../../storage/db";
import {
    usageRecords,
    ledgerTransactions,
    tenantBalances,
} from "../../../storage/schema";
import { eq, sql, desc } from "drizzle-orm";
import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import UsageClient from "./UsageClient";

export default async function UsagePage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    const tenantId = session.user.tenantId;

    const [summaryByModel, recentUsage, recentLedger, balanceRow] =
        await Promise.all([
            // Usage summary grouped by model
            db
                .select({
                    model: usageRecords.model,
                    totalInputTokens: sql<string>`coalesce(sum(${usageRecords.inputTokens}::numeric), 0)`,
                    totalOutputTokens: sql<string>`coalesce(sum(${usageRecords.outputTokens}::numeric), 0)`,
                    totalCost: sql<string>`coalesce(sum(${usageRecords.costUsd}::numeric), 0)`,
                    totalCredits: sql<string>`coalesce(sum(${usageRecords.creditsUsed}::numeric), 0)`,
                    count: sql<number>`count(*)`,
                })
                .from(usageRecords)
                .where(eq(usageRecords.tenantId, tenantId))
                .groupBy(usageRecords.model),

            // Recent usage records (last 50)
            db
                .select()
                .from(usageRecords)
                .where(eq(usageRecords.tenantId, tenantId))
                .orderBy(desc(usageRecords.createdAt))
                .limit(50),

            // Recent ledger transactions (last 50)
            db
                .select()
                .from(ledgerTransactions)
                .where(eq(ledgerTransactions.tenantId, tenantId))
                .orderBy(desc(ledgerTransactions.createdAt))
                .limit(50),

            // Current balance
            db
                .select()
                .from(tenantBalances)
                .where(eq(tenantBalances.tenantId, tenantId))
                .limit(1),
        ]);

    // Compute totals
    const totalTokens = summaryByModel.reduce(
        (acc, r) =>
            acc + parseFloat(r.totalInputTokens) + parseFloat(r.totalOutputTokens),
        0
    );
    const totalCost = summaryByModel.reduce(
        (acc, r) => acc + parseFloat(r.totalCost),
        0
    );
    const totalCredits = summaryByModel.reduce(
        (acc, r) => acc + parseFloat(r.totalCredits),
        0
    );
    const balance = balanceRow[0]
        ? parseFloat(balanceRow[0].balance)
        : 0;

    const modelBreakdown = summaryByModel.map((r) => ({
        model: r.model,
        totalInputTokens: parseFloat(r.totalInputTokens),
        totalOutputTokens: parseFloat(r.totalOutputTokens),
        totalCost: parseFloat(r.totalCost),
        totalCredits: parseFloat(r.totalCredits),
        count: Number(r.count),
    }));

    const serializedUsage = recentUsage.map((r) => ({
        id: r.id,
        conversationId: r.conversationId,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: r.costUsd,
        creditsUsed: r.creditsUsed,
        createdAt: r.createdAt?.toISOString() ?? "",
    }));

    const serializedLedger = recentLedger.map((r) => ({
        id: r.id,
        amount: r.amount,
        type: r.type,
        description: r.description,
        referenceId: r.referenceId,
        createdAt: r.createdAt?.toISOString() ?? "",
    }));

    return (
        <UsageClient
            totalTokens={totalTokens}
            totalCost={totalCost}
            totalCredits={totalCredits}
            balance={balance}
            modelBreakdown={modelBreakdown}
            usageRecords={serializedUsage}
            ledgerTransactions={serializedLedger}
        />
    );
}
