import { describe, expect, it, vi } from "vitest";
import { AutoMemoryService } from "../memory/auto-memory-service.js";

describe("AutoMemoryService", () => {
    it("extracts structured memories and stores bounded durable facts", async () => {
        const extract = vi.fn().mockResolvedValue({
            content: JSON.stringify({
                memories: [
                    { content: "The user prefers invoices grouped by customer.", category: "preference", importance: 0.8 },
                    { content: "  ", category: "fact", importance: 0.9 },
                    { content: "x".repeat(900), category: "decision", importance: 2 },
                ],
            }),
            usage: { inputTokens: 12, outputTokens: 8 },
        });
        const store = vi.fn().mockResolvedValue("memory-1");
        const service = new AutoMemoryService({ extract, store, findExisting: vi.fn().mockResolvedValue([]) });

        const result = await service.captureTurn({
            tenantId: "tenant-1",
            agentId: "agent-1",
            model: "model-1",
            userMessage: "Remember I like invoices grouped by customer.",
            assistantMessage: "Saved.",
            maxMemories: 3,
        });

        expect(result.storedCount).toBe(2);
        expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
        expect(store).toHaveBeenCalledWith("tenant-1", "agent-1", "The user prefers invoices grouped by customer.", {
            category: "preference",
            importance: 0.8,
            metadata: { source: "auto_memory" },
        });
        expect(store).toHaveBeenCalledWith("tenant-1", "agent-1", "x".repeat(500), {
            category: "decision",
            importance: 1,
            metadata: { source: "auto_memory" },
        });
    });

    it("skips duplicate extracted and existing memories", async () => {
        const extract = vi.fn().mockResolvedValue({
            content: JSON.stringify({
                memories: [
                    { content: "The user prefers weekly payroll reports.", category: "preference", importance: 0.7 },
                    { content: "The user prefers weekly payroll reports.", category: "preference", importance: 0.7 },
                    { content: "The user wants invoices grouped by customer.", category: "preference", importance: 0.7 },
                ],
            }),
            usage: { inputTokens: 9, outputTokens: 6 },
        });
        const store = vi.fn().mockResolvedValue("memory-1");
        const findExisting = vi.fn().mockImplementation(async (_tenantId, _agentId, content: string) => (
            content.includes("weekly payroll") ? [{ content: "The user prefers weekly payroll reports." }] : []
        ));
        const service = new AutoMemoryService({ extract, store, findExisting });

        const result = await service.captureTurn({
            tenantId: "tenant-1",
            agentId: "agent-1",
            model: "model-1",
            userMessage: "Remember weekly payroll and invoice grouping.",
            assistantMessage: "Understood.",
            maxMemories: 5,
        });

        expect(result.storedCount).toBe(1);
        expect(store).toHaveBeenCalledTimes(1);
        expect(store).toHaveBeenCalledWith("tenant-1", "agent-1", "The user wants invoices grouped by customer.", {
            category: "preference",
            importance: 0.7,
            metadata: { source: "auto_memory" },
        });
    });

    it("returns zero memories when extraction JSON is malformed", async () => {
        const service = new AutoMemoryService({
            extract: vi.fn().mockResolvedValue({
                content: "Saved: I will remember that",
                usage: { inputTokens: 4, outputTokens: 4 },
            }),
            store: vi.fn(),
        });

        const result = await service.captureTurn({
            tenantId: "tenant-1",
            agentId: "agent-1",
            model: "model-1",
            userMessage: "Remember this.",
            assistantMessage: "Saved.",
            maxMemories: 3,
        });

        expect(result.storedCount).toBe(0);
        expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 4 });
    });

    it("does not fail the turn when storing an extracted memory fails", async () => {
        const service = new AutoMemoryService({
            extract: vi.fn().mockResolvedValue({
                content: JSON.stringify({
                    memories: [
                        { content: "The user prefers Monday summaries.", category: "preference", importance: 0.7 },
                    ],
                }),
                usage: { inputTokens: 5, outputTokens: 5 },
            }),
            store: vi.fn().mockRejectedValue(new Error("database unavailable")),
            findExisting: vi.fn().mockResolvedValue([]),
        });

        const result = await service.captureTurn({
            tenantId: "tenant-1",
            agentId: "agent-1",
            model: "model-1",
            userMessage: "Remember Monday summaries.",
            assistantMessage: "I will remember that.",
        });

        expect(result).toEqual({ storedCount: 0, usage: { inputTokens: 5, outputTokens: 5 } });
    });

    it("does not run without an agent id or non-empty turn content", async () => {
        const extract = vi.fn();
        const service = new AutoMemoryService({ extract, store: vi.fn() });

        expect(await service.captureTurn({
            tenantId: "tenant-1",
            agentId: null,
            model: "model-1",
            userMessage: "Remember this.",
            assistantMessage: "Saved.",
        })).toEqual({ storedCount: 0, usage: { inputTokens: 0, outputTokens: 0 } });

        expect(await service.captureTurn({
            tenantId: "tenant-1",
            agentId: "agent-1",
            model: "model-1",
            userMessage: "",
            assistantMessage: "",
        })).toEqual({ storedCount: 0, usage: { inputTokens: 0, outputTokens: 0 } });

        expect(extract).not.toHaveBeenCalled();
    });
});
