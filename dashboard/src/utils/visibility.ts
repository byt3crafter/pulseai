import { and, eq, or, type SQL } from "drizzle-orm";

/**
 * Row-level visibility — the one place the rule lives.
 *
 * `permissions.ts` answers a different question: what may this ROLE do
 * (delete an agent, invite a user). This answers which ROWS a person may see.
 * Keeping them apart matters — a viewer and an owner see the same rows; they
 * differ in what they may do to them.
 *
 * There is exactly one implementation on purpose. The realistic failure here is
 * not a wrong rule, it is the right rule applied in nineteen query sites and
 * missed in the twentieth — and a miss means one customer's private
 * conversation shown to a colleague. A guard test (pulse/src/__tests__/
 * visibility-guard.test.ts) fails the build when a scoped table is queried in a
 * file that never imports this.
 *
 * See docs/MULTI_USER_PLAN.md.
 */

/** The two columns every scoped table carries (migration 0042). */
export interface ScopedTable {
    ownerUserId: any;
    visibility: any;
    tenantId: any;
}

export type Visibility = "private" | "shared" | "workspace";

/**
 * Rows this person may see, as a SQL predicate.
 *
 * Deliberately NOT bypassed for workspace owners. An admin who can read every
 * private conversation is a product nobody trusts with their own notes; if a
 * business ever needs that, it should be an explicit, audited export path — not
 * a silent capability attached to a role.
 *
 * While every row is still `workspace` (Phase 0/1) this predicate matches
 * everything, so behaviour is unchanged until Phase 2 flips a default.
 */
export function visibleTo(table: ScopedTable, userId: string): SQL | undefined {
    return or(
        eq(table.visibility, "workspace"),
        eq(table.ownerUserId, userId),
        // 'shared' resolves through resource_shares in Phase 3. Until that table
        // exists a shared row is visible only to its owner, which is the safe
        // direction to be wrong in.
    );
}

/** Tenant scope AND row scope — what a list query almost always wants. */
export function scopedTo(table: ScopedTable, tenantId: string, userId: string): SQL | undefined {
    return and(eq(table.tenantId, tenantId), visibleTo(table, userId));
}

/** Whether a row already in hand may be read. Mirrors `visibleTo` exactly. */
export function canRead(
    row: { ownerUserId?: string | null; visibility?: string | null },
    userId: string,
): boolean {
    if ((row.visibility ?? "workspace") === "workspace") return true;
    return !!row.ownerUserId && row.ownerUserId === userId;
}

/**
 * Who may change a row.
 *
 * An unowned row is workspace property, so anyone in the workspace may edit it —
 * that is how every contact and document behaves today, and Phase 0 left most
 * historic rows unowned. An owned row belongs to its owner.
 */
export function canWrite(
    row: { ownerUserId?: string | null; visibility?: string | null },
    userId: string,
): boolean {
    if (!row.ownerUserId) return true;
    return row.ownerUserId === userId;
}

/** Only an owner may change who else can see something. */
export function canShare(row: { ownerUserId?: string | null }, userId: string): boolean {
    return !!row.ownerUserId && row.ownerUserId === userId;
}
