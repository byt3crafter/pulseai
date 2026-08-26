/**
 * People — account-wide, Telegram-ID-based access control.
 *
 * Scope is account-wide (one people list per tenant): a person's access level
 * applies to every group/DM they're seen in, not per-channel. New/unknown
 * people default to the tenant's configured `default_person_access`
 * (tenants.config.default_person_access), falling back to "observe" — they
 * can be present in a chat but agents won't respond to them until an admin
 * grants "talk".
 *
 * `isApprover` / `approvalMode` are stored for a later approval-workflow
 * stage and are intentionally NOT enforced here yet.
 */
import { db } from "../storage/db.js";
import { people, tenants } from "../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../utils/logger.js";

export type PersonAccess = "talk" | "observe" | "blocked";
export type ApprovalMode = "auto" | "requires_approval";

export interface Person {
    id: string;
    tenantId: string;
    telegramUserId: string;
    /** Linked workspace member, set on /dashboard/people. Null = not a member. */
    userId: string | null;
    displayName: string | null;
    username: string | null;
    access: PersonAccess;
    isApprover: boolean;
    approvalMode: ApprovalMode;
    allowedAgentIds: string[];
    lastSeenAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

interface TenantConfig {
    default_person_access?: string;
    [key: string]: unknown;
}

function normalizeAccess(value: unknown): PersonAccess {
    return value === "talk" || value === "observe" || value === "blocked" ? value : "observe";
}

function normalizeApprovalMode(value: unknown): ApprovalMode {
    return value === "requires_approval" ? "requires_approval" : "auto";
}

/** Exported so approval-service (and other callers doing raw row lookups) don't duplicate this normalization. */
export function toPerson(row: typeof people.$inferSelect): Person {
    return {
        id: row.id,
        tenantId: row.tenantId,
        telegramUserId: row.telegramUserId,
        userId: row.userId ?? null,
        displayName: row.displayName,
        username: row.username,
        access: normalizeAccess(row.access),
        isApprover: !!row.isApprover,
        approvalMode: normalizeApprovalMode(row.approvalMode),
        allowedAgentIds: Array.isArray(row.allowedAgentIds) ? (row.allowedAgentIds as string[]) : [],
        lastSeenAt: row.lastSeenAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/** Reads tenants.config.default_person_access — never hardcoded, "observe" if unset/invalid. */
export async function getDefaultPersonAccess(tenantId: string): Promise<PersonAccess> {
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { config: true },
    });
    const config = (tenant?.config as TenantConfig) || {};
    return normalizeAccess(config.default_person_access);
}

/**
 * Resolve (upsert) the Person row for a Telegram user under a tenant.
 * - First contact: creates the row using the tenant's configured default
 *   access.
 * - Every call: refreshes display name/username (when provided) and bumps
 *   `last_seen_at` — regardless of access level, so admins can see recent
 *   activity even for observed/blocked people.
 *
 * Returns `isNew` so callers (the Telegram adapter) can send a one-time
 * "you don't have access yet" notice on first contact instead of on every
 * message.
 */
export async function resolvePerson(
    tenantId: string,
    telegramUserId: string,
    info?: { displayName?: string; username?: string }
): Promise<{ person: Person; isNew: boolean }> {
    const existing = await db.query.people.findFirst({
        where: and(eq(people.tenantId, tenantId), eq(people.telegramUserId, telegramUserId)),
    });

    if (existing) {
        const [updated] = await db
            .update(people)
            .set({
                displayName: info?.displayName ?? existing.displayName,
                username: info?.username ?? existing.username,
                lastSeenAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(people.id, existing.id))
            .returning();
        return { person: toPerson(updated ?? existing), isNew: false };
    }

    const defaultAccess = await getDefaultPersonAccess(tenantId);

    try {
        const [created] = await db
            .insert(people)
            .values({
                tenantId,
                telegramUserId,
                displayName: info?.displayName,
                username: info?.username,
                access: defaultAccess,
                lastSeenAt: new Date(),
            })
            .returning();
        return { person: toPerson(created), isNew: true };
    } catch (err) {
        // Concurrent first message from the same person can race the unique
        // (tenant_id, telegram_user_id) constraint — fall back to a read.
        const raced = await db.query.people.findFirst({
            where: and(eq(people.tenantId, tenantId), eq(people.telegramUserId, telegramUserId)),
        });
        if (raced) return { person: toPerson(raced), isNew: false };
        logger.error({ err, tenantId }, "Failed to resolve person");
        throw err;
    }
}

/** Lightweight lookup — no upsert, no last_seen bump. Used by the runtime for the final routed-agent check. */
export async function getPerson(tenantId: string, telegramUserId: string): Promise<Person | null> {
    const row = await db.query.people.findFirst({
        where: and(eq(people.tenantId, tenantId), eq(people.telegramUserId, telegramUserId)),
    });
    return row ? toPerson(row) : null;
}

/**
 * Whether a person may address a specific agent. An empty allow-list means
 * "may address all agents" — the default, unrestricted case.
 */
export function canAddressAgent(person: Person, agentProfileId: string): boolean {
    if (!person.allowedAgentIds || person.allowedAgentIds.length === 0) return true;
    return person.allowedAgentIds.includes(agentProfileId);
}
