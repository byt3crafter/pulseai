import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProviderById } from "../agent/providers/model-registry.js";

/*
 * The provider endpoint must be config, not a hardcoded switch.
 *
 * CLAUDE.md forbids hardcoded endpoints, and a fixed base URL means MiniMax
 * cannot be pointed at another region without a code change. The registry is
 * the single source of truth, overridable per deployment via env.
 */
const mgr = readFileSync(join(process.cwd(), "src", "agent", "providers", "provider-manager.ts"), "utf8");

describe("provider base URL is registry-driven", () => {
    it("the registry carries each OpenAI-compatible provider's endpoint", () => {
        expect(getProviderById("minimax")?.apiBase).toBe("https://api.minimax.io/v1");
        expect(getProviderById("openrouter")?.apiBase).toBe("https://openrouter.ai/api/v1");
        expect(getProviderById("groq")?.apiBase).toBe("https://api.groq.com/openai/v1");
        // Anthropic uses its SDK default, no OpenAI-compat base.
        expect(getProviderById("anthropic")?.apiBase).toBeUndefined();
    });

    it("provider-manager no longer hardcodes the endpoints in a switch", () => {
        // The exact strings that used to live in getBaseURL's switch.
        expect(mgr).not.toMatch(/case "minimax":\s*\n\s*return "https:\/\/api\.minimax\.io/);
        expect(mgr).not.toContain('return "https://openrouter.ai/api/v1"');
    });

    it("reads a per-provider env override before the registry default", () => {
        // MINIMAX_API_KEY -> MINIMAX_BASE_URL, so overriding an endpoint uses the
        // same naming as its key.
        expect(mgr).toMatch(/\$\{prefix\}_BASE_URL/);
        expect(mgr).toMatch(/return def\?\.apiBase/);
    });
});
