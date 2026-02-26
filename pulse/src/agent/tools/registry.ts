import { Tool } from "./tool.interface.js";
import { timeTool } from "./built-in/time.js";
import { calculatorTool } from "./built-in/calculator.js";
import { execTool } from "./built-in/exec.js";
import { processTool } from "./built-in/process.js";
import { credentialListTool } from "./built-in/vault.js";
import { pythonExecuteTool } from "./built-in/python.js";
import { scriptSaveTool, scriptLoadTool, scriptListTool } from "./built-in/script-store.js";
import { memoryStoreTool, memorySearchTool, memoryForgetTool } from "./built-in/memory-tools.js";
import { scheduleJobTool, scheduleOnceTool, listJobsTool, cancelJobTool } from "./built-in/schedule.js";
import { delegateToAgentTool } from "./built-in/delegate.js";
import { listAgentsTool } from "./built-in/agent-mgmt.js";
import { db } from "../../storage/db.js";
import { tenantSkills, mcpServers, agentProfileMcpBindings, agentProfiles } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { getMcpClient, getMcpTools } from "./mcp-client.js";
import { sandboxTool, createSandboxTool } from "./built-in/sandbox.js";
import { filterTools, ToolPolicy } from "./tool-policy.js";
import { pluginManager } from "../../plugins/manager.js";

/**
 * Tool Registry - Manages available tools and their execution
 */
export class ToolRegistry {
    private builtInTools: Map<string, Tool> = new Map();

    constructor() {
        // Register all built-in tools
        this.builtInTools.set("get_current_time", timeTool);
        this.builtInTools.set("calculator", calculatorTool);
        this.builtInTools.set("exec", execTool);
        this.builtInTools.set("process", processTool);
        this.builtInTools.set("credential_list", credentialListTool);
        this.builtInTools.set("python_execute", pythonExecuteTool);
        this.builtInTools.set("script_save", scriptSaveTool);
        this.builtInTools.set("script_load", scriptLoadTool);
        this.builtInTools.set("script_list", scriptListTool);
        this.builtInTools.set("memory_store", memoryStoreTool);
        this.builtInTools.set("memory_search", memorySearchTool);
        this.builtInTools.set("memory_forget", memoryForgetTool);
        this.builtInTools.set("schedule_job", scheduleJobTool);
        this.builtInTools.set("schedule_once", scheduleOnceTool);
        this.builtInTools.set("list_jobs", listJobsTool);
        this.builtInTools.set("cancel_job", cancelJobTool);
        this.builtInTools.set("delegate_to_agent", delegateToAgentTool);
        this.builtInTools.set("list_agents", listAgentsTool);

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
                const profile = await db.query.agentProfiles.findFirst({
                    where: eq(agentProfiles.id, agentProfileId)
                });

                // Enhanced sandbox config takes priority over legacy flag
                const sandboxCfg = profile?.sandboxConfig as any;
                if (sandboxCfg?.mode && sandboxCfg.mode !== "off") {
                    tools.push(createSandboxTool(sandboxCfg, profile?.workspacePath || undefined));
                    logger.warn({ tenantId, agentProfileId, mode: sandboxCfg.mode }, "Enhanced sandbox tool injected.");
                } else if (profile?.dockerSandboxEnabled) {
                    tools.push(sandboxTool);
                    logger.warn({ tenantId, agentProfileId }, "Legacy Docker Sandbox enabled. Bash tool injected.");
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

                // 3. Inject plugin-contributed tools
                const pluginTools = pluginManager.getPluginTools();
                tools.push(...pluginTools);

                // 4. Apply tool policy filtering
                if (profile?.toolPolicy) {
                    const policy = profile.toolPolicy as ToolPolicy;
                    if (policy.allow?.length || policy.deny?.length) {
                        const beforeCount = tools.length;
                        const filtered = filterTools(tools, policy);
                        tools.length = 0;
                        tools.push(...filtered);
                        logger.debug(
                            { tenantId, agentProfileId, beforeCount, afterCount: tools.length },
                            "Applied tool policy filter"
                        );
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
