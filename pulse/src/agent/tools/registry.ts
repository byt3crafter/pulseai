import { Tool } from "./tool.interface.js";
import { timeTool } from "./built-in/time.js";
import { calculatorTool } from "./built-in/calculator.js";
import { execTool } from "./built-in/exec.js";
import { processTool } from "./built-in/process.js";
import { credentialListTool } from "./built-in/vault.js";
import { credentialSetTool } from "./built-in/credential-set.js";
import { pulseHelpTool } from "./built-in/pulse-help.js";
import { commitmentCreateTool, commitmentListTool, commitmentCompleteTool } from "./built-in/commitments.js";
import { notifyTool } from "./built-in/notify.js";
import { pythonExecuteTool } from "./built-in/python.js";
import { scriptSaveTool, scriptLoadTool, scriptListTool } from "./built-in/script-store.js";
import { memoryStoreTool, memorySearchTool, memoryForgetTool } from "./built-in/memory-tools.js";
import { scheduleJobTool, scheduleOnceTool, listJobsTool, cancelJobTool } from "./built-in/schedule.js";
import { delegateToAgentTool } from "./built-in/delegate.js";
import { listAgentsTool } from "./built-in/agent-mgmt.js";
import { activityLogTool } from "./built-in/activity-log.js";
import { contactLookupTool, contactListTool, contactSaveTool, contactDeleteTool } from "./built-in/contacts.js";
import { calendarAddTool, calendarListTool, calendarSearchTool, calendarDeleteTool } from "./built-in/calendar.js";
import { loginListTool } from "./built-in/logins.js";
import { loginSaveTool } from "./built-in/login-save.js";
import { noteSaveTool, noteListTool, noteSearchTool, noteDeleteTool } from "./built-in/notes.js";
import { todoAddTool, todoListTool, todoCompleteTool, todoDeleteTool } from "./built-in/todos.js";
import { bookmarkSaveTool, bookmarkListTool, bookmarkSearchTool, bookmarkDeleteTool } from "./built-in/bookmarks.js";
import { expenseAddTool, expenseListTool, expenseSearchTool, expenseDeleteTool } from "./built-in/expenses.js";
import { taskCreateTool, taskUpdateTool, taskListTool, taskCompleteTool, taskDeleteTool } from "./built-in/tasks.js";
import { documentListTool, documentSearchTool, documentReadTool, documentDeleteTool } from "./built-in/documents.js";
import { pdfReadTool, pdfFormFieldsTool, pdfFillFormTool } from "./built-in/pdf.js";
import {
    emailSendTool, emailReadTool, emailListTool, emailFetchUnreadTool, emailDraftTool,
    emailReplyTool, emailSearchTool, emailFlagTool, emailMoveTool, emailDeleteTool, emailFoldersTool,
} from "./built-in/email.js";
import { emailConfigureTool } from "./built-in/email-config.js";
import { db } from "../../storage/db.js";
import { tenantSkills, mcpServers, agentProfileMcpBindings, agentProfiles } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { getMcpClient, getMcpTools } from "./mcp-client.js";
import { sandboxTool, createSandboxTool } from "./built-in/sandbox.js";
import { workspaceUpdateTool } from "./built-in/workspace-update.js";
import { filterTools, ToolPolicy } from "./tool-policy.js";
import { pluginManager } from "../../plugins/manager.js";
import { getTenantCustomTools } from "./custom-tools.js";
import { getTenantServerTools } from "../../servers/tools.js";
import { routeToChannelTool } from "./built-in/route-to-channel.js";
import { decrypt } from "../../utils/crypto.js";

/**
 * MCP auth headers are stored encrypted-at-rest wrapped as `{ __enc: <cipher> }`.
 * Decrypt to the real header map, tolerating legacy plaintext rows written
 * before encryption was added.
 */
function decodeMcpAuthHeaders(stored: unknown): Record<string, string> {
    const obj = (stored as Record<string, any>) || {};
    if (typeof obj.__enc === "string") {
        try {
            return JSON.parse(decrypt(obj.__enc));
        } catch (err) {
            logger.error({ err }, "Failed to decrypt MCP auth headers");
            return {};
        }
    }
    return obj as Record<string, string>;
}

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
        this.builtInTools.set("credential_set", credentialSetTool);
        this.builtInTools.set("pulse_help", pulseHelpTool);
        this.builtInTools.set("commitment_create", commitmentCreateTool);
        this.builtInTools.set("commitment_list", commitmentListTool);
        this.builtInTools.set("commitment_complete", commitmentCompleteTool);
        this.builtInTools.set("notify", notifyTool);
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
        this.builtInTools.set("activity_log", activityLogTool);
        this.builtInTools.set("contact_lookup", contactLookupTool);
        this.builtInTools.set("contact_list", contactListTool);
        this.builtInTools.set("contact_save", contactSaveTool);
        this.builtInTools.set("contact_delete", contactDeleteTool);
        this.builtInTools.set("calendar_add", calendarAddTool);
        this.builtInTools.set("calendar_list", calendarListTool);
        this.builtInTools.set("calendar_search", calendarSearchTool);
        this.builtInTools.set("calendar_delete", calendarDeleteTool);
        this.builtInTools.set("login_list", loginListTool);
        this.builtInTools.set("login_save", loginSaveTool);
        this.builtInTools.set("note_save", noteSaveTool);
        this.builtInTools.set("note_list", noteListTool);
        this.builtInTools.set("note_search", noteSearchTool);
        this.builtInTools.set("note_delete", noteDeleteTool);
        this.builtInTools.set("todo_add", todoAddTool);
        this.builtInTools.set("todo_list", todoListTool);
        this.builtInTools.set("todo_complete", todoCompleteTool);
        this.builtInTools.set("todo_delete", todoDeleteTool);
        this.builtInTools.set("bookmark_save", bookmarkSaveTool);
        this.builtInTools.set("bookmark_list", bookmarkListTool);
        this.builtInTools.set("bookmark_search", bookmarkSearchTool);
        this.builtInTools.set("bookmark_delete", bookmarkDeleteTool);
        this.builtInTools.set("expense_add", expenseAddTool);
        this.builtInTools.set("expense_list", expenseListTool);
        this.builtInTools.set("expense_search", expenseSearchTool);
        this.builtInTools.set("expense_delete", expenseDeleteTool);
        this.builtInTools.set("task_create", taskCreateTool);
        this.builtInTools.set("task_update", taskUpdateTool);
        this.builtInTools.set("task_list", taskListTool);
        this.builtInTools.set("task_complete", taskCompleteTool);
        this.builtInTools.set("task_delete", taskDeleteTool);
        this.builtInTools.set("document_list", documentListTool);
        this.builtInTools.set("document_search", documentSearchTool);
        this.builtInTools.set("document_read", documentReadTool);
        this.builtInTools.set("document_delete", documentDeleteTool);
        this.builtInTools.set("pdf_read", pdfReadTool);
        this.builtInTools.set("pdf_form_fields", pdfFormFieldsTool);
        this.builtInTools.set("pdf_fill_form", pdfFillFormTool);
        this.builtInTools.set("route_to_channel", routeToChannelTool);
        this.builtInTools.set("email_send", emailSendTool);
        this.builtInTools.set("email_draft", emailDraftTool);
        this.builtInTools.set("email_read", emailReadTool);
        this.builtInTools.set("email_list", emailListTool);
        this.builtInTools.set("email_fetch_unread", emailFetchUnreadTool);
        this.builtInTools.set("email_reply", emailReplyTool);
        this.builtInTools.set("email_search", emailSearchTool);
        this.builtInTools.set("email_flag", emailFlagTool);
        this.builtInTools.set("email_move", emailMoveTool);
        this.builtInTools.set("email_delete", emailDeleteTool);
        this.builtInTools.set("email_folders", emailFoldersTool);
        this.builtInTools.set("email_configure", emailConfigureTool);

        logger.info(
            { toolCount: this.builtInTools.size, tools: Array.from(this.builtInTools.keys()) },
            "Tool registry initialized"
        );
    }

    /** Get a built-in tool by name (used to inject routing tools for channel leads). */
    getBuiltInTool(name: string): Tool | undefined {
        return this.builtInTools.get(name);
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

                // Inject workspace_update tool if self-config is enabled for this agent
                if (profile?.selfConfigEnabled) {
                    tools.push(workspaceUpdateTool);
                    logger.info({ tenantId, agentProfileId }, "workspace_update tool injected (self-config enabled).");
                }

                const bindings = await db.select({
                    serverId: mcpServers.id,
                    url: mcpServers.url,
                    authHeaders: mcpServers.authHeaders
                })
                    .from(agentProfileMcpBindings)
                    .innerJoin(mcpServers, eq(agentProfileMcpBindings.mcpServerId, mcpServers.id))
                    // Defense in depth: only load servers owned by this tenant, so a
                    // stale/forged binding to another tenant's server can't use its
                    // URL + credentials.
                    .where(and(
                        eq(agentProfileMcpBindings.agentProfileId, agentProfileId),
                        eq(mcpServers.tenantId, tenantId)
                    ));

                for (const binding of bindings) {
                    const client = await getMcpClient(binding.serverId, binding.url, decodeMcpAuthHeaders(binding.authHeaders));
                    if (client) {
                        const mcpTools = await getMcpTools(binding.serverId, client);
                        for (const t of mcpTools) t.source = "mcp";
                        tools.push(...mcpTools);
                    }
                }

                // 3. Inject tenant-enabled plugin-contributed tools
                const pluginTools = await pluginManager.getPluginToolsForTenant(tenantId);
                for (const t of pluginTools) t.source = "plugin";
                tools.push(...pluginTools);

                // 3.5 Inject per-tenant custom tools (customer's own API/software), scoped to this agent
                const customToolList = await getTenantCustomTools(tenantId, agentProfileId);
                for (const t of customToolList) t.source = "custom";
                tools.push(...customToolList);

                // 3.6 Inject Server Inventory SSH tools, scoped to servers this agent is explicitly allowed on
                const serverToolList = await getTenantServerTools(tenantId, agentProfileId);
                for (const t of serverToolList) t.source = "server";
                tools.push(...serverToolList);

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
