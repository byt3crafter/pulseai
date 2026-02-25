import { Tool } from "./tool.interface.js";
import { timeTool } from "./built-in/time.js";
import { calculatorTool } from "./built-in/calculator.js";
import { db } from "../../storage/db.js";
import { tenantSkills, mcpServers, agentProfileMcpBindings, agentProfiles } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { getMcpClient, getMcpTools } from "./mcp-client.js";
import { sandboxTool } from "./built-in/sandbox.js";

/**
 * Tool Registry - Manages available tools and their execution
 */
export class ToolRegistry {
    private builtInTools: Map<string, Tool> = new Map();

    constructor() {
        // Register all built-in tools
        this.builtInTools.set("get_current_time", timeTool);
        this.builtInTools.set("calculator", calculatorTool);

        logger.info(
            { toolCount: this.builtInTools.size, tools: Array.from(this.builtInTools.keys()) },
            "Tool registry initialized"
        );
    }

    /**
     * Get tools enabled for a specific tenant and agent profile
     */
    async getEnabledTools(tenantId: string, agentProfileId?: string): Promise<Tool[]> {
        try {
            // 1. Fetch built-in skills
            const enabledSkills = await db.query.tenantSkills.findMany({
                where: and(
                    eq(tenantSkills.tenantId, tenantId),
                    eq(tenantSkills.enabled, true)
                ),
            });

            const tools: Tool[] = [];
            for (const skill of enabledSkills) {
                const tool = this.builtInTools.get(skill.skillName);
                if (tool) {
                    tools.push(tool);
                }
            }

            // 2. Fetch MCP tools if agentProfile is specified
            if (agentProfileId) {
                // Fetch the agent profile to check for special privileges
                const profile = await db.query.agentProfiles.findFirst({
                    where: eq(agentProfiles.id, agentProfileId)
                });

                // If the profile has docker sandbox enabled, inject the highly privileged bash tool
                if (profile?.dockerSandboxEnabled) {
                    tools.push(sandboxTool);
                    logger.warn({ tenantId, agentProfileId }, "Agent Profile has Docker Sandbox Capabilities enabled. Bash tool injected.");
                }

                const bindings = await db.select({
                    serverId: mcpServers.id,
                    url: mcpServers.url,
                    authHeaders: mcpServers.authHeaders
                })
                    .from(agentProfileMcpBindings)
                    .innerJoin(mcpServers, eq(agentProfileMcpBindings.mcpServerId, mcpServers.id))
                    .where(eq(agentProfileMcpBindings.agentProfileId, agentProfileId));

                for (const binding of bindings) {
                    const client = await getMcpClient(binding.serverId, binding.url, (binding.authHeaders as Record<string, string>) || {});
                    if (client) {
                        const mcpTools = await getMcpTools(binding.serverId, client);
                        tools.push(...mcpTools);
                    }
                }
            }

            return tools;
        } catch (err) {
            logger.error({ err, tenantId }, "Failed to get enabled tools");
            return [];
        }
    }

    /**
     * Execute a known built-in tool by name
     */
    async executeTool(
        toolName: string,
        params: {
            tenantId: string;
            conversationId: string;
            args: Record<string, any>;
        }
    ): Promise<{ result: string; metadata?: Record<string, any> }> {
        const tool = this.builtInTools.get(toolName);

        if (!tool) {
            logger.warn({ toolName, tenantId: params.tenantId }, "Attempted to execute unknown built-in tool");
            return {
                result: `Error: Built-in Tool '${toolName}' not found`,
            };
        }

        try {
            logger.debug({ toolName, tenantId: params.tenantId }, "Executing built-in tool");
            return await tool.execute(params);
        } catch (err: any) {
            logger.error({ err, toolName, tenantId: params.tenantId }, "Tool execution failed");
            return {
                result: `Error executing tool '${toolName}': ${err.message || "Unknown error"}`,
            };
        }
    }

    getAllTools(): Tool[] {
        return Array.from(this.builtInTools.values());
    }
}
