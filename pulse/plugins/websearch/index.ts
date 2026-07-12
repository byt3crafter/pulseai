/**
 * Web Search Plugin for Pulse AI
 *
 * Gives agents a `web_search` tool to look up current information on the web.
 * Uses Tavily (AI-optimized search, free tier). The API key is stored per
 * tenant (TAVILY_API_KEY) — nothing hardcoded.
 */

import { definePlugin } from "../../src/plugins/sdk/index.js";
import { webSearchTool } from "./tool.js";

export default definePlugin({
    name: "websearch",
    version: "1.0.0",
    description: "Web search — agents look up current, real-world information on the web (via Tavily).",
    author: "Runstate",

    permissions: {
        network: ["api.tavily.com"],
    },

    credentialSchema: [
        {
            name: "TAVILY_API_KEY",
            label: "Tavily API Key",
            type: "secret",
            placeholder: "tvly-...",
            required: true,
            helpText: "Free key from tavily.com — powers agent web search (AI-optimized results).",
        },
    ],

    tools: [webSearchTool],

    routes: [
        {
            method: "GET",
            path: "/status",
            handler: async (_request: any, reply: any) =>
                reply.send({ plugin: "websearch", version: "1.0.0", status: "active", tools: ["web_search"] }),
        },
    ],
});
