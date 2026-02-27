/**
 * workspace_update — Lets the agent edit its own workspace files
 * (SOUL.md, IDENTITY.md, TOOLS.md, USER.md, MEMORY.md, HEARTBEAT.md).
 *
 * Gated behind agentProfiles.selfConfigEnabled (off by default).
 */

import { Tool } from "../tool.interface.js";
import { workspaceService } from "../../workspace/workspace-service.js";
import { logger } from "../../../utils/logger.js";

export const workspaceUpdateTool: Tool = {
    name: "workspace_update",
    description:
        "Update one of your own workspace configuration files. " +
        "Use this to evolve your personality (SOUL.md), identity (IDENTITY.md), " +
        "tool usage notes (TOOLS.md), user preferences (USER.md), " +
        "persistent memory notes (MEMORY.md), heartbeat instructions (HEARTBEAT.md), " +
        "workspace operating manual (AGENTS.md), or delete the bootstrap script (BOOTSTRAP.md) after onboarding. " +
        "Changes take effect on the next message.",
    parameters: {
        type: "object",
        properties: {
            fileName: {
                type: "string",
                enum: ["SOUL.md", "IDENTITY.md", "TOOLS.md", "USER.md", "MEMORY.md", "HEARTBEAT.md", "AGENTS.md", "BOOTSTRAP.md"],
                description: "Which workspace file to update.",
            },
            content: {
                type: "string",
                description: "The full new content for the file (replaces existing content).",
            },
            summary: {
                type: "string",
                description: "A short description of what changed and why (for the revision log).",
            },
        },
        required: ["fileName", "content"],
    },
    execute: async ({ tenantId, args }) => {
        const agentId = (args as any)._agentId;
        if (!agentId) {
            return { result: "Error: Agent context not available. Cannot determine which agent is calling." };
        }

        const { fileName, content, summary } = args;

        try {
            await workspaceService.writeFile(
                tenantId,
                agentId,
                fileName,
                content,
                summary || `Agent self-edit: ${fileName}`,
                undefined // no userId — agent-initiated
            );

            logger.info(
                { tenantId, agentId, fileName, summaryText: summary },
                "Agent updated its own workspace file"
            );

            return {
                result: `Successfully updated ${fileName}. Changes will take effect on the next message.`,
            };
        } catch (err: any) {
            logger.error({ err, tenantId, agentId, fileName }, "workspace_update tool failed");
            return { result: `Failed to update ${fileName}: ${err.message || "Unknown error"}` };
        }
    },
};
