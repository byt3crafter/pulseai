import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database
vi.mock("../../src/storage/db.js", () => ({
    db: {
        query: {
            agentProfiles: {
                findMany: vi.fn().mockResolvedValue([]),
                findFirst: vi.fn().mockResolvedValue(null),
            },
        },
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { getDelegatableAgents, getAgentDelegationConfig, canDelegateTo, DelegationConfig } from "../../src/agent/orchestration/agent-registry.js";
import { db } from "../../src/storage/db.js";

describe("agent-registry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getDelegatableAgents", () => {
        it("returns empty array when no agents exist", async () => {
            (db.query.agentProfiles.findMany as any).mockResolvedValue([]);
            const result = await getDelegatableAgents("tenant-1");
            expect(result).toEqual([]);
        });

        it("returns only agents that accept delegation", async () => {
            (db.query.agentProfiles.findMany as any).mockResolvedValue([
                { id: "a1", name: "Agent A", tenantId: "t1", modelId: "claude-sonnet-4-20250514", delegationConfig: { acceptsDelegation: true, specialization: "Finance" } },
                { id: "a2", name: "Agent B", tenantId: "t1", modelId: "gpt-4o", delegationConfig: { acceptsDelegation: false } },
                { id: "a3", name: "Agent C", tenantId: "t1", modelId: "claude-sonnet-4-20250514", delegationConfig: { acceptsDelegation: true, specialization: "HR" } },
            ]);

            const result = await getDelegatableAgents("t1");
            expect(result).toHaveLength(2);
            expect(result.map((a) => a.name)).toEqual(["Agent A", "Agent C"]);
        });

        it("excludes the specified agent", async () => {
            (db.query.agentProfiles.findMany as any).mockResolvedValue([
                { id: "a1", name: "Agent A", tenantId: "t1", modelId: "m1", delegationConfig: { acceptsDelegation: true } },
                { id: "a2", name: "Agent B", tenantId: "t1", modelId: "m1", delegationConfig: { acceptsDelegation: true } },
            ]);

            const result = await getDelegatableAgents("t1", "a1");
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("a2");
        });

        it("handles agents without delegationConfig", async () => {
            (db.query.agentProfiles.findMany as any).mockResolvedValue([
                { id: "a1", name: "Agent A", tenantId: "t1", modelId: "m1", delegationConfig: null },
                { id: "a2", name: "Agent B", tenantId: "t1", modelId: "m1", delegationConfig: {} },
            ]);

            const result = await getDelegatableAgents("t1");
            expect(result).toEqual([]);
        });
    });

    describe("getAgentDelegationConfig", () => {
        it("returns empty config when agent not found", async () => {
            (db.query.agentProfiles.findFirst as any).mockResolvedValue(null);
            const config = await getAgentDelegationConfig("non-existent");
            expect(config).toEqual({});
        });

        it("returns delegation config from agent profile", async () => {
            const delConfig: DelegationConfig = {
                canDelegate: true,
                acceptsDelegation: true,
                maxDepth: 5,
                specialization: "ERPNext specialist",
            };
            (db.query.agentProfiles.findFirst as any).mockResolvedValue({
                id: "a1",
                delegationConfig: delConfig,
            });

            const config = await getAgentDelegationConfig("a1");
            expect(config.canDelegate).toBe(true);
            expect(config.maxDepth).toBe(5);
        });
    });

    describe("canDelegateTo", () => {
        it("denies when source cannot delegate", async () => {
            (db.query.agentProfiles.findFirst as any)
                .mockResolvedValueOnce({ id: "src", delegationConfig: { canDelegate: false } })
                .mockResolvedValueOnce({ id: "tgt", delegationConfig: { acceptsDelegation: true } });

            const result = await canDelegateTo("src", "tgt");
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain("Source agent");
        });

        it("denies when target does not accept delegation", async () => {
            (db.query.agentProfiles.findFirst as any)
                .mockResolvedValueOnce({ id: "src", delegationConfig: { canDelegate: true } })
                .mockResolvedValueOnce({ id: "tgt", delegationConfig: { acceptsDelegation: false } });

            const result = await canDelegateTo("src", "tgt");
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain("Target agent");
        });

        it("allows when both agents have correct config", async () => {
            (db.query.agentProfiles.findFirst as any)
                .mockResolvedValueOnce({ id: "src", delegationConfig: { canDelegate: true } })
                .mockResolvedValueOnce({ id: "tgt", delegationConfig: { acceptsDelegation: true } });

            const result = await canDelegateTo("src", "tgt");
            expect(result.allowed).toBe(true);
        });

        it("denies when target not in allowed delegation list", async () => {
            (db.query.agentProfiles.findFirst as any)
                .mockResolvedValueOnce({ id: "src", delegationConfig: { canDelegate: true, delegateTo: ["other-agent"] } })
                .mockResolvedValueOnce({ id: "tgt", delegationConfig: { acceptsDelegation: true } });

            const result = await canDelegateTo("src", "tgt");
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain("not in source");
        });

        it("allows when target is in the delegation list", async () => {
            (db.query.agentProfiles.findFirst as any)
                .mockResolvedValueOnce({ id: "src", delegationConfig: { canDelegate: true, delegateTo: ["tgt"] } })
                .mockResolvedValueOnce({ id: "tgt", delegationConfig: { acceptsDelegation: true } });

            const result = await canDelegateTo("src", "tgt");
            expect(result.allowed).toBe(true);
        });
    });
});
