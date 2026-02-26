/**
 * Agent Management tools — list available agents for delegation.
 */

import { Tool } from "../tool.interface.js";
import { getDelegatableAgents } from "../../orchestration/agent-registry.js";

export const listAgentsTool: Tool = {
    name: "list_agents",
    description:
        "List all agents in this tenant that accept delegation. " +
        "Returns agent IDs, names, specializations, and models. " +
        "Use this to discover which agents you can delegate tasks to.",
    parameters: {
        type: "object",
        properties: {},
        required: [],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const currentAgentId = (args as any)._agentId || conversationId;
        const agents = await getDelegatableAgents(tenantId, currentAgentId);

        if (agents.length === 0) {
            return { result: "No agents available for delegation. Ask your administrator to enable delegation on other agents." };
        }

        const lines = agents.map((a) =>
            `- ${a.name} (id: ${a.id}) — ${a.specialization} [Model: ${a.modelId}]`
        );

        return {
            result: `Available agents for delegation:\n${lines.join("\n")}`,
            metadata: { agentCount: agents.length },
        };
    },
};
