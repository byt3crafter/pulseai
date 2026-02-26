import { describe, it, expect } from "vitest";
import { applyMMR, ScoredItem } from "../../src/memory/mmr.js";

describe("applyMMR", () => {
    it("returns empty array for empty input", () => {
        expect(applyMMR([], 0.7, 5)).toEqual([]);
    });

    it("returns single item for single input", () => {
        const items: ScoredItem[] = [{ id: "1", score: 0.9, embedding: [1, 0, 0] }];
        expect(applyMMR(items, 0.7, 5)).toEqual(items);
    });

    it("picks highest-scoring item first", () => {
        const items: ScoredItem[] = [
            { id: "1", score: 0.5, embedding: [1, 0, 0] },
            { id: "2", score: 0.9, embedding: [0, 1, 0] },
            { id: "3", score: 0.7, embedding: [0, 0, 1] },
        ];
        const result = applyMMR(items, 0.7, 3);
        expect(result[0].id).toBe("2");
    });

    it("promotes diversity — does not pick duplicate embeddings", () => {
        const items: ScoredItem[] = [
            { id: "1", score: 0.9, embedding: [1, 0, 0] },
            { id: "2", score: 0.85, embedding: [0.99, 0.01, 0] }, // very similar to 1
            { id: "3", score: 0.7, embedding: [0, 1, 0] }, // very different
        ];
        const result = applyMMR(items, 0.5, 2); // low lambda = more diversity
        expect(result[0].id).toBe("1");
        // Second pick should favor diversity over similarity
        expect(result[1].id).toBe("3");
    });

    it("respects limit parameter", () => {
        const items: ScoredItem[] = [
            { id: "1", score: 0.9, embedding: [1, 0, 0] },
            { id: "2", score: 0.8, embedding: [0, 1, 0] },
            { id: "3", score: 0.7, embedding: [0, 0, 1] },
            { id: "4", score: 0.6, embedding: [1, 1, 0] },
        ];
        const result = applyMMR(items, 0.7, 2);
        expect(result).toHaveLength(2);
    });

    it("with lambda=1.0, behaves like pure relevance ranking", () => {
        const items: ScoredItem[] = [
            { id: "1", score: 0.9, embedding: [1, 0, 0] },
            { id: "2", score: 0.8, embedding: [0.99, 0.01, 0] },
            { id: "3", score: 0.7, embedding: [0, 1, 0] },
        ];
        const result = applyMMR(items, 1.0, 3);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("2"); // pure relevance, similarity penalty = 0
    });

    it("handles items without embeddings (falls back to score sort)", () => {
        const items: ScoredItem[] = [
            { id: "1", score: 0.5, embedding: null },
            { id: "2", score: 0.9, embedding: null },
            { id: "3", score: 0.7, embedding: null },
        ];
        const result = applyMMR(items, 0.7, 3);
        expect(result[0].id).toBe("2");
        expect(result[1].id).toBe("3");
        expect(result[2].id).toBe("1");
    });

    it("handles mixed items (some with embeddings, some without)", () => {
        const items: ScoredItem[] = [
            { id: "1", score: 0.9, embedding: [1, 0] },
            { id: "2", score: 0.8, embedding: null },
            { id: "3", score: 0.7, embedding: [0, 1] },
        ];
        const result = applyMMR(items, 0.7, 3);
        expect(result).toHaveLength(3);
        // Item with embedding and highest score should be first
        expect(result[0].id).toBe("1");
    });
});
