/**
 * Catalog of built-in agent tools, grouped for the Workspace Tools UI.
 *
 * `tenant_skills` gates which built-in tools an agent in this workspace may use,
 * keyed by the tool's registered name. Historically these rows were hand-seeded
 * via SQL, so a brand-new workspace had ZERO tools and its agents could do
 * nothing until someone ran INSERTs. This catalog drives both a sensible
 * default set at tenant creation AND a management UI, so that's no longer true.
 *
 * `defaultOn` = enabled automatically for a new workspace. The powerful/technical
 * tools (shell, python, scripts, credential listing) default OFF — they're opt-in
 * for technical agents, not something a fresh workspace should have live.
 *
 * Keep the tool names in sync with the registry in
 * `pulse/src/agent/tools/registry.ts`. A tool missing from this catalog simply
 * won't appear in the UI or the default seed (safe: it stays disabled).
 */

export interface ToolCatalogEntry {
    name: string;        // registered tool name == tenant_skills.skill_name
    label: string;
    description: string;
    defaultOn: boolean;
}

export interface ToolCatalogGroup {
    key: string;
    title: string;
    description: string;
    tools: ToolCatalogEntry[];
}

export const TOOL_CATALOG: ToolCatalogGroup[] = [
    {
        key: "core",
        title: "Core",
        description: "Basic utilities every agent benefits from.",
        tools: [
            { name: "get_current_time", label: "Current time", description: "Read the current date and time.", defaultOn: true },
            { name: "calculator", label: "Calculator", description: "Evaluate arithmetic expressions.", defaultOn: true },
        ],
    },
    {
        key: "memory",
        title: "Memory",
        description: "Let an agent remember and recall facts across conversations.",
        tools: [
            { name: "memory_store", label: "Store memory", description: "Save a fact to long-term memory.", defaultOn: true },
            { name: "memory_search", label: "Search memory", description: "Recall relevant stored memories.", defaultOn: true },
            { name: "memory_forget", label: "Forget memory", description: "Delete a stored memory.", defaultOn: true },
        ],
    },
    {
        key: "scheduling",
        title: "Scheduling",
        description: "Let an agent schedule its own recurring or one-off work.",
        tools: [
            { name: "schedule_job", label: "Schedule recurring job", description: "Create a recurring scheduled task.", defaultOn: true },
            { name: "schedule_once", label: "Schedule one-off", description: "Schedule a single future run.", defaultOn: true },
            { name: "list_jobs", label: "List jobs", description: "See scheduled jobs.", defaultOn: true },
            { name: "cancel_job", label: "Cancel job", description: "Cancel a scheduled job.", defaultOn: true },
        ],
    },
    {
        key: "collaboration",
        title: "Collaboration",
        description: "Let an agent hand work to teammates and other departments.",
        tools: [
            { name: "delegate_to_agent", label: "Delegate to agent", description: "Hand a sub-task to another agent.", defaultOn: true },
            { name: "list_agents", label: "List agents", description: "See the other agents it can delegate to.", defaultOn: true },
            { name: "route_to_channel", label: "Route to department", description: "Route a request to another department channel.", defaultOn: true },
        ],
    },
    {
        key: "oversight",
        title: "Oversight",
        description: "Let an agent review the workspace audit trail — who changed what.",
        tools: [
            { name: "activity_log", label: "Activity log", description: "Read the workspace audit log: who changed settings, tools, credentials, agents, team roles and integrations.", defaultOn: false },
        ],
    },
    {
        key: "email",
        title: "Email",
        description: "Send, read and manage email. Requires email to be connected in Settings → Email.",
        tools: [
            { name: "email_send", label: "Send email", description: "Compose and send a new email.", defaultOn: true },
            { name: "email_reply", label: "Reply to email", description: "Reply within an email thread.", defaultOn: true },
            { name: "email_read", label: "Read email", description: "Read a specific message.", defaultOn: true },
            { name: "email_list", label: "List email", description: "List messages in a folder.", defaultOn: true },
            { name: "email_fetch_unread", label: "Fetch unread", description: "Pull unread messages.", defaultOn: true },
            { name: "email_search", label: "Search email", description: "Search the mailbox.", defaultOn: true },
            { name: "email_flag", label: "Flag email", description: "Flag/unflag a message.", defaultOn: true },
            { name: "email_move", label: "Move email", description: "Move a message to a folder.", defaultOn: true },
            { name: "email_delete", label: "Delete email", description: "Delete a message.", defaultOn: true },
            { name: "email_folders", label: "List folders", description: "List mailbox folders.", defaultOn: true },
        ],
    },
    {
        key: "technical",
        title: "Technical (advanced)",
        description: "Powerful tools for technical/DevOps agents. Off by default — enable deliberately.",
        tools: [
            { name: "exec", label: "Shell exec", description: "Run a shell command in the agent workspace.", defaultOn: false },
            { name: "process", label: "Process control", description: "Manage long-running processes.", defaultOn: false },
            { name: "python_execute", label: "Run Python", description: "Execute Python code.", defaultOn: false },
            { name: "script_save", label: "Save script", description: "Save a reusable script.", defaultOn: false },
            { name: "script_load", label: "Load script", description: "Load a saved script.", defaultOn: false },
            { name: "script_list", label: "List scripts", description: "List saved scripts.", defaultOn: false },
            { name: "credential_list", label: "List credentials", description: "List available credential names (not values).", defaultOn: false },
        ],
    },
];

/** Flat list of every catalog tool. */
export const ALL_CATALOG_TOOLS: ToolCatalogEntry[] = TOOL_CATALOG.flatMap((g) => g.tools);

/** Tool names enabled by default for a brand-new workspace. */
export const DEFAULT_ENABLED_TOOLS: string[] = ALL_CATALOG_TOOLS.filter((t) => t.defaultOn).map((t) => t.name);

/** Valid catalog tool names (for validating UI input). */
export const CATALOG_TOOL_NAMES = new Set(ALL_CATALOG_TOOLS.map((t) => t.name));
