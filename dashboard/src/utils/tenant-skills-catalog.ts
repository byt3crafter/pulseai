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
            { name: "pulse_help", label: "Workspace help", description: "Let the agent report what's connected/configured and what still needs setup.", defaultOn: false },
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
            { name: "email_read_attachment", label: "Read attachments", description: "Open a PDF, invoice or spreadsheet attached to an email and pull the details out of it.", defaultOn: true },
            { name: "email_list", label: "List email", description: "List messages in a folder.", defaultOn: true },
            { name: "email_fetch_unread", label: "Fetch unread", description: "Pull unread messages.", defaultOn: true },
            { name: "email_search", label: "Search email", description: "Search the mailbox.", defaultOn: true },
            { name: "email_flag", label: "Flag email", description: "Flag/unflag a message.", defaultOn: true },
            { name: "email_move", label: "Move email", description: "Move a message to a folder.", defaultOn: true },
            { name: "email_delete", label: "Delete email", description: "Delete a message.", defaultOn: true },
            { name: "email_folders", label: "List folders", description: "List mailbox folders.", defaultOn: true },
            { name: "email_draft", label: "Save draft", description: "Save an email to the Drafts folder instead of sending.", defaultOn: true },
            { name: "email_configure", label: "Configure mailbox", description: "Let the agent set up its own SMTP/IMAP mailbox settings (writes encrypted credentials). Off by default.", defaultOn: false },
        ],
    },
    {
        key: "contacts",
        title: "Contacts",
        description: "Let an agent look up and manage your address book.",
        tools: [
            { name: "contact_lookup", label: "Look up contact", description: "Find a person's email/phone/company by name.", defaultOn: true },
            { name: "contact_save", label: "Save contact", description: "Add or update a contact.", defaultOn: true },
            { name: "contact_list", label: "List contacts", description: "List saved contacts.", defaultOn: true },
            { name: "contact_delete", label: "Delete contact", description: "Remove a contact.", defaultOn: false },
        ],
    },
    {
        key: "calendar",
        title: "Calendar",
        description: "Let an agent read and manage your calendar.",
        tools: [
            { name: "calendar_list", label: "List events", description: "See upcoming events.", defaultOn: true },
            { name: "calendar_add", label: "Add event", description: "Create a calendar event.", defaultOn: true },
            { name: "calendar_search", label: "Search events", description: "Find events by title/attendee.", defaultOn: true },
            { name: "calendar_delete", label: "Delete event", description: "Remove a calendar event.", defaultOn: false },
        ],
    },
    {
        key: "passwords",
        title: "Passwords",
        description: "Let an agent use your saved website logins (it never sees the passwords).",
        tools: [
            { name: "login_list", label: "List logins", description: "See which saved logins are available (labels/usernames only, never passwords).", defaultOn: false },
            { name: "login_save", label: "Save login", description: "Let the agent save a website login to the vault (password encrypted). Off by default.", defaultOn: false },
        ],
    },
    {
        key: "notepad",
        title: "Notepad",
        description: "Let an agent jot and recall freeform notes.",
        tools: [
            { name: "note_save", label: "Save note", description: "Write or update a note.", defaultOn: false },
            { name: "note_list", label: "List notes", description: "See saved notes.", defaultOn: false },
            { name: "note_search", label: "Search notes", description: "Find notes by keyword.", defaultOn: false },
            { name: "note_delete", label: "Delete note", description: "Remove a note.", defaultOn: false },
        ],
    },
    {
        key: "todos",
        title: "To-dos",
        description: "Let an agent manage a task list.",
        tools: [
            { name: "todo_add", label: "Add to-do", description: "Add a task, optionally with a due date.", defaultOn: false },
            { name: "todo_list", label: "List to-dos", description: "See open (and completed) tasks.", defaultOn: false },
            { name: "todo_complete", label: "Complete to-do", description: "Mark a task done or reopen it.", defaultOn: false },
            { name: "todo_delete", label: "Delete to-do", description: "Remove a task.", defaultOn: false },
        ],
    },
    {
        key: "bookmarks",
        title: "Bookmarks",
        description: "Let an agent save and recall links (web pages + YouTube videos).",
        tools: [
            { name: "bookmark_save", label: "Save bookmark", description: "Bookmark a link (YouTube auto-detected).", defaultOn: false },
            { name: "bookmark_list", label: "List bookmarks", description: "See saved bookmarks.", defaultOn: false },
            { name: "bookmark_search", label: "Search bookmarks", description: "Find bookmarks by keyword.", defaultOn: false },
            { name: "bookmark_delete", label: "Delete bookmark", description: "Remove a bookmark.", defaultOn: false },
        ],
    },
    {
        key: "expenses",
        title: "Expenses",
        description: "Let an agent record and total expenses.",
        tools: [
            { name: "expense_add", label: "Add expense", description: "Record an expense.", defaultOn: false },
            { name: "expense_list", label: "List expenses", description: "List expenses with a total.", defaultOn: false },
            { name: "expense_search", label: "Search expenses", description: "Find expenses by vendor/category.", defaultOn: false },
            { name: "expense_delete", label: "Delete expense", description: "Remove an expense.", defaultOn: false },
        ],
    },
    {
        key: "tasks",
        title: "Tasks & Projects",
        description: "Let an agent track jobs as tasks so you can see pending work.",
        tools: [
            { name: "task_create", label: "Create task", description: "Open a task to track a job.", defaultOn: false },
            { name: "task_update", label: "Update task", description: "Change a task's status or details.", defaultOn: false },
            { name: "task_list", label: "List tasks", description: "See pending/in-progress work.", defaultOn: false },
            { name: "task_complete", label: "Complete task", description: "Mark a task done.", defaultOn: false },
            { name: "task_delete", label: "Delete task", description: "Remove a task.", defaultOn: false },
        ],
    },
    {
        key: "notifications",
        title: "Notifications",
        description: "Let an agent post to your in-app inbox (the bell) so it can reach you proactively.",
        tools: [
            { name: "notify", label: "Notify owner", description: "Post a notification to the owner's in-app inbox.", defaultOn: false },
        ],
    },
    {
        key: "followups",
        title: "Follow-ups",
        description: "Let an agent remember what it's waiting on (e.g. a reply to a quotation) and chase it.",
        tools: [
            { name: "commitment_create", label: "Add follow-up", description: "Record something to follow up on, with a due date.", defaultOn: false },
            { name: "commitment_list", label: "List follow-ups", description: "See open follow-ups / things it's waiting on.", defaultOn: false },
            { name: "commitment_complete", label: "Close follow-up", description: "Mark a follow-up resolved or dismiss it.", defaultOn: false },
        ],
    },
    {
        key: "web",
        title: "Web Search",
        description: "Let an agent search the live web and read pages. Configure the backend (self-hosted or paid) in Settings → Web Search.",
        tools: [
            { name: "web_search", label: "Web search", description: "Search the web for current information (events, prices, suppliers, regulations).", defaultOn: false },
            { name: "web_fetch", label: "Read a page", description: "Fetch a specific URL and return its main content as clean text.", defaultOn: false },
        ],
    },
    {
        key: "documents",
        title: "Documents",
        description: "Let an agent find and read files in your document locker (contracts, quotes, receipts).",
        tools: [
            { name: "document_list", label: "List documents", description: "See files in the locker.", defaultOn: false },
            { name: "document_search", label: "Search documents", description: "Find files by name or content.", defaultOn: false },
            { name: "document_read", label: "Read document", description: "Read a document's text.", defaultOn: false },
            { name: "document_delete", label: "Delete document", description: "Remove a document.", defaultOn: false },
        ],
    },
    {
        key: "pdf",
        title: "PDF tools",
        description: "Let an agent read PDFs and fill fillable PDF forms.",
        tools: [
            { name: "pdf_read", label: "Read PDF", description: "Extract the text of a PDF in the locker.", defaultOn: false },
            { name: "pdf_form_fields", label: "Inspect PDF form", description: "List a fillable PDF's form fields.", defaultOn: false },
            { name: "pdf_fill_form", label: "Fill PDF form", description: "Fill a PDF form and save the completed file.", defaultOn: false },
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
            { name: "credential_set", label: "Set credential", description: "Let the agent store/update a tenant credential or API key to connect an integration (encrypted). Off by default.", defaultOn: false },
            { name: "bash_sandbox", label: "Run code (sandbox)", description: "Run code in a throwaway, network-isolated container. Safer than shell exec — nothing it does touches the host.", defaultOn: false },
        ],
    },
    {
        key: "servers",
        title: "Servers (SSH)",
        description:
            "Let an agent inspect and operate the servers in Servers. These tools only work on servers you have added, enabled, AND explicitly granted to that agent — this switch just makes the tools visible to the workspace at all.",
        tools: [
            { name: "server_list", label: "List servers", description: "See which servers this agent has been granted, and their safety mode.", defaultOn: false },
            { name: "server_exec", label: "Run server command", description: "Run a command over SSH on a granted server. Still bound by that server's safety mode (observe/safe/full) and approval settings.", defaultOn: false },
        ],
    },
];

/** Flat list of every catalog tool. */
export const ALL_CATALOG_TOOLS: ToolCatalogEntry[] = TOOL_CATALOG.flatMap((g) => g.tools);

/** Tool names enabled by default for a brand-new workspace. */
export const DEFAULT_ENABLED_TOOLS: string[] = ALL_CATALOG_TOOLS.filter((t) => t.defaultOn).map((t) => t.name);

/** Valid catalog tool names (for validating UI input). */
export const CATALOG_TOOL_NAMES = new Set(ALL_CATALOG_TOOLS.map((t) => t.name));
