import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { closeSession } from "../client.js";

export const browserCloseTool: Tool = {
    name: "browser_close",
    description: "Close this agent's browser session and free its resources. Safe to call even if no session is open.",
    parameters: {
        type: "object",
        properties: {},
        required: [],
    },

    async execute({ tenantId, conversationId, args }) {
        try {
            const agentId = (args._agentId as string) || conversationId;
            await closeSession(tenantId, agentId);
            return { result: JSON.stringify({ closed: true }) };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Close failed" }) };
        }
    },
};
