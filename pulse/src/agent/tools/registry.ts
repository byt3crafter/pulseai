import { Tool } from "./tool.interface.js";
import { timeTool } from "./built-in/time.js";
import { calculatorTool } from "./built-in/calculator.js";
import { db } from "../../storage/db.js";
import { tenantSkills } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger.js";

/**
 * Tool Registry - Manages available tools and their execution
 *
 * The registry:
 * - Maintains a list of all built-in tools
 * - Queries tenant_skills table to get enabled tools per tenant
 * - Executes tools and handles errors gracefully
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
     * Get tools enabled for a specific tenant
     * Queries the tenant_skills table and returns matching tool definitions
     */
    async getEnabledTools(tenantId: string): Promise<Tool[]> {
        try {
            // Query tenant_skills table for enabled skills
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
                } else {
                    logger.warn(
                        { tenantId, skillName: skill.skillName },
                        "Tenant has enabled skill that is not registered"
                    );
                }
            }

            logger.debug(
                { tenantId, toolCount: tools.length, tools: tools.map((t) => t.name) },
                "Retrieved enabled tools for tenant"
            );

            return tools;
        } catch (err) {
            logger.error({ err, tenantId }, "Failed to get enabled tools");
            return [];
        }
    }

    /**
     * Execute a tool by name with given parameters
     * Returns the tool result or error message
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
            logger.warn({ toolName, tenantId: params.tenantId }, "Attempted to execute unknown tool");
            return {
                result: `Error: Tool '${toolName}' not found`,
            };
        }

        try {
            logger.debug(
                { toolName, tenantId: params.tenantId, args: params.args },
                "Executing tool"
            );

            const result = await tool.execute(params);

            logger.debug(
                { toolName, tenantId: params.tenantId, hasMetadata: !!result.metadata },
                "Tool execution completed"
            );

            return result;
        } catch (err: any) {
            logger.error(
                { err, toolName, tenantId: params.tenantId },
                "Tool execution failed"
            );

            return {
                result: `Error executing tool '${toolName}': ${err.message || "Unknown error"}`,
            };
        }
    }

    /**
     * Get all available built-in tools (for admin/debugging purposes)
     */
    getAllTools(): Tool[] {
        return Array.from(this.builtInTools.values());
    }
}
