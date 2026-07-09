/**
 * Approval workflow tests — focused on the pieces that matter most for
 * correctness and security:
 *   - callback_data encode/parse (what a Telegram button tap sends back)
 *   - decide(): the approver-authorization check — only a designated
 *     approver (people.is_approver = true) for the SAME tenant as the
 *     approval may resolve it; everyone else is rejected untouched.
 *   - standing allowances ("Allow always"): grant/dedupe/list/revoke, and
 *     that tapping "allow always" turns into a persistent allowance while a
 *     plain "allow" does not.
 *
 * Telegram delivery (postApprovalCard/editApprovalCard) is exercised only
 * indirectly here — channelAdapters is mocked to an empty Map so those calls
 * no-op instead of hitting a real bot, which is what we want for a unit test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPendingFindFirst = vi.fn();
const mockPeopleFindMany = vi.fn();
const mockUpdateReturning = vi.fn();
const mockGetPerson = vi.fn();
const mockAllowanceFindFirst = vi.fn();
const mockAllowanceFindMany = vi.fn();
const mockServerFindFirst = vi.fn();
const mockInsertValues = vi.fn().mockResolvedValue(undefined);

vi.mock("../storage/db.js", () => ({
    db: {
        query: {
            pendingApprovals: { findFirst: (...args: any[]) => mockPendingFindFirst(...args) },
            people: { findMany: (...args: any[]) => mockPeopleFindMany(...args) },
            approvalAllowances: {
                findFirst: (...args: any[]) => mockAllowanceFindFirst(...args),
                findMany: (...args: any[]) => mockAllowanceFindMany(...args),
            },
            servers: { findFirst: (...args: any[]) => mockServerFindFirst(...args) },
        },
        insert: vi.fn().mockReturnValue({ values: (...args: any[]) => mockInsertValues(...args) }),
        update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: (...args: any[]) => mockUpdateReturning(...args),
                }),
            }),
        }),
    },
}));

vi.mock("../utils/logger.js", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../queue/worker.js", () => ({
    channelAdapters: new Map(), // no "telegram" entry — card delivery/edit no-ops
}));

vi.mock("../channels/people-service.js", () => ({
    getPerson: (...args: any[]) => mockGetPerson(...args),
    toPerson: (row: any) => row,
}));

import {
    buildCallbackData,
    parseCallbackData,
    decide,
    hasStandingAllowance,
    grantAllowance,
    listAllowances,
    revokeAllowance,
} from "../channels/approval-service.js";

function baseApprovalRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: "11111111-1111-1111-1111-111111111111",
        tenantId: "tenant-1",
        kind: "user_request",
        status: "pending",
        requesterTelegramId: "999",
        agentProfileId: null,
        serverId: null,
        summary: "test summary",
        payload: {},
        channelType: "telegram",
        channelContactId: "999",
        approvalMessageIds: {},
        decidedBy: null,
        decidedAt: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 120_000),
        ...overrides,
    };
}

function approverPerson(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: "p-approver",
        tenantId: "tenant-1",
        telegramUserId: "42",
        displayName: "Alice Approver",
        username: "alice",
        access: "talk",
        isApprover: true,
        approvalMode: "auto",
        allowedAgentIds: [],
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

beforeEach(() => {
    mockPendingFindFirst.mockReset();
    mockPeopleFindMany.mockReset();
    mockUpdateReturning.mockReset();
    mockGetPerson.mockReset();
    mockAllowanceFindFirst.mockReset();
    mockAllowanceFindMany.mockReset();
    mockServerFindFirst.mockReset();
    mockInsertValues.mockReset().mockResolvedValue(undefined);
});

// ─── callback_data encode/parse ─────────────────────────────────────────────

describe("buildCallbackData / parseCallbackData", () => {
    const id = "11111111-1111-1111-1111-111111111111";

    it("round-trips allow/deny/allowall", () => {
        for (const action of ["allow", "deny", "allowall"] as const) {
            const data = buildCallbackData(id, action);
            expect(parseCallbackData(data)).toEqual({ approvalId: id, action });
        }
    });

    it("stays well under Telegram's 64-byte callback_data limit", () => {
        const data = buildCallbackData(id, "allowall");
        expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    });

    it("rejects malformed callback_data", () => {
        expect(parseCallbackData("not-ours")).toBeNull();
        expect(parseCallbackData("apr:not-a-uuid:allow")).toBeNull();
        expect(parseCallbackData(`apr:${id}:explode`)).toBeNull();
        expect(parseCallbackData("")).toBeNull();
    });
});

// ─── decide() — approver authorization ──────────────────────────────────────

describe("decide — approver authorization", () => {
    it("rejects a tap from someone who isn't in People at all", async () => {
        mockPendingFindFirst.mockResolvedValue(baseApprovalRow());
        mockGetPerson.mockResolvedValue(null);

        const result = await decide("11111111-1111-1111-1111-111111111111", "allow", "some-random-user");

        expect(result).toEqual({ ok: false, reason: "not_authorized" });
        expect(mockUpdateReturning).not.toHaveBeenCalled();
    });

    it("rejects a tap from a known person who is NOT a designated approver", async () => {
        mockPendingFindFirst.mockResolvedValue(baseApprovalRow());
        mockGetPerson.mockResolvedValue(approverPerson({ isApprover: false }));

        const result = await decide("11111111-1111-1111-1111-111111111111", "allow", "42");

        expect(result).toEqual({ ok: false, reason: "not_authorized" });
        expect(mockUpdateReturning).not.toHaveBeenCalled();
    });

    it("accepts a tap from a designated approver and resolves 'approved'", async () => {
        const row = baseApprovalRow();
        mockPendingFindFirst.mockResolvedValue(row);
        mockGetPerson.mockResolvedValue(approverPerson());
        mockUpdateReturning.mockResolvedValue([{ ...row, status: "approved", decidedBy: "42" }]);

        const result = await decide(row.id, "allow", "42");

        expect(result.ok).toBe(true);
        expect(result.approverLabel).toBe("Alice Approver");
    });

    it("maps the 'deny' action to a denied status", async () => {
        const row = baseApprovalRow();
        mockPendingFindFirst.mockResolvedValue(row);
        mockGetPerson.mockResolvedValue(approverPerson());
        mockUpdateReturning.mockResolvedValue([{ ...row, status: "denied", decidedBy: "42" }]);

        const result = await decide(row.id, "deny", "42");

        expect(result.ok).toBe(true);
    });

    it("returns not_found when the approval id doesn't exist", async () => {
        mockPendingFindFirst.mockResolvedValue(undefined);

        const result = await decide("does-not-exist", "allow", "42");

        expect(result).toEqual({ ok: false, reason: "not_found" });
        expect(mockGetPerson).not.toHaveBeenCalled();
    });

    it("returns already_decided when the row is no longer pending", async () => {
        mockPendingFindFirst.mockResolvedValue(baseApprovalRow({ status: "approved" }));

        const result = await decide("11111111-1111-1111-1111-111111111111", "allow", "42");

        expect(result).toEqual({ ok: false, reason: "already_decided" });
        expect(mockGetPerson).not.toHaveBeenCalled();
    });
});

// ─── decide() — "Allow always" grants a persistent standing allowance ──────

describe("decide — 'allow always' grants a persistent allowance", () => {
    it("grants a standing allowance scoped to the requester ('user') when the approver taps 'allow always'", async () => {
        const row = baseApprovalRow({ kind: "user_request", requesterTelegramId: "999" });
        mockPendingFindFirst.mockResolvedValue(row);
        // First getPerson() call authorizes the approver; the second (inside
        // grantAllowanceForApproval) looks up the requester's display name.
        mockGetPerson
            .mockResolvedValueOnce(approverPerson())
            .mockResolvedValueOnce({ displayName: "Bob Requester", username: "bob" });
        mockUpdateReturning.mockResolvedValue([{ ...row, status: "approved", decidedBy: "42" }]);
        mockAllowanceFindFirst.mockResolvedValue(undefined); // no existing allowance — dedupe passes

        await decide(row.id, "allowall", "42");

        expect(mockInsertValues).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: "tenant-1",
                kind: "user",
                subject: "999",
                label: "Bob Requester",
                createdBy: "42",
            })
        );
    });

    it("grants a standing allowance scoped to the server when the approver taps 'allow always' on a command", async () => {
        const row = baseApprovalRow({ kind: "command", requesterTelegramId: null, serverId: "server-1" });
        mockPendingFindFirst.mockResolvedValue(row);
        mockGetPerson.mockResolvedValue(approverPerson());
        mockUpdateReturning.mockResolvedValue([{ ...row, status: "approved", decidedBy: "42" }]);
        mockAllowanceFindFirst.mockResolvedValue(undefined);
        mockServerFindFirst.mockResolvedValue({ name: "prod-web-1" });

        await decide(row.id, "allowall", "42");

        expect(mockInsertValues).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: "tenant-1",
                kind: "server",
                subject: "server-1",
                label: "prod-web-1",
                createdBy: "42",
            })
        );
    });

    it("does NOT grant a standing allowance on a plain 'allow' (only 'allowall' does)", async () => {
        const row = baseApprovalRow({ kind: "user_request", requesterTelegramId: "888" });
        mockPendingFindFirst.mockResolvedValue(row);
        mockGetPerson.mockResolvedValue(approverPerson());
        mockUpdateReturning.mockResolvedValue([{ ...row, status: "approved", decidedBy: "42" }]);

        await decide(row.id, "allow", "42");

        expect(mockInsertValues).not.toHaveBeenCalled();
    });

});

// ─── Standing allowances: hasStandingAllowance / grantAllowance / listAllowances / revokeAllowance ──

describe("hasStandingAllowance", () => {
    it("returns true when an active (un-revoked) row matches", async () => {
        mockAllowanceFindFirst.mockResolvedValue({ id: "a-1" });
        await expect(hasStandingAllowance("tenant-1", "user", "999")).resolves.toBe(true);
    });

    it("returns false when no matching row exists", async () => {
        mockAllowanceFindFirst.mockResolvedValue(undefined);
        await expect(hasStandingAllowance("tenant-1", "user", "999")).resolves.toBe(false);
    });
});

describe("grantAllowance — dedupe", () => {
    it("inserts a new row when no active allowance exists yet", async () => {
        mockAllowanceFindFirst.mockResolvedValue(undefined);

        await grantAllowance("tenant-1", "server", "server-1", "prod-web-1", "42");

        expect(mockInsertValues).toHaveBeenCalledWith({
            tenantId: "tenant-1",
            kind: "server",
            subject: "server-1",
            label: "prod-web-1",
            createdBy: "42",
        });
    });

    it("does NOT insert a duplicate when an active allowance already exists", async () => {
        mockAllowanceFindFirst.mockResolvedValue({ id: "existing" });

        await grantAllowance("tenant-1", "server", "server-1", "prod-web-1", "42");

        expect(mockInsertValues).not.toHaveBeenCalled();
    });
});

describe("listAllowances", () => {
    it("maps rows to the Allowance shape", async () => {
        const createdAt = new Date();
        mockAllowanceFindMany.mockResolvedValue([
            {
                id: "a-1",
                tenantId: "tenant-1",
                kind: "user",
                subject: "999",
                label: "Bob Requester",
                createdBy: "42",
                createdAt,
                revokedAt: null,
            },
        ]);

        const result = await listAllowances("tenant-1");

        expect(result).toEqual([
            {
                id: "a-1",
                tenantId: "tenant-1",
                kind: "user",
                subject: "999",
                label: "Bob Requester",
                createdBy: "42",
                createdAt,
            },
        ]);
    });
});

describe("revokeAllowance", () => {
    it("returns true when a matching active row was revoked", async () => {
        mockUpdateReturning.mockResolvedValue([{ id: "a-1" }]);
        await expect(revokeAllowance("tenant-1", "a-1")).resolves.toBe(true);
    });

    it("returns false when no matching active row was found", async () => {
        mockUpdateReturning.mockResolvedValue([]);
        await expect(revokeAllowance("tenant-1", "does-not-exist")).resolves.toBe(false);
    });
});
