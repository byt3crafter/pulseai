import { ProviderManager } from "../agent/providers/provider-manager.js";
import { memoryService, type MemoryResult } from "./memory-service.js";
import { logger } from "../utils/logger.js";

const MEMORY_CATEGORIES = new Set(["fact", "preference", "decision", "task", "relationship", "general"]);
const DEFAULT_MAX_MEMORIES = 3;
const MAX_MEMORY_LENGTH = 500;

// Persona rollup (L2/L3): how often to re-distill the long-term profile, and the
// minimum number of atoms before building a first one. Cooldown keeps the extra
// LLM call rare (it runs in the same background path as extraction).
const PERSONA_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
const PERSONA_MIN_ATOMS = 5;
const PERSONA_MAX_LENGTH = 1200;

export interface AutoMemoryUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface AutoMemoryCandidate {
    content: string;
    category?: string;
    importance?: number;
}

export interface AutoMemoryCaptureInput {
    tenantId: string;
    agentId: string | null | undefined;
    model: string;
    userMessage: string;
    assistantMessage: string;
    maxMemories?: number;
}

export interface AutoMemoryCaptureResult {
    storedCount: number;
    usage: AutoMemoryUsage;
}

type ExtractFn = (input: Required<Pick<AutoMemoryCaptureInput, "tenantId" | "model" | "userMessage" | "assistantMessage">> & {
    maxMemories: number;
}) => Promise<{ content: string; usage: AutoMemoryUsage }>;

type StoreFn = (
    tenantId: string,
    agentId: string,
    content: string,
    opts: { category: string; importance: number; metadata: Record<string, unknown> },
) => Promise<string>;

type FindExistingFn = (tenantId: string, agentId: string, content: string) => Promise<Array<Pick<MemoryResult, "content">>>;

export class AutoMemoryService {
    private providerManager = new ProviderManager();
    private extract: ExtractFn;
    private store: StoreFn;
    private findExisting: FindExistingFn;

    constructor(deps?: {
        extract?: ExtractFn;
        store?: StoreFn;
        findExisting?: FindExistingFn;
    }) {
        this.extract = deps?.extract ?? this.extractWithProvider.bind(this);
        this.store = deps?.store ?? ((tenantId, agentId, content, opts) => memoryService.store(tenantId, agentId, content, opts));
        this.findExisting = deps?.findExisting ?? ((tenantId, agentId, content) => memoryService.search(tenantId, agentId, content, { limit: 3 }));
    }

    async captureTurn(input: AutoMemoryCaptureInput): Promise<AutoMemoryCaptureResult> {
        const zero = { storedCount: 0, usage: { inputTokens: 0, outputTokens: 0 } };
        const agentId = input.agentId?.trim();
        const userMessage = input.userMessage.trim();
        const assistantMessage = input.assistantMessage.trim();
        const maxMemories = this.normalizeMaxMemories(input.maxMemories);

        if (!agentId || (!userMessage && !assistantMessage) || maxMemories <= 0) {
            return zero;
        }

        let extraction: { content: string; usage: AutoMemoryUsage };
        try {
            extraction = await this.extract({
                tenantId: input.tenantId,
                model: input.model,
                userMessage,
                assistantMessage,
                maxMemories,
            });
        } catch (err) {
            logger.warn({ err, tenantId: input.tenantId, agentId }, "Auto-memory extraction failed");
            return zero;
        }

        const candidates = this.parseCandidates(extraction.content).slice(0, maxMemories);
        let storedCount = 0;
        const seen = new Set<string>();

        for (const candidate of candidates) {
            const normalized = this.normalizeContent(candidate.content);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);

            const existing = await this.findExisting(input.tenantId, agentId, candidate.content).catch((err) => {
                logger.warn({ err, tenantId: input.tenantId, agentId }, "Auto-memory duplicate check failed");
                return [];
            });
            if (existing.some((memory) => this.normalizeContent(memory.content) === normalized)) continue;

            try {
                await this.store(input.tenantId, agentId, candidate.content, {
                    category: candidate.category || "general",
                    importance: candidate.importance ?? 0.5,
                    metadata: { source: "auto_memory" },
                });
                storedCount++;
            } catch (err) {
                logger.warn({ err, tenantId: input.tenantId, agentId }, "Auto-memory store failed");
            }
        }

        // L2/L3 rollup: when we captured fresh facts, occasionally re-distill the
        // long-term persona profile (cooldown-gated so it's rare). Its usage is
        // folded into the return so the caller bills it with the turn.
        let rollupUsage: AutoMemoryUsage = { inputTokens: 0, outputTokens: 0 };
        if (storedCount > 0) {
            rollupUsage = await this.maybeRollupPersona({ tenantId: input.tenantId, agentId, model: input.model });
        }

        return {
            storedCount,
            usage: {
                inputTokens: extraction.usage.inputTokens + rollupUsage.inputTokens,
                outputTokens: extraction.usage.outputTokens + rollupUsage.outputTokens,
            },
        };
    }

    /**
     * Distill the agent's atom memories into a single long-term PERSONA profile
     * (stable preferences, constraints, key relationships, recurring context).
     * Cooldown-gated; runs in the background extraction path. Returns its token
     * usage so the caller can bill it. Never throws.
     */
    async maybeRollupPersona(input: { tenantId: string; agentId: string; model: string }): Promise<AutoMemoryUsage> {
        const zero: AutoMemoryUsage = { inputTokens: 0, outputTokens: 0 };
        try {
            const meta = await memoryService.getPersonaMeta(input.tenantId, input.agentId);
            if (meta?.createdAt && Date.now() - new Date(meta.createdAt).getTime() < PERSONA_COOLDOWN_MS) {
                return zero; // profile is still fresh — skip
            }
            const atoms = await memoryService.getRecentAtoms(input.tenantId, input.agentId, 40);
            // Need enough signal for a FIRST profile; once one exists, any new atom warrants a refresh.
            if (atoms.length < (meta ? 1 : PERSONA_MIN_ATOMS)) return zero;

            const existing = await memoryService.getPersona(input.tenantId, input.agentId, 2000);
            const distilled = await this.distillPersona({
                tenantId: input.tenantId,
                model: input.model,
                atoms,
                existing,
            });
            const profile = distilled.content.trim().slice(0, PERSONA_MAX_LENGTH);
            if (profile) {
                await memoryService.upsertPersona(input.tenantId, input.agentId, profile);
                logger.info({ tenantId: input.tenantId, agentId: input.agentId, atomCount: atoms.length }, "Persona profile rolled up");
            }
            return distilled.usage;
        } catch (err) {
            logger.warn({ err, tenantId: input.tenantId, agentId: input.agentId }, "Persona rollup failed");
            return zero;
        }
    }

    private async distillPersona(input: {
        tenantId: string;
        model: string;
        atoms: { content: string; category: string | null }[];
        existing: string | null;
    }): Promise<{ content: string; usage: AutoMemoryUsage }> {
        const systemPrompt =
            "You maintain a concise long-term PROFILE of the person and workspace this assistant serves. " +
            "Given the CURRENT profile (may be empty) and a list of RECENT remembered facts, produce an UPDATED profile. " +
            "Merge and deduplicate; drop anything stale or contradicted by newer facts; keep only durable, useful context: " +
            "stable preferences, standing constraints, key people/relationships, ongoing goals, and recurring working patterns. " +
            "Do NOT include one-off requests or transient details. Write plain prose or short bullet lines, at most ~180 words. " +
            "Output ONLY the profile text — no preamble, no headings, no explanation.";

        const factList = input.atoms.map((a, i) => `${i + 1}. ${a.category ? `[${a.category}] ` : ""}${a.content}`).join("\n");
        const userText =
            `CURRENT PROFILE:\n${input.existing || "(none yet)"}\n\n` +
            `RECENT FACTS:\n${factList}\n\n` +
            `Output the updated profile.`;

        const response = await this.providerManager.chat({
            tenantId: input.tenantId,
            model: input.model,
            systemPrompt,
            messages: [{ role: "user", content: userText }],
        });

        const content = (response.content || "")
            .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
            .replace(/<think(?:ing)?>[\s\S]*$/gi, "")
            .trim();
        return { content, usage: response.usage };
    }

    private async extractWithProvider(input: {
        tenantId: string;
        model: string;
        userMessage: string;
        assistantMessage: string;
        maxMemories: number;
    }): Promise<{ content: string; usage: AutoMemoryUsage }> {
        const systemPrompt =
            "Extract durable long-term memories from this user/assistant turn. " +
            "Return ONLY valid JSON with shape {\"memories\":[{\"content\":\"...\",\"category\":\"fact|preference|decision|task|relationship|general\",\"importance\":0.0}]}. " +
            "Only include stable facts, user preferences, decisions, commitments, relationships, or recurring task patterns. " +
            "Do not include transient requests, generic chat, greetings, or facts already implied by the assistant response. " +
            `Return at most ${input.maxMemories} memories. If none, return {\"memories\":[]}.`;

        const response = await this.providerManager.chat({
            tenantId: input.tenantId,
            model: input.model,
            systemPrompt,
            messages: [{
                role: "user",
                content:
                    `User message:\n${input.userMessage}\n\n` +
                    `Assistant response:\n${input.assistantMessage}`,
            }],
        });

        return {
            content: response.content,
            usage: response.usage,
        };
    }

    private parseCandidates(raw: string): AutoMemoryCandidate[] {
        // Reasoning models (e.g. MiniMax M3) wrap the JSON in <think>…</think>
        // and/or prose/code fences, which breaks a naive JSON.parse. Strip the
        // reasoning, then parse the JSON object substring.
        const cleaned = (raw || "")
            .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
            .replace(/<think(?:ing)?>[\s\S]*$/gi, "");
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start < 0 || end < start) return [];

        let parsed: unknown;
        try {
            parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
            return [];
        }

        const memories = Array.isArray((parsed as { memories?: unknown }).memories)
            ? (parsed as { memories: unknown[] }).memories
            : [];

        return memories.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            const content = typeof record.content === "string" ? record.content.trim().slice(0, MAX_MEMORY_LENGTH) : "";
            if (!content) return [];

            const rawCategory = typeof record.category === "string" ? record.category.trim().toLowerCase() : "general";
            const category = MEMORY_CATEGORIES.has(rawCategory) ? rawCategory : "general";
            const rawImportance = typeof record.importance === "number" ? record.importance : 0.5;
            const importance = Math.max(0, Math.min(1, rawImportance));

            return [{ content, category, importance }];
        });
    }

    private normalizeMaxMemories(value: number | undefined): number {
        if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_MAX_MEMORIES;
        return Math.max(0, Math.min(5, Math.floor(value)));
    }

    private normalizeContent(content: string): string {
        return content.trim().toLowerCase().replace(/\s+/g, " ");
    }
}

export const autoMemoryService = new AutoMemoryService();
