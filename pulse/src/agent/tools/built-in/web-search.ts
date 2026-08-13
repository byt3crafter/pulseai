/**
 * Web Search + Web Fetch — provider-agnostic, config-driven, nothing hardcoded.
 *
 * `web_search` finds current information; `web_fetch` reads a page into clean
 * text/markdown. Both read their backend from config (tenant override over an
 * admin/global default), so a deployment can point them at:
 *   - SELF-HOSTED  SearXNG (search) + Firecrawl (fetch) — free + private, the
 *     recommended default for a dedicated box (see docker-compose.search.yml).
 *   - PAID APIs     Tavily / Brave (search), Firecrawl cloud (fetch) — optional
 *     fallbacks, keys stored encrypted.
 *
 * Security: the model-supplied URL for `web_fetch` is SSRF-guarded (public hosts
 * only) BEFORE it is handed to any fetcher, so neither a self-hosted Firecrawl
 * nor the basic fetcher can be aimed at internal/metadata endpoints. The calls
 * to the SearXNG/Firecrawl *services* themselves use a plain fetch because those
 * are trusted internal endpoints configured by an admin.
 *
 * Every query/fetch is rate-limited per tenant and written to the audit log.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { tenants, globalSettings, auditLogs } from "../../../storage/schema.js";
import { eq } from "drizzle-orm";
import { decrypt } from "../../../utils/crypto.js";
import { logger } from "../../../utils/logger.js";
import { assertSafeUrl, assertResolvedHostSafe, safeFetch } from "../../../utils/ssrf.js";
import { credentialVault } from "../credential-vault.js";

const TIMEOUT_MS = 25_000;

// Sensible defaults matching docker-compose.search.yml service names. These are
// DEFAULTS ONLY — every value is overridable per-tenant/global in the UI. No
// keys, tenants, or providers are hardcoded.
const DEFAULT_SEARXNG_URL = "http://searxng:8080";
const DEFAULT_FIRECRAWL_URL = "http://firecrawl-api:3002";
const FIRECRAWL_CLOUD_URL = "https://api.firecrawl.dev";
const DEFAULT_RATE_PER_MIN = 30;
const DEFAULT_MAX_RESULTS = 5;

export interface WebSearchConfig {
    enabled?: boolean;
    searchProvider?: "searxng" | "tavily" | "brave";
    fetchProvider?: "firecrawl" | "basic";
    searxngUrl?: string;
    firecrawlUrl?: string;
    firecrawlApiKeyEnc?: string;
    tavilyApiKeyEnc?: string;
    braveApiKeyEnc?: string;
    ratePerMin?: number;
    maxResults?: number;
}

interface ResolvedConfig {
    enabled: boolean;
    searchProvider: "searxng" | "tavily" | "brave";
    fetchProvider: "firecrawl" | "basic";
    searxngUrl: string;
    firecrawlUrl: string;
    firecrawlApiKey: string;
    tavilyApiKey: string;
    braveApiKey: string;
    ratePerMin: number;
    maxResults: number;
}

function safeDecrypt(v: unknown): string {
    if (typeof v !== "string" || !v) return "";
    try {
        return decrypt(v);
    } catch {
        return "";
    }
}

/** Merge tenant config over the global/admin default, then apply defaults. */
async function resolveConfig(tenantId: string, agentId?: string): Promise<ResolvedConfig> {
    let tenantCfg: WebSearchConfig = {};
    let globalCfg: WebSearchConfig = {};
    try {
        const t = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { config: true } });
        const c = (t?.config as any)?.webSearch;
        if (c && typeof c === "object") tenantCfg = c;
    } catch { /* defaults */ }
    try {
        const g = await db.query.globalSettings.findFirst({ where: eq(globalSettings.id, "root"), columns: { config: true } });
        const c = (g?.config as any)?.webSearch;
        if (c && typeof c === "object") globalCfg = c;
    } catch { /* defaults */ }

    const pick = <K extends keyof WebSearchConfig>(k: K): WebSearchConfig[K] =>
        tenantCfg[k] !== undefined && tenantCfg[k] !== "" ? tenantCfg[k] : globalCfg[k];

    // Backward-compat: an existing TAVILY_API_KEY credential still works even if
    // it was never migrated into the new config blob.
    let tavilyKey = safeDecrypt(pick("tavilyApiKeyEnc"));
    if (!tavilyKey) {
        try {
            const env = await credentialVault.getEnvVars(tenantId, agentId);
            tavilyKey = env["TAVILY_API_KEY"] || "";
        } catch { /* none */ }
    }

    return {
        enabled: (pick("enabled") as boolean) === true,
        searchProvider: (pick("searchProvider") as any) || "searxng",
        fetchProvider: (pick("fetchProvider") as any) || "firecrawl",
        searxngUrl: (pick("searxngUrl") as string) || DEFAULT_SEARXNG_URL,
        firecrawlUrl: (pick("firecrawlUrl") as string) || DEFAULT_FIRECRAWL_URL,
        firecrawlApiKey: safeDecrypt(pick("firecrawlApiKeyEnc")),
        tavilyApiKey: tavilyKey,
        braveApiKey: safeDecrypt(pick("braveApiKeyEnc")),
        ratePerMin: Number(pick("ratePerMin")) > 0 ? Number(pick("ratePerMin")) : DEFAULT_RATE_PER_MIN,
        maxResults: Number(pick("maxResults")) > 0 ? Math.min(Number(pick("maxResults")), 15) : DEFAULT_MAX_RESULTS,
    };
}

// ── Per-tenant rate limiter (in-memory sliding window) ──────────────────────
const hits = new Map<string, number[]>();
function rateLimited(tenantId: string, perMin: number): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;
    const arr = (hits.get(tenantId) || []).filter((t) => t > windowStart);
    if (arr.length >= perMin) {
        hits.set(tenantId, arr);
        return true;
    }
    arr.push(now);
    hits.set(tenantId, arr);
    return false;
}

async function audit(tenantId: string, agentId: string | undefined, action: string, summary: string, metadata: Record<string, any>): Promise<void> {
    try {
        await db.insert(auditLogs).values({
            tenantId,
            actorRole: "agent",
            action,
            targetType: "web",
            summary: summary.slice(0, 500),
            metadata: { agentId: agentId ?? null, ...metadata },
        });
    } catch (err) {
        logger.warn({ err }, "web tool audit insert failed (non-fatal)");
    }
}

function timeout(): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ── Search providers ────────────────────────────────────────────────────────
type SearchResult = { title?: string; url?: string; snippet?: string };

async function searchSearxng(cfg: ResolvedConfig, query: string): Promise<{ answer?: string; results: SearchResult[] }> {
    const base = cfg.searxngUrl.replace(/\/+$/, "");
    const u = `${base}/search?q=${encodeURIComponent(query)}&format=json&safesearch=1&language=en`;
    const { signal, clear } = timeout();
    try {
        const res = await fetch(u, { signal, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`SearXNG ${res.status} ${res.statusText}`);
        const json: any = await res.json().catch(() => ({}));
        const results: SearchResult[] = (json.results || []).slice(0, cfg.maxResults).map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: typeof r.content === "string" ? r.content.slice(0, 500) : undefined,
        }));
        const answer = Array.isArray(json.answers) && json.answers.length ? String(json.answers[0]) : undefined;
        return { answer, results };
    } finally {
        clear();
    }
}

async function searchTavily(cfg: ResolvedConfig, query: string): Promise<{ answer?: string; results: SearchResult[] }> {
    if (!cfg.tavilyApiKey) throw new Error("Tavily selected but no API key is set");
    const { signal, clear } = timeout();
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: cfg.tavilyApiKey, query, max_results: cfg.maxResults, include_answer: true, search_depth: "basic" }),
            signal,
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Tavily ${res.status}: ${json?.error || res.statusText}`);
        const results: SearchResult[] = (json.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: typeof r.content === "string" ? r.content.slice(0, 500) : undefined,
        }));
        return { answer: json.answer || undefined, results };
    } finally {
        clear();
    }
}

async function searchBrave(cfg: ResolvedConfig, query: string): Promise<{ answer?: string; results: SearchResult[] }> {
    if (!cfg.braveApiKey) throw new Error("Brave selected but no API key is set");
    const u = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${cfg.maxResults}`;
    const { signal, clear } = timeout();
    try {
        const res = await fetch(u, { signal, headers: { Accept: "application/json", "X-Subscription-Token": cfg.braveApiKey } });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Brave ${res.status}: ${json?.message || res.statusText}`);
        const results: SearchResult[] = (json?.web?.results || []).slice(0, cfg.maxResults).map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: typeof r.description === "string" ? r.description.slice(0, 500) : undefined,
        }));
        return { results };
    } finally {
        clear();
    }
}

export const webSearchTool: Tool = {
    name: "web_search",
    source: "builtin",
    description:
        "Search the web for current, real-world information and return the top results (title, URL, snippet). " +
        "Use whenever you don't already know something — recent events, prices, specs, suppliers, company or regulatory info. " +
        "After searching, use web_fetch to read a specific result in full.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "The search query in natural language." },
            count: { type: "number", description: "Number of results (default 5, max 15)." },
        },
        required: ["query"],
    },
    async execute({ tenantId, args }) {
        const agentId = (args as any)._agentId as string | undefined;
        const cfg = await resolveConfig(tenantId, agentId);
        if (!cfg.enabled) {
            return { result: "Web search isn't turned on for this workspace. Enable it in Settings → Web Search (or ask an admin)." };
        }
        if (rateLimited(tenantId, cfg.ratePerMin)) {
            return { result: `Web search rate limit reached (${cfg.ratePerMin}/min). Please wait a moment and try again.` };
        }
        const query = String(args.query || "").trim();
        if (!query) return { result: "Provide a search query." };
        if (args.count) cfg.maxResults = Math.min(Math.max(1, Number(args.count)), 15);

        try {
            let out: { answer?: string; results: SearchResult[] };
            if (cfg.searchProvider === "tavily") out = await searchTavily(cfg, query);
            else if (cfg.searchProvider === "brave") out = await searchBrave(cfg, query);
            else out = await searchSearxng(cfg, query);

            await audit(tenantId, agentId, "tool.web_search", `Searched: "${query}"`, { provider: cfg.searchProvider, results: out.results.length });
            return {
                result: JSON.stringify({ query, provider: cfg.searchProvider, answer: out.answer, results: out.results }, null, 2),
                metadata: { count: out.results.length, provider: cfg.searchProvider },
            };
        } catch (err: any) {
            if (err?.name === "AbortError") return { result: "Web search timed out." };
            logger.warn({ err: err?.message, provider: cfg.searchProvider }, "web_search failed");
            await audit(tenantId, agentId, "tool.web_search", `Search failed: "${query}"`, { provider: cfg.searchProvider, error: err?.message });
            return { result: `Web search failed (${cfg.searchProvider}): ${err?.message || "unknown error"}. Check the backend in Settings → Web Search.` };
        }
    },
};

// ── Fetch providers ─────────────────────────────────────────────────────────
function stripHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

async function fetchFirecrawl(cfg: ResolvedConfig, url: string): Promise<string> {
    // Self-hosted URL if configured, else the cloud endpoint (needs a key).
    const base = (cfg.firecrawlUrl || (cfg.firecrawlApiKey ? FIRECRAWL_CLOUD_URL : "")).replace(/\/+$/, "");
    if (!base) throw new Error("Firecrawl has no URL and no API key configured");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.firecrawlApiKey) headers["Authorization"] = `Bearer ${cfg.firecrawlApiKey}`;
    const { signal, clear } = timeout();
    try {
        const res = await fetch(`${base}/v1/scrape`, {
            method: "POST",
            headers,
            body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
            signal,
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${json?.error || res.statusText}`);
        const md = json?.data?.markdown || json?.data?.content || "";
        if (!md) throw new Error("Firecrawl returned no content");
        return md;
    } finally {
        clear();
    }
}

async function fetchBasic(url: string): Promise<string> {
    const { signal, clear } = timeout();
    try {
        const res = await safeFetch(url, { signal, headers: { "User-Agent": "PulseAI-WebFetch/1.0" } });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const text = await res.text();
        return stripHtml(text);
    } finally {
        clear();
    }
}

export const webFetchTool: Tool = {
    name: "web_fetch",
    source: "builtin",
    description:
        "Fetch a web page (or a search result) and return its main content as clean text/markdown. " +
        "Use after web_search to read a specific URL in full, or to read a page the user gives you. Public URLs only.",
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "The absolute http(s) URL to read." },
            max_chars: { type: "number", description: "Truncate the returned content to this many characters (default 8000)." },
        },
        required: ["url"],
    },
    async execute({ tenantId, args }) {
        const agentId = (args as any)._agentId as string | undefined;
        const cfg = await resolveConfig(tenantId, agentId);
        if (!cfg.enabled) {
            return { result: "Web fetch isn't turned on for this workspace. Enable it in Settings → Web Search (or ask an admin)." };
        }
        if (rateLimited(tenantId, cfg.ratePerMin)) {
            return { result: `Web fetch rate limit reached (${cfg.ratePerMin}/min). Please wait a moment and try again.` };
        }
        const url = String(args.url || "").trim();
        // SSRF guard: validate the model-supplied target BEFORE any fetcher (incl.
        // self-hosted Firecrawl) can be pointed at an internal/metadata address.
        try {
            assertSafeUrl(url);
            await assertResolvedHostSafe(new URL(url).hostname);
        } catch (e: any) {
            return { result: `That URL isn't allowed: ${e?.message || "internal/private address blocked"}.` };
        }
        const maxChars = Number(args.max_chars) > 0 ? Math.min(Number(args.max_chars), 50_000) : 8000;

        try {
            let content: string;
            let used = cfg.fetchProvider;
            if (cfg.fetchProvider === "firecrawl") {
                try {
                    content = await fetchFirecrawl(cfg, url);
                } catch (fcErr: any) {
                    // Firecrawl down/unconfigured → fall back to the basic fetcher so
                    // the agent still gets the page rather than a hard failure.
                    logger.warn({ err: fcErr?.message }, "web_fetch firecrawl failed — falling back to basic");
                    content = await fetchBasic(url);
                    used = "basic";
                }
            } else {
                content = await fetchBasic(url);
            }
            const truncated = content.length > maxChars;
            await audit(tenantId, agentId, "tool.web_fetch", `Fetched: ${url}`, { provider: used, chars: content.length });
            return {
                result: JSON.stringify({ url, provider: used, truncated, content: content.slice(0, maxChars) }, null, 2),
                metadata: { chars: content.length, provider: used },
            };
        } catch (err: any) {
            if (err?.name === "AbortError") return { result: "Web fetch timed out." };
            logger.warn({ err: err?.message }, "web_fetch failed");
            await audit(tenantId, agentId, "tool.web_fetch", `Fetch failed: ${url}`, { error: err?.message });
            return { result: `Couldn't fetch that page: ${err?.message || "unknown error"}.` };
        }
    },
};
