/**
 * route_to_channel — lets a channel LEAD hand a task to another department/group.
 * Resolves the target channel's lead agent and delegates the task to it, returning
 * the result. Authorized by org structure (same tenant), not per-agent flags.
 */
import { Tool } from "../tool.interface.js";
import { resolveChannelLeadByName } from "../../../gateway/channel-service.js";
import { delegateTask } from "../../orchestration/agent-delegation.js";

export const routeToChannelTool: Tool = {
    name: "route_to_channel",
    description:
        "Hand a task to another department (channel) when it belongs to them. " +
        "The receiving department's lead handles it and returns the result. " +
        "Use the exact department name shown in your routing list.",
    parameters: {
        type: "object",
        properties: {
            channel: { type: "string", description: "The target department/channel name" },
            task: { type: "string", description: "Clear, self-contained description of what they should do" },
        },
        required: ["channel", "task"],
    },
    async execute({ args, tenantId, conversationId }) {
        const channel = String(args.channel || "").trim();
        const task = String(args.task || "").trim();
        const sourceAgentId = (args as any)._agentId as string | undefined;
        if (!channel || !task) return { result: "route_to_channel needs both 'channel' and 'task'." };

        const target = await resolveChannelLeadByName(tenantId, channel);
        if (!target) return { result: `No department named "${channel}" with a lead was found.` };

        const res = await delegateTask(
            sourceAgentId || conversationId,
            target.leadAgentId,
            task,
            tenantId,
            conversationId,
            0,
            { bypassPolicy: true },
        );
        if (!res.success) return { result: `Could not route to ${target.channelName}: ${res.result}` };
        return {
            result: `Reply from ${target.channelName} lead:\n${res.result}`,
            metadata: { routedTo: target.channelName, delegationId: res.delegationId },
        };
    },
};
