/**
 * Delegate tool — allows an agent to delegate a task to another specialized agent.
 */

import { Tool } from "../tool.interface.js";
import { delegateTask } from "../../orchestration/agent-delegation.js";

export const delegateToAgentTool: Tool = {
    name: "delegate_to_agent",
    description:
        "Delegate a task to another specialized agent. " +
        "The target agent will process the task and return results. " +
        "Use list_agents first to see available agents and their specializations.",
    parameters: {
        type: "object",
        properties: {
            agentId: { type: "string", description: "Target agent ID (from list_agents)" },
            task: { type: "string", description: "Clear description of what the target agent should do" },
        },
        required: ["agentId", "task"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { agentId, task } = args;
        const sourceAgentId = (args as any)._agentId || conversationId;

        const result = await delegateTask(
            sourceAgentId,
            agentId,
            task,
            tenantId,
            conversationId
        );

        if (!result.success) {
            return { result: result.result };
        }

        return {
            result: result.result,
            metadata: {
                delegationId: result.delegationId,
                tokensUsed: result.tokensUsed,
            },
        };
    },
};
