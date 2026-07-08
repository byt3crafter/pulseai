import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPeopleFindFirst = vi.fn();
const mockTenantsFindFirst = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateReturning = vi.fn();

vi.mock("../storage/db.js", () => ({
    db: {
        query: {
            people: { findFirst: (...args: any[]) => mockPeopleFindFirst(...args) },
            tenants: { findFirst: (...args: any[]) => mockTenantsFindFirst(...args) },
        },
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: (...args: any[]) => mockInsertReturning(...args),
            }),
        }),
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

import { resolvePerson, getDefaultPersonAccess, canAddressAgent, type Person } from "../channels/people-service.js";

function basePersonRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: "p1",
        tenantId: "t1",
        telegramUserId: "123",
        displayName: "Alice",
        username: "alice",
        access: "talk",
        isApprover: false,
        approvalMode: "auto",
        allowedAgentIds: [],
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

describe("canAddressAgent", () => {
    it("allows any agent when allowedAgentIds is empty (unrestricted default)", () => {
        const person = { allowedAgentIds: [] } as unknown as Person;
        expect(canAddressAgent(person, "agent-1")).toBe(true);
    });

    it("restricts to the allow-list when it's non-empty", () => {
        const person = { allowedAgentIds: ["agent-1"] } as unknown as Person;
        expect(canAddressAgent(person, "agent-1")).toBe(true);
        expect(canAddressAgent(person, "agent-2")).toBe(false);
    });
});

describe("getDefaultPersonAccess", () => {
    beforeEach(() => {
        mockTenantsFindFirst.mockReset();
    });

    it("falls back to 'observe' when the tenant has no config set", async () => {
        mockTenantsFindFirst.mockResolvedValue({ config: {} });
        expect(await getDefaultPersonAccess("t1")).toBe("observe");
    });

    it("honors tenants.config.default_person_access when it's a valid value", async () => {
        mockTenantsFindFirst.mockResolvedValue({ config: { default_person_access: "talk" } });
        expect(await getDefaultPersonAccess("t1")).toBe("talk");
    });

    it("ignores an invalid stored value and falls back to 'observe'", async () => {
        mockTenantsFindFirst.mockResolvedValue({ config: { default_person_access: "nonsense" } });
        expect(await getDefaultPersonAccess("t1")).toBe("observe");
    });
});

describe("resolvePerson", () => {
    beforeEach(() => {
        mockPeopleFindFirst.mockReset();
        mockTenantsFindFirst.mockReset();
        mockInsertReturning.mockReset();
        mockUpdateReturning.mockReset();
    });

    it("creates a new person using the tenant's configured default access on first contact", async () => {
        mockPeopleFindFirst.mockResolvedValueOnce(undefined);
        mockTenantsFindFirst.mockResolvedValue({ config: { default_person_access: "observe" } });
        mockInsertReturning.mockResolvedValue([basePersonRow({ access: "observe" })]);

        const { person, isNew } = await resolvePerson("t1", "123", { displayName: "Alice", username: "alice" });

        expect(isNew).toBe(true);
        expect(person.access).toBe("observe");
        expect(person.telegramUserId).toBe("123");
    });

    it("defaults to 'observe' when the tenant hasn't configured default_person_access", async () => {
        mockPeopleFindFirst.mockResolvedValueOnce(undefined);
        mockTenantsFindFirst.mockResolvedValue({ config: {} });
        mockInsertReturning.mockResolvedValue([basePersonRow({ access: "observe" })]);

        const { person } = await resolvePerson("t1", "999");
        expect(person.access).toBe("observe");
    });

    it("bumps last_seen/refreshes name on repeat contact without touching access", async () => {
        const existing = basePersonRow({ access: "talk" });
        mockPeopleFindFirst.mockResolvedValueOnce(existing);
        mockUpdateReturning.mockResolvedValue([{ ...existing, displayName: "Alice B" }]);

        const { person, isNew } = await resolvePerson("t1", "123", { displayName: "Alice B" });

        expect(isNew).toBe(false);
        expect(person.access).toBe("talk"); // untouched by a repeat resolve
        expect(person.displayName).toBe("Alice B");
    });

    it("falls back to a read when a concurrent insert races the unique constraint", async () => {
        const raced = basePersonRow({ access: "observe" });
        mockPeopleFindFirst
            .mockResolvedValueOnce(undefined) // initial existence check: not found
            .mockResolvedValueOnce(raced); // re-read after the insert conflict finds the winner
        mockTenantsFindFirst.mockResolvedValue({ config: {} });
        mockInsertReturning.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

        const { person, isNew } = await resolvePerson("t1", "123");

        expect(isNew).toBe(false);
        expect(person.id).toBe("p1");
    });
});
