/**
 * Approval workflow (stage 2 of People access control).
 *
 * Two things can be gated behind a human approver's decision:
 *   - "user_request": a message from a person whose `people.approval_mode`
 *     is 'requires_approval' (checked in the Telegram adapter before the
 *     runtime ever sees the message).
 *   - "command": a `server_exec` command on a server whose `approval_mode`
 *     requires it (checked inside the server_exec tool itself, so it also
 *     covers the MCP/codex bridge path — both call the same tool.execute()).
 *
 * Every designated approver (`people.is_approver = true`) gets an inline-
 * keyboard card in their Telegram DM for every pending approval. Any one of
 * them deciding resolves it for everyone — all outstanding cards are edited
 * to a final state.
 *
 * Delivery reuses the Telegram adapter's already-running bot instance (via
 * the shared `channelAdapters` registry) rather than spinning up a second
 * bot connection — see channels/telegram/adapter.ts `getTenantBot()`.
 *
 * "Allow always" grants a PERSISTENT, revocable standing allowance
 * (`approval_allowances` table) — it lasts until an admin revokes it from
 * the dashboard, not a 30-minute in-memory window. See hasStandingAllowance/
 * grantAllowance/listAllowances/revokeAllowance below.
 */
import { randomUUID } from "node:crypto";
import { InlineKeyboard } from "grammy";
import { db } from "../storage/db.js";
import { pendingApprovals, people, servers, approvalAllowances } from "../storage/schema.js";
import { eq, and, isNull, desc } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { getPerson, toPerson } from "./people-service.js";
import { channelAdapters } from "../queue/worker.js";
import type { TelegramAdapter } from "./telegram/adapter.js";
import { getJobRunnerRuntime } from "../cron/job-runner.js";

export type ApprovalKind = "user_request" | "command" | "tool_call";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalDecisionAction = "allow" | "deny" | "allowall";

/** Standing-allowance kind — distinct from ApprovalKind's naming (user_request/command). */
export type AllowanceKind = "user" | "server" | "tool";

export const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000;

export interface CreateApprovalInput {
    tenantId: string;
    kind: ApprovalKind;
    summary: string;
    requesterTelegramId?: string;
    agentProfileId?: string | null;
    serverId?: string | null;
    payload?: Record<string, unknown>;
    channelType?: string;
    channelContactId?: string;
    timeoutMs?: number;
}

export interface DecisionResult {
    ok: boolean;
    reason?: "not_found" | "already_decided" | "not_authorized";
    approverLabel?: string;
}

/** What awaitDecision() resolves with — the final status plus who decided it, when known. */
export interface DecisionOutcome {
    status: ApprovalStatus;
    approverLabel?: string;
}

// ─── In-memory decision resolvers ──────────────────────────────────────────
// Keyed by pending_approvals.id. Registered the instant a row is created
// (before any Telegram network call), so a decide() call can never race
// ahead of awaitDecision() attaching its timeout.

interface ResolverEntry {
    resolve: (outcome: DecisionOutcome) => void;
    promise: Promise<DecisionOutcome>;
    timer?: NodeJS.Timeout;
}

const resolvers = new Map<string, ResolverEntry>();

function registerResolver(id: string): ResolverEntry {
    let resolveFn!: (outcome: DecisionOutcome) => void;
    const promise = new Promise<DecisionOutcome>((resolve) => {
        resolveFn = resolve;
    });
    const entry: ResolverEntry = { resolve: resolveFn, promise };
    resolvers.set(id, entry);
    return entry;
}

// ─── "Allow always" — persistent, revocable standing allowances ───────────
// Backed by the `approval_allowances` table. A grant lasts until an admin
// revokes it from the dashboard — there is no expiry/timer.

export interface Allowance {
    id: string;
    tenantId: string;
    kind: AllowanceKind;
    subject: string;
    label: string | null;
    createdBy: string | null;
    createdAt: Date | null;
}

function toAllowance(row: typeof approvalAllowances.$inferSelect): Allowance {
    return {
        id: row.id,
        tenantId: row.tenantId,
        kind: row.kind as AllowanceKind,
        subject: row.subject,
        label: row.label,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
    };
}

/** Whether `subject` (a requester's telegram id for kind='user', a server id for kind='server') has an active, un-revoked standing allowance. */
export async function hasStandingAllowance(tenantId: string, kind: AllowanceKind, subject: string): Promise<boolean> {
    const row = await db.query.approvalAllowances.findFirst({
        where: and(
            eq(approvalAllowances.tenantId, tenantId),
            eq(approvalAllowances.kind, kind),
            eq(approvalAllowances.subject, subject),
            isNull(approvalAllowances.revokedAt)
        ),
    });
    return !!row;
}

/**
 * Insert a standing allowance, unless an active one already exists for this
 * (tenantId, kind, subject) — deduped in code rather than a DB unique
 * constraint, so re-granting after a revoke (a new row) is always allowed.
 */
export async function grantAllowance(
    tenantId: string,
    kind: AllowanceKind,
    subject: string,
    label: string | null,
    createdBy: string | null
): Promise<void> {
    const existing = await hasStandingAllowance(tenantId, kind, subject);
    if (existing) return;

    await db.insert(approvalAllowances).values({
        tenantId,
        kind,
        subject,
        label,
        createdBy,
    });
}

/** Active (un-revoked) standing allowances for this tenant, newest first — for the dashboard panel. */
export async function listAllowances(tenantId: string): Promise<Allowance[]> {
    const rows = await db.query.approvalAllowances.findMany({
        where: and(eq(approvalAllowances.tenantId, tenantId), isNull(approvalAllowances.revokedAt)),
        orderBy: [desc(approvalAllowances.createdAt)],
    });
    return rows.map(toAllowance);
}

/** Revoke a standing allowance. Returns true iff a matching active row was found and revoked. */
export async function revokeAllowance(tenantId: string, id: string): Promise<boolean> {
    const [row] = await db
        .update(approvalAllowances)
        .set({ revokedAt: new Date() })
        .where(and(eq(approvalAllowances.id, id), eq(approvalAllowances.tenantId, tenantId), isNull(approvalAllowances.revokedAt)))
        .returning({ id: approvalAllowances.id });
    return !!row;
}

// ─── callback_data encoding ─────────────────────────────────────────────────
// "apr:<uuid>:<action>" — well under Telegram's 64-byte callback_data limit
// (4 + 36 + 1 + up to 8 = 49 bytes), so no separate short-code column is needed.

export function buildCallbackData(approvalId: string, action: ApprovalDecisionAction): string {
    return `apr:${approvalId}:${action}`;
}

const CALLBACK_RE = /^apr:([0-9a-fA-F-]{36}):(allow|deny|allowall)$/;

export function parseCallbackData(data: string): { approvalId: string; action: ApprovalDecisionAction } | null {
    const match = CALLBACK_RE.exec(data || "");
    if (!match) return null;
    return { approvalId: match[1], action: match[2] as ApprovalDecisionAction };
}

// ─── Approvers + Telegram card delivery ────────────────────────────────────

/** This tenant's designated approvers (people.is_approver = true). */
export async function listApprovers(tenantId: string) {
    const rows = await db.query.people.findMany({
        where: and(eq(people.tenantId, tenantId), eq(people.isApprover, true)),
    });
    return rows.map(toPerson);
}

function getTenantBot(tenantId: string, agentProfileId?: string | null) {
    const adapter = channelAdapters.get("telegram") as TelegramAdapter | undefined;
    return adapter?.getTenantBot(tenantId, agentProfileId);
}

function buildApprovalKeyboard(approvalId: string): InlineKeyboard {
    return new InlineKeyboard()
        .text("✅ Allow", buildCallbackData(approvalId, "allow"))
        .text("🚫 Deny", buildCallbackData(approvalId, "deny"))
        .row()
        .text("♾️ Allow always", buildCallbackData(approvalId, "allowall"));
}

function cardText(summary: string): string {
    return `${summary}\n\n⏱ Expires in 2 minutes if nobody responds.`;
}

async function postApprovalCard(tenantId: string, telegramUserId: string, summary: string, approvalId: string, agentProfileId?: string | null): Promise<string | null> {
    // Deliver via the SAME agent's bot when known, so the card appears in the DM
    // the user already associates with that agent (a tenant may run several bots).
    const bot = getTenantBot(tenantId, agentProfileId);
    if (!bot) {
        logger.warn({ tenantId, approvalId }, "No Telegram bot available to deliver an approval card");
        return null;
    }
    try {
        const sent = await bot.api.sendMessage(telegramUserId, cardText(summary), {
            reply_markup: buildApprovalKeyboard(approvalId),
        });
        return sent.message_id.toString();
    } catch (err) {
        logger.warn({ err, tenantId, telegramUserId, approvalId }, "Failed to deliver an approval card to an approver");
        return null;
    }
}

async function editApprovalCard(tenantId: string, telegramUserId: string, messageId: string, finalText: string, agentProfileId?: string | null): Promise<void> {
    const bot = getTenantBot(tenantId, agentProfileId);
    if (!bot) return;
    try {
        await bot.api.editMessageText(telegramUserId, parseInt(messageId, 10), finalText);
    } catch (err: any) {
        // "message is not modified" / message deleted / chat not found — non-fatal, best effort.
        if (err?.error_code === 400) return;
        logger.warn({ err, tenantId, telegramUserId, messageId }, "Failed to edit an approval card");
    }
}

function finalStatusLabel(status: ApprovalStatus, approverLabel?: string | null): string {
    if (status === "approved") return `✅ Approved${approverLabel ? ` by ${approverLabel}` : ""}.`;
    if (status === "denied") return `🚫 Denied${approverLabel ? ` by ${approverLabel}` : ""}.`;
    return "⏱ Expired — nobody responded in time.";
}

async function editAllCards(row: typeof pendingApprovals.$inferSelect, status: ApprovalStatus, approverLabel?: string | null): Promise<void> {
    const messageIds = (row.approvalMessageIds as Record<string, string>) || {};
    const suffix = finalStatusLabel(status, approverLabel);
    await Promise.all(
        Object.entries(messageIds).map(([telegramUserId, messageId]) =>
            editApprovalCard(row.tenantId, telegramUserId, messageId, `${row.summary}\n\n${suffix}`, row.agentProfileId)
        )
    );
}

// ─── Create + await ─────────────────────────────────────────────────────────

/**
 * Insert a pending_approvals row and DM every approver an inline-keyboard
 * card. Registers the in-memory decision resolver before any network call,
 * so a very fast tap can never race ahead of awaitDecision() attaching its
 * timeout.
 */
export async function createApproval(input: CreateApprovalInput): Promise<{ id: string }> {
    const id = randomUUID();
    const timeoutMs = input.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    registerResolver(id);

    await db.insert(pendingApprovals).values({
        id,
        tenantId: input.tenantId,
        kind: input.kind,
        status: "pending",
        requesterTelegramId: input.requesterTelegramId ?? null,
        agentProfileId: input.agentProfileId ?? null,
        serverId: input.serverId ?? null,
        summary: input.summary,
        payload: input.payload ?? {},
        channelType: input.channelType ?? null,
        channelContactId: input.channelContactId ?? null,
        approvalMessageIds: {},
        expiresAt: new Date(Date.now() + timeoutMs),
    });

    const approvers = await listApprovers(input.tenantId);
    if (approvers.length === 0) {
        logger.warn({ tenantId: input.tenantId, approvalId: id }, "No approvers configured — this approval will expire unanswered");
    }

    const messageIds: Record<string, string> = {};
    for (const approver of approvers) {
        const messageId = await postApprovalCard(input.tenantId, approver.telegramUserId, input.summary, id, input.agentProfileId);
        if (messageId) messageIds[approver.telegramUserId] = messageId;
    }

    if (Object.keys(messageIds).length > 0) {
        await db.update(pendingApprovals).set({ approvalMessageIds: messageIds }).where(eq(pendingApprovals.id, id));
    }

    return { id };
}

/**
 * Resolve once a decide() call lands, or 'expired' after `timeoutMs`
 * (default 120s) if nobody responds. Never throws — a DB hiccup while
 * finalizing an expiry is logged and the caller still gets 'expired'.
 */
export async function awaitDecision(approvalId: string, timeoutMs: number = DEFAULT_APPROVAL_TIMEOUT_MS): Promise<DecisionOutcome> {
    const entry = resolvers.get(approvalId) ?? registerResolver(approvalId);

    entry.timer = setTimeout(() => {
        finalizeApproval(approvalId, "expired", null).catch((err) =>
            logger.error({ err, approvalId }, "Failed to finalize an expired approval")
        );
    }, timeoutMs);

    return entry.promise;
}

async function finalizeApproval(id: string, status: ApprovalStatus, decidedBy: string | null, approverLabel?: string | null): Promise<boolean> {
    const [row] = await db
        .update(pendingApprovals)
        .set({ status, decidedBy: decidedBy ?? undefined, decidedAt: new Date() })
        .where(and(eq(pendingApprovals.id, id), eq(pendingApprovals.status, "pending")))
        .returning();

    if (!row) return false; // already decided (race between two approvers, or already expired)

    const entry = resolvers.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    entry?.resolve({ status, approverLabel: approverLabel ?? undefined });
    resolvers.delete(id);

    await editAllCards(row, status, approverLabel);
    return true;
}

/**
 * Called from the Telegram callback_query handler when an approver taps a
 * button. Validates the tapper IS a designated approver for this tenant
 * before doing anything — non-approvers get `not_authorized` and nothing
 * changes.
 */
export async function decide(approvalId: string, action: ApprovalDecisionAction, approverTelegramId: string): Promise<DecisionResult> {
    const row = await db.query.pendingApprovals.findFirst({ where: eq(pendingApprovals.id, approvalId) });
    if (!row) return { ok: false, reason: "not_found" };
    if (row.status !== "pending") return { ok: false, reason: "already_decided" };

    const approver = await getPerson(row.tenantId, approverTelegramId);
    if (!approver || !approver.isApprover) return { ok: false, reason: "not_authorized" };

    const approverLabel = approver.displayName || approver.username || approverTelegramId;
    const status: ApprovalStatus = action === "deny" ? "denied" : "approved";

    const applied = await finalizeApproval(approvalId, status, approverTelegramId, approverLabel);
    if (!applied) return { ok: false, reason: "already_decided" };

    if (action === "allowall" && status === "approved") {
        await grantAllowanceForApproval(row, approverTelegramId);
    }

    // Non-blocking tool_call approvals: the agent's turn already ended, so run
    // the approved tool now (out-of-band) and reflect the outcome on the card.
    if (status === "approved" && row.kind === "tool_call") {
        void runApprovedToolCall(row, approverLabel);
    }

    return { ok: true, approverLabel };
}

/**
 * Execute a just-approved tool_call out-of-band and append the outcome to the
 * approver's card. Fire-and-forget from decide().
 */
async function runApprovedToolCall(row: typeof pendingApprovals.$inferSelect, approverLabel: string): Promise<void> {
    const payload = (row.payload as any) || {};
    const toolName: string | undefined = payload.toolName;
    const runtime = getJobRunnerRuntime();
    if (!toolName || !runtime) {
        logger.warn({ approvalId: row.id, toolName }, "Approved tool_call could not run (no runtime/tool)");
        return;
    }
    let suffix: string;
    try {
        await runtime.executeApprovedTool({
            tenantId: row.tenantId,
            agentId: row.agentProfileId ?? null,
            toolName,
            args: payload.args || {},
        });
        suffix = `✅ Approved by ${approverLabel} — done.`;
    } catch (err: any) {
        logger.error({ err, approvalId: row.id, toolName }, "Approved tool_call failed to execute");
        suffix = `✅ Approved by ${approverLabel}, but the action failed to run: ${err?.message || "unknown error"}.`;
    }
    // Re-edit the card to show the execution outcome.
    const messageIds = (row.approvalMessageIds as Record<string, string>) || {};
    await Promise.all(
        Object.entries(messageIds).map(([telegramUserId, messageId]) =>
            editApprovalCard(row.tenantId, telegramUserId, messageId, `${row.summary}\n\n${suffix}`, row.agentProfileId)
        )
    );
}

/** Finalize any pending approvals whose TTL has elapsed (the non-blocking sweep). */
export async function expirePendingApprovals(): Promise<number> {
    const stale = await db.query.pendingApprovals.findMany({
        where: and(eq(pendingApprovals.status, "pending")),
        columns: { id: true, expiresAt: true },
    });
    const now = Date.now();
    let count = 0;
    for (const row of stale) {
        if (row.expiresAt && new Date(row.expiresAt).getTime() < now) {
            const applied = await finalizeApproval(row.id, "expired", null).catch(() => false);
            if (applied) count++;
        }
    }
    return count;
}

/**
 * "Allow always" was tapped: turn the just-decided approval's scope into a
 * persistent standing allowance. Best-effort label lookup only — a failure
 * there never blocks the grant itself (it just falls back to the raw id).
 */
async function grantAllowanceForApproval(
    row: typeof pendingApprovals.$inferSelect,
    createdBy: string
): Promise<void> {
    if (row.kind === "tool_call") {
        const toolName = (row.payload as any)?.toolName;
        if (!toolName || typeof toolName !== "string") return;
        await grantAllowance(row.tenantId, "tool", toolName, toolName, createdBy);
        return;
    }

    if (row.kind === "command") {
        if (!row.serverId) return;
        let label = row.serverId;
        try {
            const server = await db.query.servers.findFirst({
                where: eq(servers.id, row.serverId),
                columns: { name: true },
            });
            if (server?.name) label = server.name;
        } catch (err) {
            logger.warn({ err, serverId: row.serverId }, "Failed to look up server name for allowance label");
        }
        await grantAllowance(row.tenantId, "server", row.serverId, label, createdBy);
        return;
    }

    if (!row.requesterTelegramId) return;
    let label = row.requesterTelegramId;
    try {
        const requester = await getPerson(row.tenantId, row.requesterTelegramId);
        if (requester?.displayName || requester?.username) {
            label = requester.displayName || requester.username || label;
        }
    } catch (err) {
        logger.warn({ err, requesterTelegramId: row.requesterTelegramId }, "Failed to look up requester name for allowance label");
    }
    await grantAllowance(row.tenantId, "user", row.requesterTelegramId, label, createdBy);
}
