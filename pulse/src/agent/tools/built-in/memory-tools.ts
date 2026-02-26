/**
 * Agent memory tools — store, search, and forget memories.
 */

import { Tool } from "../tool.interface.js";
import { memoryService } from "../../../memory/memory-service.js";

export const memoryStoreTool: Tool = {
    name: "memory_store",
    description:
        "Store an important fact, preference, decision, or learned pattern in long-term memory. " +
        "Memories persist across conversations and are automatically retrieved when relevant.",
    parameters: {
        type: "object",
        properties: {
            content: { type: "string", description: "The fact or information to remember" },
            category: {
                type: "string",
                description: "Category: 'fact', 'preference', 'decision', 'task', 'relationship', or 'general'",
            },
            importance: {
                type: "number",
                description: "Importance score 0.0 to 1.0 (default: 0.5). Higher = more likely to be recalled.",
            },
        },
        required: ["content"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { content, category, importance } = args;
        const agentId = (args as any)._agentId || conversationId;

        const memoryId = await memoryService.store(tenantId, agentId, content, {
            category: category || "general",
            importance: importance ?? 0.5,
        });

        return { result: `Memory stored (id: ${memoryId}).` };
    },
};

export const memorySearchTool: Tool = {
    name: "memory_search",
    description:
        "Search your long-term memory for relevant facts, preferences, or past decisions. " +
        "Uses semantic similarity and keyword matching.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "What to search for" },
            category: { type: "string", description: "Filter by category (optional)" },
            limit: { type: "number", description: "Max results (default: 5)" },
        },
        required: ["query"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { query, category, limit } = args;
        const agentId = (args as any)._agentId || conversationId;

        const results = await memoryService.search(tenantId, agentId, query, {
            limit: limit || 5,
            category,
        });

        if (results.length === 0) {
            return { result: "No matching memories found." };
        }

        const lines = results.map((r, i) => {
            const cat = r.category ? `[${r.category}]` : "";
            const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "unknown";
            return `${i + 1}. ${cat} ${r.content} (stored: ${date}, relevance: ${r.score.toFixed(2)})`;
        });

        return { result: `Found ${results.length} memories:\n${lines.join("\n")}` };
    },
};

export const memoryForgetTool: Tool = {
    name: "memory_forget",
    description: "Delete a specific memory by its ID.",
    parameters: {
        type: "object",
        properties: {
            memoryId: { type: "string", description: "The memory ID to delete" },
        },
        required: ["memoryId"],
    },
    execute: async ({ args }) => {
        await memoryService.forget(args.memoryId);
        return { result: `Memory ${args.memoryId} forgotten.` };
    },
};
