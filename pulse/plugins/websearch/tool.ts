import { Tool } from "../../src/agent/tools/tool.interface.js";
import { credentialVault } from "../../src/agent/tools/credential-vault.js";
import { logger } from "../../src/utils/logger.js";

const TIMEOUT_MS = 20_000;

export const webSearchTool: Tool = {
    name: "web_search",
    description:
        "Search the web for current, real-world information and return the top results (title, URL, snippet) " +
        "plus a short synthesized answer. Use this whenever you don't already know something — recent events, " +
        "product specs, supplier details, prices, company info, etc. Requires web search to be configured.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "The search query in natural language." },
            count: { type: "number", description: "Number of results to return (default 5, max 10)." },
        },
        required: ["query"],
    },
    async execute({ tenantId, args }) {
        const env = await credentialVault.getEnvVars(tenantId, (args as any)._agentId);
        const key = env["TAVILY_API_KEY"];
        if (!key) {
            return { result: "Web search isn't configured. Add a TAVILY_API_KEY credential (free key at tavily.com), then enable the Web Search plugin." };
        }

        const count = Math.min(Number(args.count) || 5, 10);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_key: key,
                    query: String(args.query),
                    max_results: count,
                    include_answer: true,
                    search_depth: "basic",
                }),
                signal: controller.signal,
            });
            const json: any = await res.json().catch(() => ({}));
            if (!res.ok) {
                logger.warn({ status: res.status, err: json?.error }, "web_search error");
                return { result: `Web search error (${res.status}): ${json?.error || res.statusText}` };
            }
            const results = (json.results || []).map((r: any) => ({
                title: r.title,
                url: r.url,
                snippet: typeof r.content === "string" ? r.content.slice(0, 500) : undefined,
            }));
            return {
                result: JSON.stringify({ query: args.query, answer: json.answer || undefined, results }, null, 2),
                metadata: { count: results.length },
            };
        } catch (err: any) {
            if (err.name === "AbortError") return { result: "Web search timed out (20s)." };
            logger.error({ err }, "web_search failed");
            return { result: `Web search failed: ${err.message}` };
        } finally {
            clearTimeout(timer);
        }
    },
};
