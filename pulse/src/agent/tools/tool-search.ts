/**
 * Tool Search — progressive tool disclosure.
 *
 * When many tools are enabled, sending every schema to the model on every turn
 * bloats the prompt and hurts tool selection. Instead we send only the core
 * tools plus one `tool_search` meta-tool; extension tools (plugins, MCP, custom
 * HTTP, server SSH) are revealed on demand when the agent searches for them.
 *
 * Behaviour is per-tenant (tenants.config.toolSearch) — nothing hardcoded.
 */

import { Tool } from "./tool.interface.js";

export type ToolSearchMode = "off" | "auto" | "on";

export interface ToolSearchConfig {
    mode: ToolSearchMode;
    /** In "auto" mode, activate only when the deferred tool count exceeds this. */
    threshold: number;
    /** Max tools returned by a single tool_search call. */
    maxResults: number;
}

const MODES: ToolSearchMode[] = ["off", "auto", "on"];

/** Read the tenant's Tool Search setting from its config (safe defaults). */
export function parseToolSearchConfig(tenantConfig: unknown): ToolSearchConfig {
    const c = (tenantConfig && typeof tenantConfig === "object" ? (tenantConfig as any).toolSearch : undefined) || {};
    const mode = MODES.includes(c.mode) ? c.mode : "auto";
    const threshold = Number.isFinite(c.threshold) ? Math.max(1, Math.min(100, Math.floor(c.threshold))) : 12;
    const maxResults = Number.isFinite(c.maxResults) ? Math.max(1, Math.min(25, Math.floor(c.maxResults))) : 6;
    return { mode, threshold, maxResults };
}

/** A tool is "deferrable" if it comes from an extension source (not a built-in). */
export function isDeferrable(tool: Tool): boolean {
    return tool.source === "plugin" || tool.source === "mcp" || tool.source === "custom" || tool.source === "server";
}

/**
 * Decide whether Tool Search should be active for this turn given the config
 * and the number of deferrable tools.
 */
export function shouldUseToolSearch(cfg: ToolSearchConfig, deferrableCount: number): boolean {
    if (deferrableCount === 0) return false;
    if (cfg.mode === "off") return false;
    if (cfg.mode === "on") return true;
    return deferrableCount > cfg.threshold; // auto
}

/** The synthetic meta-tool the model calls to discover deferred tools. */
export const TOOL_SEARCH_NAME = "tool_search";

export function toolSearchDefinition() {
    return {
        name: TOOL_SEARCH_NAME,
        description:
            "Find additional tools by what you want to do. Not every tool is loaded upfront — describe the task " +
            "(e.g. \"upload a file to OneDrive\", \"search the web\", \"send a WhatsApp message\") and this returns " +
            "matching tools, which you can then call directly. Search again with different words if nothing fits.",
        input_schema: {
            type: "object" as const,
            properties: {
                query: { type: "string", description: "What you want to do, in plain language." },
            },
            required: ["query"],
        },
    };
}

function tokenize(s: string): string[] {
    return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

/**
 * Rank deferred tools against a query. Returns the top `max` by relevance
 * (name matches weighted higher than description). Always returns something
 * when there are deferred tools, so the model can discover what exists.
 */
export function rankDeferredTools(
    deferred: Tool[],
    query: string,
    max: number
): { matches: Tool[]; total: number } {
    const tokens = tokenize(query || "");
    const scored = deferred.map((t) => {
        const name = t.name.toLowerCase();
        const desc = (t.description || "").toLowerCase();
        let score = 0;
        for (const tok of tokens) {
            if (name.includes(tok)) score += 3;
            if (desc.includes(tok)) score += 1;
        }
        return { tool: t, score };
    });
    scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
    return { matches: scored.slice(0, max).map((s) => s.tool), total: deferred.length };
}

/** Compact parameter hint for a tool, e.g. "path (string, required), name (string)". */
function paramHint(tool: Tool): string {
    const props = tool.parameters?.properties || {};
    const required = new Set(tool.parameters?.required || []);
    const parts = Object.entries(props)
        .filter(([k]) => k !== "_agentId")
        .slice(0, 8)
        .map(([k, v]: [string, any]) => `${k} (${v?.type || "any"}${required.has(k) ? ", required" : ""})`);
    return parts.join(", ");
}

/** Build the human-readable result string returned from a tool_search call. */
export function formatSearchResult(matches: Tool[], total: number, query: string): string {
    if (matches.length === 0) {
        return JSON.stringify({ query, matches: [], note: "No tools available to search." });
    }
    const items = matches.map((t) => ({ name: t.name, description: t.description, params: paramHint(t) }));
    const note =
        `${matches.length} of ${total} tool(s) shown — you can now call these directly. ` +
        `Search again with different words if you need something else.`;
    return JSON.stringify({ query, matches: items, note }, null, 2);
}
