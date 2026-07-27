import { db } from "../storage/db";
import { pendingApprovals, approvalAllowances, agentProfiles, people } from "../storage/schema";
import { and, eq, desc, isNull, ne } from "drizzle-orm";

/**
 * Read helpers for the Approval Center. Tenant-scoped. Resolves Telegram ids to
 * person names where possible so the dashboard shows "Approved by Alex", not a
 * numeric id.
 */

/** Null-safe ISO conversion for nullable timestamp columns. */
function toIso(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    return (d instanceof Date ? d : new Date(d)).toISOString();
}

export interface ApprovalItem {
    id: string;
    kind: string;
    status: string;
    summary: string;
    agentName: string | null;
    requesterName: string | null;
    decidedByName: string | null;
    createdAt: string;
    decidedAt: string | null;
    expiresAt: string | null;
}

async function personNameMap(tenantId: string): Promise<Map<string, string>> {
    const rows = await db
        .select({ tg: people.telegramUserId, name: people.displayName, username: people.username })
        .from(people)
        .where(eq(people.tenantId, tenantId));
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.tg, r.name || r.username || r.tg);
    return m;
}

function mapItem(r: any, names: Map<string, string>): ApprovalItem {
    return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        summary: r.summary,
        agentName: r.agentName ?? null,
        requesterName: r.requesterTelegramId ? (names.get(r.requesterTelegramId) ?? r.requesterTelegramId) : null,
        decidedByName: r.decidedBy ? (names.get(r.decidedBy) ?? r.decidedBy) : null,
        createdAt: toIso(r.createdAt) ?? new Date(0).toISOString(),
        decidedAt: toIso(r.decidedAt),
        expiresAt: toIso(r.expiresAt),
    };
}

function selectApprovalColumns() {
    return {
        id: pendingApprovals.id,
        kind: pendingApprovals.kind,
        status: pendingApprovals.status,
        summary: pendingApprovals.summary,
        agentName: agentProfiles.name,
        requesterTelegramId: pendingApprovals.requesterTelegramId,
        decidedBy: pendingApprovals.decidedBy,
        createdAt: pendingApprovals.createdAt,
        decidedAt: pendingApprovals.decidedAt,
        expiresAt: pendingApprovals.expiresAt,
    };
}

/** Approvals still awaiting a decision, oldest first (most urgent at the top). */
export async function getPendingApprovals(tenantId: string): Promise<ApprovalItem[]> {
    const [rows, names] = await Promise.all([
        db.select(selectApprovalColumns())
            .from(pendingApprovals)
            .leftJoin(agentProfiles, eq(pendingApprovals.agentProfileId, agentProfiles.id))
            .where(and(eq(pendingApprovals.tenantId, tenantId), eq(pendingApprovals.status, "pending")))
            .orderBy(pendingApprovals.createdAt),
        personNameMap(tenantId),
    ]);
    return rows.map((r) => mapItem(r, names));
}

/** Decided/expired approvals — the audit history, newest first. */
export async function getApprovalHistory(tenantId: string, limit = 50): Promise<ApprovalItem[]> {
    const [rows, names] = await Promise.all([
        db.select(selectApprovalColumns())
            .from(pendingApprovals)
            .leftJoin(agentProfiles, eq(pendingApprovals.agentProfileId, agentProfiles.id))
            .where(and(eq(pendingApprovals.tenantId, tenantId), ne(pendingApprovals.status, "pending")))
            .orderBy(desc(pendingApprovals.decidedAt))
            .limit(limit),
        personNameMap(tenantId),
    ]);
    return rows.map((r) => mapItem(r, names));
}

export interface StandingAllowance {
    id: string;
    kind: string;
    subject: string;
    label: string | null;
    createdAt: string;
}

/** Active "allow always" grants — the standing exemptions from the approval gate. */
export async function getStandingAllowances(tenantId: string): Promise<StandingAllowance[]> {
    const rows = await db
        .select({
            id: approvalAllowances.id,
            kind: approvalAllowances.kind,
            subject: approvalAllowances.subject,
            label: approvalAllowances.label,
            createdAt: approvalAllowances.createdAt,
        })
        .from(approvalAllowances)
        .where(and(eq(approvalAllowances.tenantId, tenantId), isNull(approvalAllowances.revokedAt)))
        .orderBy(desc(approvalAllowances.createdAt));
    return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        subject: r.subject,
        label: r.label ?? null,
        createdAt: toIso(r.createdAt) ?? new Date(0).toISOString(),
    }));
}
