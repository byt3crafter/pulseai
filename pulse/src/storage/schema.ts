import {
    pgTable,
    uuid,
    varchar,
    jsonb,
    timestamp,
    text,
    decimal,
    boolean,
    integer,
    index,
    unique,
    AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// -- Global Settings (Super Admin level) --
export const globalSettings = pgTable("global_settings", {
    id: varchar("id", { length: 50 }).primaryKey().default("root"), // Singleton pattern, always 'root'
    config: jsonb("config").notNull().default({}),
    anthropicApiKeyHash: text("anthropic_api_key_hash"),
    openaiApiKeyHash: text("openai_api_key_hash"),
    gatewayConfig: jsonb("gateway_config").notNull().default({}), // Hot-reloadable gateway configuration
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// -- Tenants (your clients) --
export const tenants = pgTable("tenants", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    config: jsonb("config").notNull().default({}),
    apiKeyHash: varchar("api_key_hash", { length: 255 }),
    status: varchar("status", { length: 20 }).default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// -- Agent Profiles (Distinct AI Characters/Employees) --
export const agentProfiles = pgTable("agent_profiles", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
        .references(() => tenants.id)
        .notNull(),
    name: varchar("name", { length: 255 }).notNull(), // e.g., "Sélina - COO"
    title: varchar("title", { length: 160 }), // Role/subtitle shown under the name, e.g. "Chief Financial Officer"
    roiHourlyRate: decimal("roi_hourly_rate", { precision: 10, scale: 2 }), // ROI: hourly value of the human this agent replaces (tenant-set, nullable)
    avatar: text("avatar"), // Profile picture: data URL (data:image/...;base64,...) or an https URL
    systemPrompt: text("system_prompt"), // The specific instructions injected to the LLM
    modelId: varchar("model_id", { length: 100 }).default("claude-sonnet-4-20250514"),
    reasoningEffort: varchar("reasoning_effort", { length: 12 }), // "minimal"|"low"|"medium"|"high"|"xhigh"; null/absent = provider default
    progressVerbosity: varchar("progress_verbosity", { length: 12 }), // "off"|"progress"|"verbose"; null/absent = "progress"
    workspacePath: varchar("workspace_path", { length: 512 }),
    dockerSandboxEnabled: boolean("docker_sandbox_enabled").default(false), // WARNING: Grants raw bash execution
    selfConfigEnabled: boolean("self_config_enabled").notNull().default(false), // Allow agent to edit its own workspace files
    enabled: boolean("enabled").notNull().default(true), // Disabled agents don't respond or route
    heartbeatConfig: jsonb("heartbeat_config").notNull().default({}), // Heartbeat scheduling config
    sandboxConfig: jsonb("sandbox_config").notNull().default({}), // Enhanced sandbox settings
    toolPolicy: jsonb("tool_policy").notNull().default({}), // Tool allow/deny lists
    delegationConfig: jsonb("delegation_config").notNull().default({}), // Multi-agent delegation settings
    skillConfig: jsonb("skill_config").notNull().default({}), // Per-agent skill overrides
    emailConfig: jsonb("email_config").notNull().default({}), // Per-agent email configuration
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    index("idx_agent_profiles_tenant").on(table.tenantId)
]);

// -- MCP Servers (External integrations like ERPNext) --
export const mcpServers = pgTable("mcp_servers", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
        .references(() => tenants.id)
        .notNull(),
    name: varchar("name", { length: 255 }).notNull(), // e.g., "ERPNext Production"
    url: varchar("url", { length: 1024 }).notNull(),
    authHeaders: jsonb("auth_headers").default({}), // Encrypted at app layer if needed
    status: varchar("status", { length: 20 }).default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    index("idx_mcp_servers_tenant").on(table.tenantId)
]);

// -- Bindings: Which Agent can use which MCP Server --
export const agentProfileMcpBindings = pgTable("agent_profile_mcp_bindings", {
    id: uuid("id").primaryKey().defaultRandom(),
    agentProfileId: uuid("agent_profile_id")
        .references(() => agentProfiles.id, { onDelete: 'cascade' })
        .notNull(),
    mcpServerId: uuid("mcp_server_id")
        .references(() => mcpServers.id, { onDelete: 'cascade' })
        .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    unique("idx_unique_agent_mcp").on(table.agentProfileId, table.mcpServerId)
]);

// -- Channel connections per tenant --
export const channelConnections = pgTable("channel_connections", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
        .references(() => tenants.id)
        .notNull(),
    agentProfileId: uuid("agent_profile_id").references(() => agentProfiles.id), // The specific bot persona
    channelType: varchar("channel_type", { length: 50 }).notNull(), // 'telegram', 'whatsapp', 'webchat'
    channelConfig: jsonb("channel_config").notNull().default({}),
    status: varchar("status", { length: 20 }).default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// -- Conversations (a thread between a contact and the assistant) --
export const conversations = pgTable(
    "conversations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        channelType: varchar("channel_type", { length: 50 }).notNull(),
        channelContactId: varchar("channel_contact_id", { length: 255 }).notNull(),
        contactName: varchar("contact_name", { length: 255 }),
        metadata: jsonb("metadata").default({}),
        status: varchar("status", { length: 20 }).default("active"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        unique("idx_unique_conversation").on(
            table.tenantId,
            table.channelType,
            table.channelContactId
        ),
        index("idx_conversations_tenant").on(table.tenantId, table.updatedAt),
    ]
);

// -- Messages (replaces OpenClaw's local jsonl files) --
export const messages = pgTable(
    "messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        conversationId: uuid("conversation_id")
            .references(() => conversations.id)
            .notNull(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        role: varchar("role", { length: 20 }).notNull(), // 'user', 'assistant', 'system', 'tool'
        content: text("content").notNull(),
        metadata: jsonb("metadata").default({}),
        // metadata will store things like: { tokens_used, model, tool_calls, channel_message_id }
        // -- Channel/org fields (nullable = legacy 1:1 DM message, still works) --
        channelId: uuid("channel_id").references(() => channels.id), // which channel/department this was posted in
        senderType: varchar("sender_type", { length: 10 }), // 'human' | 'agent' in a shared thread
        senderUserId: uuid("sender_user_id").references(() => users.id), // which human spoke
        senderAgentId: uuid("sender_agent_id").references(() => agentProfiles.id), // which agent spoke
        mentions: jsonb("mentions").default([]), // agent ids @mentioned in this message
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_messages_conversation").on(table.conversationId, table.createdAt),
        index("idx_messages_tenant").on(table.tenantId, table.createdAt),
        index("idx_messages_channel").on(table.channelId, table.createdAt),
    ]
);

// -- Channels: the org tree. Company (= tenant) → Department → Group/Topic. --
// Channels carry NAME + DESCRIPTION only; the "soul" (persona/prompt) lives on agents.
export const channels = pgTable(
    "channels",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(), // = the company
        kind: varchar("kind", { length: 20 }).notNull().default("department"), // 'department' | 'group'
        parentId: uuid("parent_id").references((): AnyPgColumn => channels.id), // a group's parent = its department
        name: varchar("name", { length: 255 }).notNull(),
        description: text("description"),
        mode: varchar("mode", { length: 20 }).notNull().default("single_human"), // 'single_human' | 'multi_human'
        leadAgentId: uuid("lead_agent_id").references(() => agentProfiles.id), // the manager that answers + routes
        settings: jsonb("settings").notNull().default({}),
        status: varchar("status", { length: 20 }).notNull().default("active"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_channels_tenant").on(table.tenantId),
        index("idx_channels_parent").on(table.parentId),
        unique("idx_unique_channel_name").on(table.tenantId, table.parentId, table.name),
    ]
);

// -- Which agents belong to a channel, and their rank --
export const channelAgents = pgTable(
    "channel_agents",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        channelId: uuid("channel_id")
            .references(() => channels.id, { onDelete: "cascade" })
            .notNull(),
        agentProfileId: uuid("agent_profile_id")
            .references(() => agentProfiles.id, { onDelete: "cascade" })
            .notNull(),
        role: varchar("role", { length: 20 }).notNull().default("member"), // 'lead' | 'member'
        level: integer("level").notNull().default(0), // seniority; higher = more senior
        respondsWhen: varchar("responds_when", { length: 20 }).notNull().default("mentioned"), // 'mentioned' | 'lead'
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_channel_agents_channel").on(table.channelId),
        unique("idx_unique_channel_agent").on(table.channelId, table.agentProfileId),
    ]
);

// -- Which humans belong to a channel + their access (talk vs read-only observe) --
export const channelMembers = pgTable(
    "channel_members",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        channelId: uuid("channel_id")
            .references(() => channels.id, { onDelete: "cascade" })
            .notNull(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        role: varchar("role", { length: 20 }).notNull().default("member"), // 'operator' | 'member'
        access: varchar("access", { length: 20 }).notNull().default("talk"), // 'talk' | 'observe' (read-only)
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_channel_members_channel").on(table.channelId),
        unique("idx_unique_channel_member").on(table.channelId, table.userId),
    ]
);

// -- Per-user agent assignment inside a channel. --
// No rows for a user = they may talk to ALL channel agents (default).
// Any rows = that user is restricted to just those agents ("own agent assigned").
export const channelMemberAgents = pgTable(
    "channel_member_agents",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        channelId: uuid("channel_id")
            .references(() => channels.id, { onDelete: "cascade" })
            .notNull(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        agentProfileId: uuid("agent_profile_id")
            .references(() => agentProfiles.id, { onDelete: "cascade" })
            .notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_channel_member_agents_lookup").on(table.channelId, table.userId),
        unique("idx_unique_channel_member_agent").on(table.channelId, table.userId, table.agentProfileId),
    ]
);

// -- Custom Tools: per-tenant HTTP tools that connect a customer's own API/software. --
// Each row becomes an agent tool at runtime. Secrets (auth headers) are encrypted at rest.
export const customTools = pgTable(
    "custom_tools",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        name: varchar("name", { length: 64 }).notNull(), // tool name exposed to the LLM (snake_case)
        description: text("description").notNull(),       // what it does — the LLM reads this
        method: varchar("method", { length: 8 }).notNull().default("GET"),
        urlTemplate: text("url_template").notNull(),      // supports {param} placeholders
        headersEnc: text("headers_enc"),                  // encrypted JSON of static/auth headers
        bodyTemplate: text("body_template"),              // optional; supports {param} placeholders
        paramSchema: jsonb("param_schema").notNull().default({}), // { properties, required }
        allowedAgentIds: jsonb("allowed_agent_ids").notNull().default([]), // [] = all agents; else scoped
        timeoutMs: integer("timeout_ms").notNull().default(15000),
        enabled: boolean("enabled").notNull().default(true),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_custom_tools_tenant").on(table.tenantId),
        unique("idx_unique_custom_tool_name").on(table.tenantId, table.name),
    ]
);

// -- Server Inventory: per-tenant VPS/servers registered for agent SSH access. --
// Safety is enforced in code (pulse/src/servers/command-policy.ts) based on
// `safetyMode`. Access is default-deny: an empty `allowedAgentIds` means NO
// agent may use the server — unlike custom tools, this is infra access and
// requires explicit per-agent assignment.
export const servers = pgTable(
    "servers",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        name: varchar("name", { length: 120 }).notNull(),
        host: varchar("host", { length: 255 }).notNull(),
        port: integer("port").notNull().default(22),
        username: varchar("username", { length: 120 }).notNull(),
        authType: varchar("auth_type", { length: 10 }).notNull().default("key"), // 'key' | 'password'
        encryptedSecret: text("encrypted_secret").notNull(), // AES-256-GCM: private key or password
        environment: varchar("environment", { length: 12 }).notNull().default("dev"), // 'production' | 'staging' | 'dev'
        safetyMode: varchar("safety_mode", { length: 10 }).notNull().default("observe"), // 'observe' | 'safe' | 'full'
        instructions: text("instructions"), // operator guidance shown to the agent verbatim
        allowedAgentIds: jsonb("allowed_agent_ids").notNull().default([]), // [] = no agent access (default-deny)
        approvalMode: varchar("approval_mode", { length: 10 }).notNull().default("off"), // 'off' | 'writes' | 'all' — gates server_exec via pending_approvals
        enabled: boolean("enabled").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [index("idx_servers_tenant").on(table.tenantId)]
);

// -- Server exec logs: every server_exec attempt (blocked or not), for audit. --
export const serverExecLogs = pgTable(
    "server_exec_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        serverId: uuid("server_id").references(() => servers.id).notNull(),
        agentId: uuid("agent_id").references(() => agentProfiles.id),
        command: text("command").notNull(),
        blocked: boolean("blocked").notNull().default(false),
        blockReason: text("block_reason"),
        exitCode: integer("exit_code"),
        durationMs: integer("duration_ms"),
        outputHead: text("output_head"), // first 500 chars of stdout+stderr
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_server_exec_logs_tenant").on(table.tenantId, table.createdAt),
        index("idx_server_exec_logs_server").on(table.serverId, table.createdAt),
    ]
);

// -- Usage tracking (Billing and credits) --
export const usageRecords = pgTable(
    "usage_records",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        conversationId: uuid("conversation_id").references(() => conversations.id),
        model: varchar("model", { length: 100 }).notNull(),
        inputTokens: decimal("input_tokens").default("0"),
        outputTokens: decimal("output_tokens").default("0"),
        costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).default("0"), // Customer-facing cost
        baseCostUsd: decimal("base_cost_usd", { precision: 10, scale: 6 }).default("0"), // Real provider cost
        creditsUsed: decimal("credits_used", { precision: 12, scale: 4 }).default("0"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [index("idx_usage_tenant").on(table.tenantId, table.createdAt)]
);

// -- Agent Runs (operational task record — the "keystone" for the workforce OS) --
// One row per top-level agent invocation (a chat turn, a cron job, a heartbeat,
// a delegated sub-task). Distinct from usage_records (billing ledger): this is
// the OPERATIONS view that powers the executive dashboard, task queue, replay,
// analytics, and the live fields on employee profiles. It snapshots its own
// token/cost figures so the ops layer never has to join into billing.
export const agentRuns = pgTable(
    "agent_runs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        agentProfileId: uuid("agent_profile_id").references(() => agentProfiles.id),
        // How this run was triggered: chat | api | cron | heartbeat | commitment
        // | standing_order | delegation | approval | channel
        trigger: varchar("trigger", { length: 32 }).notNull().default("chat"),
        // Free-form reference to the triggering entity (conversationId, jobId, …).
        triggerRef: varchar("trigger_ref", { length: 128 }),
        // Delegation/collaboration chain: the run that spawned this one.
        parentRunId: uuid("parent_run_id"),
        // queued | running | waiting | blocked | retrying | completed | failed | cancelled
        status: varchar("status", { length: 16 }).notNull().default("running"),
        // Short human summary of what the run did ("Reconciling supplier invoices").
        title: text("title"),
        model: varchar("model", { length: 100 }),
        inputTokens: integer("input_tokens").notNull().default(0),
        outputTokens: integer("output_tokens").notNull().default(0),
        // Snapshot of the customer-facing cost for this run (USD).
        costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
        toolCallCount: integer("tool_call_count").notNull().default(0),
        // Compact, capped trace of tool calls for the replay timeline:
        // [{ name, ok, ms }]. Full event table is a later phase.
        toolCalls: jsonb("tool_calls").notNull().default([]),
        error: text("error"),
        channelType: varchar("channel_type", { length: 50 }),
        channelContactId: varchar("channel_contact_id", { length: 255 }),
        conversationId: uuid("conversation_id"),
        startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
        endedAt: timestamp("ended_at", { withTimezone: true }),
        durationMs: integer("duration_ms"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_agent_runs_tenant").on(table.tenantId, table.startedAt),
        index("idx_agent_runs_agent").on(table.agentProfileId, table.startedAt),
        index("idx_agent_runs_status").on(table.tenantId, table.status),
        index("idx_agent_runs_parent").on(table.parentRunId),
    ]
);

// -- Contact allowlists (Security layer) --
export const allowlists = pgTable(
    "allowlists",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        channelType: varchar("channel_type", { length: 50 }).notNull(),
        contactId: varchar("contact_id", { length: 255 }).notNull(),
        contactName: varchar("contact_name", { length: 255 }),
        contactType: varchar("contact_type", { length: 20 }).default("user"), // 'user' or 'group'
        status: varchar("status", { length: 20 }).default("approved"), // 'approved', 'pending', 'blocked'
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        unique("idx_unique_allowlist").on(
            table.tenantId,
            table.channelType,
            table.contactId
        ),
    ]
);

// -- People (account-wide, Telegram-ID-based access control) --
// One row per human the tenant has ever heard from on any channel (currently
// Telegram). Scope is account-wide — applies to all groups/DMs, not per-channel.
// `access` gates whether agents respond to this person at all; `allowedAgentIds`
// (when non-empty) further restricts which agents they may address.
// `isApprover` / `approvalMode` are enforced by the approval workflow — see
// pulse/src/channels/approval-service.ts.
export const people = pgTable(
    "people",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        telegramUserId: varchar("telegram_user_id", { length: 32 }).notNull(),
        displayName: varchar("display_name", { length: 255 }),
        username: varchar("username", { length: 255 }),
        access: varchar("access", { length: 12 }).notNull().default("observe"), // 'talk' | 'observe' | 'blocked'
        isApprover: boolean("is_approver").notNull().default(false), // can approve pending_approvals via Telegram inline buttons
        approvalMode: varchar("approval_mode", { length: 20 }).notNull().default("auto"), // 'auto' | 'requires_approval' — gates this person's messages via pending_approvals
        allowedAgentIds: jsonb("allowed_agent_ids").notNull().default([]), // [] = may address ALL agents; else subset of agent_profiles.id
        lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        unique("idx_unique_people_tenant_telegram").on(table.tenantId, table.telegramUserId),
        index("idx_people_tenant").on(table.tenantId),
    ]
);

// -- Pending approvals (Telegram inline-button approval workflow) --
// One row per gated action awaiting a designated approver's decision:
//   'user_request' — a message from a person whose approval_mode requires it.
//   'command'      — a server_exec command on a server whose approval_mode requires it.
// Every approver gets a DM card with Allow/Deny/Allow-all buttons; `approvalMessageIds`
// tracks which Telegram message id was sent to which approver so all cards can be
// edited to a final state once someone decides. See ../channels/approval-service.ts.
export const pendingApprovals = pgTable(
    "pending_approvals",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        kind: varchar("kind", { length: 20 }).notNull(), // 'user_request' | 'command'
        status: varchar("status", { length: 12 }).notNull().default("pending"), // 'pending' | 'approved' | 'denied' | 'expired'
        requesterTelegramId: varchar("requester_telegram_id", { length: 32 }),
        agentProfileId: uuid("agent_profile_id").references(() => agentProfiles.id),
        serverId: uuid("server_id").references(() => servers.id),
        summary: text("summary").notNull(),
        payload: jsonb("payload").notNull().default({}), // enough to resume, e.g. { command, serverName }
        channelType: varchar("channel_type", { length: 20 }),
        channelContactId: varchar("channel_contact_id", { length: 255 }),
        approvalMessageIds: jsonb("approval_message_ids").notNull().default({}), // { approverTelegramId: messageId }
        decidedBy: varchar("decided_by", { length: 32 }),
        decidedAt: timestamp("decided_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        expiresAt: timestamp("expires_at", { withTimezone: true }),
    },
    (table) => [index("idx_pending_approvals_tenant_status").on(table.tenantId, table.status)]
);

// -- Approval allowances (persistent, revocable "Allow always" standing grants) --
// Replaces the old 30-minute in-memory session bypass. When an approver taps
// "Allow always" on a pending_approvals card, a row is inserted here and every
// future gated request matching (tenantId, kind, subject) is auto-approved —
// no prompt — until an admin revokes it from the dashboard. See
// ../channels/approval-service.ts (hasStandingAllowance/grantAllowance/revokeAllowance).
export const approvalAllowances = pgTable(
    "approval_allowances",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        kind: varchar("kind", { length: 10 }).notNull(), // 'user' | 'server'
        subject: varchar("subject", { length: 64 }).notNull(), // telegram user id (kind='user') or server uuid (kind='server')
        label: varchar("label", { length: 255 }), // human-readable — person name or server name, for the dashboard
        createdBy: varchar("created_by", { length: 32 }), // approver telegram id who granted it
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        revokedAt: timestamp("revoked_at", { withTimezone: true }),
    },
    (table) => [index("idx_approval_allowances_tenant_revoked").on(table.tenantId, table.revokedAt)]
);

// -- Skills/tools enabled per tenant --
export const tenantSkills = pgTable(
    "tenant_skills",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        skillName: varchar("skill_name", { length: 100 }).notNull(),
        config: jsonb("config").default({}),
        enabled: boolean("enabled").default(true),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [unique("idx_unique_tenant_skill").on(table.tenantId, table.skillName)]
);

// -- Tenant Balances (Credit System) --
export const tenantBalances = pgTable(
    "tenant_balances",
    {
        tenantId: uuid("tenant_id")
            .primaryKey()
            .references(() => tenants.id),
        balance: decimal("balance", { precision: 12, scale: 4 }).notNull().default("0"),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    }
);

// -- Ledger Transactions (Top-ups and deductions) --
export const ledgerTransactions = pgTable(
    "ledger_transactions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        amount: decimal("amount", { precision: 12, scale: 4 }).notNull(), // Positive for top-up, negative for usage
        type: varchar("type", { length: 50 }).notNull(), // 'top_up', 'usage'
        description: text("description"),
        referenceId: varchar("reference_id", { length: 255 }), // e.g., usage record id or stripe id
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [index("idx_ledger_tenant").on(table.tenantId, table.createdAt)]
);

// -- OAuth 2.0 Clients (For Third-Party CLI tools like Claude Code) --
export const oauthClients = pgTable(
    "oauth_clients",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id),
        name: varchar("name", { length: 255 }).notNull(), // e.g., "Claude Code CLI"
        clientId: varchar("client_id", { length: 255 }).notNull().unique(),
        clientSecretHash: varchar("client_secret_hash", { length: 255 }).notNull(),
        redirectUris: jsonb("redirect_uris").notNull().default([]), // Array of allowed redirect URIs
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [index("idx_oauth_client_tenant").on(table.tenantId)]
);

// -- OAuth 2.0 Authorization Codes --
export const oauthCodes = pgTable(
    "oauth_codes",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        code: varchar("code", { length: 255 }).notNull().unique(),
        clientId: varchar("client_id", { length: 255 }).notNull(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        redirectUri: varchar("redirect_uri", { length: 1024 }),
        codeChallenge: varchar("code_challenge", { length: 255 }),
        codeChallengeMethod: varchar("code_challenge_method", { length: 10 }),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [index("idx_oauth_code_client").on(table.clientId)]
);

// -- OAuth 2.0 Access Tokens --
export const oauthTokens = pgTable(
    "oauth_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accessToken: varchar("access_token", { length: 255 }).notNull().unique(),
        refreshToken: varchar("refresh_token", { length: 255 }).unique(),
        clientId: varchar("client_id", { length: 255 }).notNull(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [index("idx_oauth_token_tenant").on(table.tenantId)]
);

// -- Platform Users (NextAuth) --
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("TENANT"), // 'ADMIN', 'TENANT' — plane
    accessRole: varchar("access_role", { length: 20 }).notNull().default("owner"), // granular RBAC role within plane
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    twoFactorSecret: text("two_factor_secret"), // AES-encrypted TOTP secret
    twoFactorBackupCodes: jsonb("two_factor_backup_codes").notNull().default([]), // sha256 hashes of one-time recovery codes
    tenantId: uuid("tenant_id").references(() => tenants.id), // Nullable for global admins
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    onboardingComplete: boolean("onboarding_complete").notNull().default(true),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// -- Password Reset / Invite Tokens (email-based account flows) --
export const passwordResetTokens = pgTable(
    "password_reset_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull(), // sha256 of the raw token sent by email
        type: varchar("type", { length: 20 }).notNull().default("reset"), // 'reset' | 'invite'
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        usedAt: timestamp("used_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_password_reset_token_hash").on(table.tokenHash),
        index("idx_password_reset_user").on(table.userId),
    ]
);

// -- Platform Audit Log (enterprise "who did what, when" trail) --
export const auditLogs = pgTable(
    "audit_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id), // nullable: platform-level events
        actorId: uuid("actor_id").references(() => users.id), // nullable: system / unauthenticated
        actorEmail: varchar("actor_email", { length: 255 }),
        actorRole: varchar("actor_role", { length: 20 }),
        action: varchar("action", { length: 100 }).notNull(), // e.g. "tenant.create", "user.delete"
        targetType: varchar("target_type", { length: 50 }), // "tenant" | "user" | "settings" | ...
        targetId: varchar("target_id", { length: 255 }),
        summary: text("summary"), // human-readable one-liner
        metadata: jsonb("metadata").notNull().default({}),
        ip: varchar("ip", { length: 64 }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_audit_created").on(table.createdAt),
        index("idx_audit_actor").on(table.actorId),
        index("idx_audit_action").on(table.action),
        index("idx_audit_tenant").on(table.tenantId),
    ]
);

// -- Workspace Revisions (Agent file-based workspace revision tracking) --
export const workspaceRevisions = pgTable(
    "workspace_revisions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        agentProfileId: uuid("agent_profile_id")
            .references(() => agentProfiles.id, { onDelete: "cascade" })
            .notNull(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        fileName: varchar("file_name", { length: 255 }).notNull(),
        content: text("content").notNull(),
        changeSummary: varchar("change_summary", { length: 500 }),
        changedBy: uuid("changed_by").references(() => users.id),
        revisionNumber: integer("revision_number").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_workspace_revisions_agent_file").on(
            table.agentProfileId,
            table.fileName,
            table.revisionNumber
        ),
    ]
);

// -- Pairing Codes (DM approval flow) --
export const pairingCodes = pgTable(
    "pairing_codes",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        channelType: varchar("channel_type", { length: 50 }).notNull(),
        contactId: varchar("contact_id", { length: 255 }).notNull(),
        contactName: varchar("contact_name", { length: 255 }),
        code: varchar("code", { length: 8 }).notNull(),
        status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'approved', 'rejected'
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_pairing_code").on(table.code),
        index("idx_pairing_tenant").on(table.tenantId, table.status),
    ]
);

// -- API Tokens (for OpenAI-compatible HTTP API) --
export const apiTokens = pgTable(
    "api_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id, { onDelete: "cascade" })
            .notNull(),
        tokenHash: text("token_hash").notNull(),
        name: text("name").notNull().default("API Token"),
        scopes: text("scopes").array().default(["chat", "responses"]),
        expiresAt: timestamp("expires_at", { withTimezone: true }),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_api_tokens_hash").on(table.tokenHash),
        index("idx_api_tokens_tenant").on(table.tenantId),
    ]
);

// -- Scheduled Jobs (Phase 14 - Cron / Scheduled Jobs) --
export const scheduledJobs = pgTable(
    "scheduled_jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        agentId: uuid("agent_id")
            .references(() => agentProfiles.id)
            .notNull(),
        name: varchar("name", { length: 255 }).notNull(),
        scheduleType: varchar("schedule_type", { length: 10 }).notNull(), // 'cron', 'interval', 'once'
        cronExpression: varchar("cron_expression", { length: 100 }),
        intervalSeconds: integer("interval_seconds"),
        runAt: timestamp("run_at", { withTimezone: true }),
        message: text("message").notNull(),
        timezone: varchar("timezone", { length: 50 }).default("UTC"),
        enabled: boolean("enabled").default(true),
        maxRetries: integer("max_retries").default(3),
        lastRunAt: timestamp("last_run_at", { withTimezone: true }),
        nextRunAt: timestamp("next_run_at", { withTimezone: true }),
        webhookToken: varchar("webhook_token", { length: 64 }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_jobs_next_run").on(table.nextRunAt),
        index("idx_jobs_tenant").on(table.tenantId),
    ]
);

// Commitments: agent follow-up check-ins. Delivery when due is governed by a
// per-tenant setting (tenants.config.commitments.deliveryMode).
export const commitments = pgTable(
    "commitments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        agentId: uuid("agent_id").references(() => agentProfiles.id),
        conversationId: uuid("conversation_id"),
        channelType: varchar("channel_type", { length: 30 }),
        channelContactId: varchar("channel_contact_id", { length: 255 }),
        summary: text("summary").notNull(),
        dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
        status: varchar("status", { length: 20 }).notNull().default("pending"), // pending|delivered|done|dismissed|expired
        deliveredAt: timestamp("delivered_at", { withTimezone: true }),
        metadata: jsonb("metadata").notNull().default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_commitments_due").on(table.status, table.dueAt),
        index("idx_commitments_tenant").on(table.tenantId),
    ]
);

// Standing Orders: per-agent "operating programs" (scope/trigger/steps/approval/
// escalation/boundaries), injected into the agent's system prompt so it runs the
// routine autonomously and escalates exceptions. All fields are user-authored.
export const standingOrders = pgTable(
    "standing_orders",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        agentId: uuid("agent_id").references(() => agentProfiles.id, { onDelete: "cascade" }).notNull(),
        name: varchar("name", { length: 255 }).notNull(),
        enabled: boolean("enabled").notNull().default(true),
        scope: text("scope"),
        trigger: text("trigger_text"),
        steps: text("steps"),
        approvalGates: text("approval_gates"),
        escalation: text("escalation"),
        boundaries: text("boundaries"),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_standing_orders_agent").on(table.agentId),
        index("idx_standing_orders_tenant").on(table.tenantId),
    ]
);

export const jobRuns = pgTable(
    "job_runs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        jobId: uuid("job_id")
            .references(() => scheduledJobs.id, { onDelete: "cascade" })
            .notNull(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        status: varchar("status", { length: 20 }).notNull(), // 'running', 'completed', 'failed'
        startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
        completedAt: timestamp("completed_at", { withTimezone: true }),
        result: text("result"),
        error: text("error"),
        tokensUsed: integer("tokens_used").default(0),
    },
    (table) => [
        index("idx_job_runs_job").on(table.jobId, table.startedAt),
    ]
);

// -- Memory Entries (Phase 13 - Memory & Vector Search) --
export const memoryEntries = pgTable(
    "memory_entries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        agentId: uuid("agent_id")
            .references(() => agentProfiles.id)
            .notNull(),
        content: text("content").notNull(),
        embedding: text("embedding"), // DB type is pgvector vector(1536) (migration 0015); typed text for the driver — inserts cast with ::vector, reads return the text repr
        category: varchar("category", { length: 50 }).default("general"),
        importance: decimal("importance", { precision: 3, scale: 2 }).default("0.5"),
        metadata: jsonb("metadata").default({}),
        accessCount: integer("access_count").default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        accessedAt: timestamp("accessed_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_memory_agent").on(table.agentId, table.createdAt),
    ]
);

// -- Agent Scripts (Phase 12 - Python Sandbox & Script Persistence) --
export const agentScripts = pgTable(
    "agent_scripts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        agentId: uuid("agent_id")
            .references(() => agentProfiles.id)
            .notNull(),
        filename: varchar("filename", { length: 255 }).notNull(),
        description: text("description"),
        language: varchar("language", { length: 20 }).default("python"),
        code: text("code").notNull(),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
        useCount: integer("use_count").default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        unique("idx_unique_agent_script").on(table.agentId, table.filename),
        index("idx_scripts_agent").on(table.agentId),
    ]
);

// -- Credentials Vault (Phase 11 - Credential Vault) --
export const credentials = pgTable(
    "credentials",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        agentId: uuid("agent_id").references(() => agentProfiles.id), // NULL = available to all agents
        name: varchar("name", { length: 100 }).notNull(), // e.g., "ERPNEXT_API_KEY"
        description: text("description"),
        credentialType: varchar("credential_type", { length: 20 }).default("api_key"), // 'api_key', 'oauth2', 'basic', 'bearer'
        encryptedValue: text("encrypted_value").notNull(), // AES-256-GCM encrypted
        oauthClientId: text("oauth_client_id"),
        oauthEncryptedRefreshToken: text("oauth_encrypted_refresh_token"),
        oauthTokenUrl: text("oauth_token_url"),
        oauthScopes: text("oauth_scopes"),
        oauthExpiresAt: timestamp("oauth_expires_at", { withTimezone: true }),
        metadata: jsonb("metadata").default({}), // e.g., { baseUrl: "https://erp.company.com" }
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        unique("idx_unique_credential").on(table.tenantId, table.name),
        index("idx_credentials_tenant").on(table.tenantId),
    ]
);

// -- Contacts (native mini-CRM store; the agent uses this when the tenant's
//    contacts source is "native", or ERPNext/Google when configured). --
export const contacts = pgTable(
    "contacts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        name: text("name").notNull(),
        email: varchar("email", { length: 320 }),
        phone: varchar("phone", { length: 64 }),
        company: text("company"),
        title: text("title"),
        notes: text("notes"),
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_contacts_tenant").on(table.tenantId),
        index("idx_contacts_tenant_name").on(table.tenantId, table.name),
    ]
);

// -- Calendar events (native user calendar; Google Calendar backend later). --
export const events = pgTable(
    "events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        title: text("title").notNull(),
        startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
        endsAt: timestamp("ends_at", { withTimezone: true }),
        allDay: boolean("all_day").default(false),
        location: text("location"),
        notes: text("notes"),
        attendees: text("attendees"), // comma-separated names/emails
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_events_tenant").on(table.tenantId),
        index("idx_events_tenant_start").on(table.tenantId, table.startsAt),
    ]
);

// -- Site logins (password vault). Passwords are AES-256-GCM encrypted and are
//    NEVER returned to the model — the runtime decrypts + fills them into the
//    browser directly. login use is approval-gated + optionally agent-scoped. --
export const siteLogins = pgTable(
    "site_logins",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        agentId: uuid("agent_id").references(() => agentProfiles.id), // NULL = any agent
        label: text("label").notNull(),          // "Runstate ERP admin"
        site: text("site"),                       // URL or domain the login is for
        username: text("username").notNull(),
        encryptedPassword: text("encrypted_password").notNull(), // AES-256-GCM
        notes: text("notes"),
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_site_logins_tenant").on(table.tenantId),
    ]
);

// ── Quick-capture suite: notes, todos, bookmarks. Simple per-tenant lists the
//    agent and the dashboard both read/write. ──

// -- Notepad: freeform notes the agent can jot and recall. --
export const notes = pgTable(
    "notes",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        title: text("title"),
        body: text("body").notNull(),
        pinned: boolean("pinned").default(false),
        tags: text("tags"), // comma-separated
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_notes_tenant").on(table.tenantId),
    ]
);

// -- To-dos: lightweight task list. --
export const todos = pgTable(
    "todos",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        text: text("text").notNull(),
        done: boolean("done").default(false),
        doneAt: timestamp("done_at", { withTimezone: true }),
        dueAt: timestamp("due_at", { withTimezone: true }),
        priority: varchar("priority", { length: 16 }).default("normal"), // low|normal|high
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_todos_tenant").on(table.tenantId),
        index("idx_todos_tenant_done").on(table.tenantId, table.done),
    ]
);

// -- Bookmarks: saved links (web + YouTube). `kind` is auto-detected from the URL. --
export const bookmarks = pgTable(
    "bookmarks",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        url: text("url").notNull(),
        title: text("title"),
        notes: text("notes"),
        kind: varchar("kind", { length: 16 }).default("web"), // web|youtube
        tags: text("tags"), // comma-separated
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_bookmarks_tenant").on(table.tenantId),
    ]
);

// -- Notifications: the in-app inbox. Agent-initiated (briefings, replies,
//    overdue chases) and system events land here per tenant; the dashboard bell
//    shows unread count + a feed. One record, deliverable to many channels. --
export const notifications = pgTable(
    "notifications",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        agentId: uuid("agent_id").references(() => agentProfiles.id), // who posted it (NULL = system)
        title: text("title").notNull(),
        body: text("body"),
        kind: varchar("kind", { length: 24 }).default("info"), // info|reply|overdue|briefing|approval|job|system
        priority: varchar("priority", { length: 12 }).default("normal"), // low|normal|high
        link: text("link"), // optional dashboard path to open
        read: boolean("read").default(false),
        readAt: timestamp("read_at", { withTimezone: true }),
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_notifications_tenant").on(table.tenantId),
        index("idx_notifications_tenant_read").on(table.tenantId, table.read),
    ]
);

// -- Expenses: simple expense/receipt ledger. receiptDocumentId links to a
//    stored document (Phase 2 file store); NULL until a receipt is attached. --
export const expenses = pgTable(
    "expenses",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
        currency: varchar("currency", { length: 8 }),
        vendor: text("vendor"),
        category: text("category"),
        description: text("description"),
        spentAt: timestamp("spent_at", { withTimezone: true }),
        receiptDocumentId: uuid("receipt_document_id"),
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_expenses_tenant").on(table.tenantId),
        index("idx_expenses_tenant_spent").on(table.tenantId, table.spentAt),
    ]
);

// -- Documents: the file store / document locker. Holds uploaded files
//    (contracts, quotes, receipts) and agent-generated files (filled PDF forms).
//    `content` is base64 of the raw bytes; `extractedText` powers search + read.
//    Shared by the locker, expense receipts, and pdf_fill_form output. --
export const documents = pgTable(
    "documents",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        filename: text("filename").notNull(),
        mimeType: varchar("mime_type", { length: 128 }),
        sizeBytes: integer("size_bytes"),
        content: text("content"),          // base64 of the raw file bytes
        extractedText: text("extracted_text"), // searchable/readable text (PDF/text)
        title: text("title"),
        notes: text("notes"),
        tags: text("tags"),
        source: varchar("source", { length: 16 }).default("upload"), // upload|receipt|generated
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_documents_tenant").on(table.tenantId),
    ]
);

// -- Tasks / projects: hybrid work tracker. Agents auto-log real jobs (source
//    'agent') and update status as they work; users add their own (source
//    'user'). A "project" is just a task with children (parentId). --
export const tasks = pgTable(
    "tasks",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
        title: text("title").notNull(),
        description: text("description"),
        status: varchar("status", { length: 16 }).default("todo"), // todo|doing|done|blocked
        priority: varchar("priority", { length: 16 }).default("normal"), // low|normal|high
        parentId: uuid("parent_id"), // self-ref (project → subtasks); no FK to avoid cascade friction
        agentId: uuid("agent_id").references(() => agentProfiles.id), // owning/creating agent
        source: varchar("source", { length: 16 }).default("user"), // agent|user
        conversationId: uuid("conversation_id"), // the job/chat that spawned it (no FK on purpose)
        dueAt: timestamp("due_at", { withTimezone: true }),
        doneAt: timestamp("done_at", { withTimezone: true }),
        metadata: jsonb("metadata").default({}),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_tasks_tenant").on(table.tenantId),
        index("idx_tasks_tenant_status").on(table.tenantId, table.status),
    ]
);

// -- Agent Delegations (Phase 15 - Multi-Agent Orchestration) --
export const agentDelegations = pgTable(
    "agent_delegations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        sourceAgentId: uuid("source_agent_id")
            .references(() => agentProfiles.id)
            .notNull(),
        targetAgentId: uuid("target_agent_id")
            .references(() => agentProfiles.id)
            .notNull(),
        conversationId: uuid("conversation_id").references(() => conversations.id),
        task: text("task").notNull(),
        result: text("result"),
        status: varchar("status", { length: 20 }).notNull(), // 'pending', 'running', 'completed', 'failed'
        tokensUsed: integer("tokens_used").default(0),
        startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
        completedAt: timestamp("completed_at", { withTimezone: true }),
    },
    (table) => [
        index("idx_delegations_source").on(table.sourceAgentId, table.startedAt),
        index("idx_delegations_tenant").on(table.tenantId, table.startedAt),
    ]
);

// -- Exec Audit Log (Phase 10 - Exec Safety) --
export const execAuditLog = pgTable(
    "exec_audit_log",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        agentId: uuid("agent_id").references(() => agentProfiles.id),
        conversationId: uuid("conversation_id").references(() => conversations.id),
        command: text("command").notNull(),
        decision: varchar("decision", { length: 20 }).notNull(), // 'allowed', 'denied', 'sandboxed'
        reason: text("reason"),
        executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_exec_audit_tenant").on(table.tenantId, table.executedAt),
    ]
);

// -- Exec Policy Rules (Phase 10 - Exec Safety) --
export const execPolicyRules = pgTable(
    "exec_policy_rules",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id").references(() => tenants.id), // NULL = global default
        agentId: uuid("agent_id").references(() => agentProfiles.id), // NULL = tenant-wide
        ruleType: varchar("rule_type", { length: 10 }).notNull(), // 'allow' or 'deny'
        pattern: text("pattern").notNull(), // glob or regex pattern
        description: text("description"),
        priority: integer("priority").default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_exec_policy_tenant").on(table.tenantId),
    ]
);

// -- Installed Plugins (Phase 16 - Plugin System) --
export const installedPlugins = pgTable(
    "installed_plugins",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: varchar("name", { length: 255 }).notNull().unique(),
        version: varchar("version", { length: 50 }),
        source: varchar("source", { length: 20 }).notNull(), // 'local', 'builtin'
        sourcePath: text("source_path"),
        config: jsonb("config").default({}),
        enabled: boolean("enabled").default(true),
        manifestHash: varchar("manifest_hash", { length: 64 }), // integrity hash of declared capabilities
        approvedHash: varchar("approved_hash", { length: 64 }), // hash an admin approved; must match to activate
        declaredPermissions: jsonb("declared_permissions").default({}),
        approvedBy: uuid("approved_by"),
        approvedAt: timestamp("approved_at", { withTimezone: true }),
        installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow(),
    }
);

export const tenantPluginConfigs = pgTable(
    "tenant_plugin_configs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        pluginId: uuid("plugin_id")
            .references(() => installedPlugins.id)
            .notNull(),
        enabled: boolean("enabled").default(true),
        config: jsonb("config").default({}),
    },
    (table) => [
        unique("idx_unique_tenant_plugin").on(table.tenantId, table.pluginId),
        index("idx_tenant_plugin_tenant").on(table.tenantId),
    ]
);

// -- Routing Rules (Multi-Agent Routing) --
export const routingRules = pgTable(
    "routing_rules",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id)
            .notNull(),
        agentProfileId: uuid("agent_profile_id")
            .references(() => agentProfiles.id)
            .notNull(),
        ruleType: varchar("rule_type", { length: 30 }).notNull(), // 'contact', 'group', 'keyword', 'channel_default'
        matchValue: varchar("match_value", { length: 500 }).notNull(),
        priority: integer("priority").notNull().default(100),
        enabled: boolean("enabled").notNull().default(true),
        description: varchar("description", { length: 255 }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_routing_rules_tenant").on(table.tenantId),
    ]
);

// -- Model Pricing (Dynamic, DB-driven pricing) --
export const modelPricing = pgTable(
    "model_pricing",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        provider: varchar("provider", { length: 50 }).notNull(),
        modelId: varchar("model_id", { length: 100 }).notNull(),
        displayName: varchar("display_name", { length: 255 }).notNull(),
        category: varchar("category", { length: 20 }).notNull().default("flagship"),
        baseInputPerMillion: decimal("base_input_per_million", { precision: 10, scale: 4 }).notNull().default("0"),
        baseOutputPerMillion: decimal("base_output_per_million", { precision: 10, scale: 4 }).notNull().default("0"),
        customerInputPerMillion: decimal("customer_input_per_million", { precision: 10, scale: 4 }).notNull().default("0"),
        customerOutputPerMillion: decimal("customer_output_per_million", { precision: 10, scale: 4 }).notNull().default("0"),
        maxTokens: integer("max_tokens").notNull().default(8192),
        isActive: boolean("is_active").notNull().default(true),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        unique("idx_unique_model_pricing").on(table.provider, table.modelId),
        index("idx_model_pricing_provider").on(table.provider),
        index("idx_model_pricing_active").on(table.isActive),
    ]
);

// -- Tenant Provider Keys (BYOK - encrypted at rest) --
export const tenantProviderKeys = pgTable(
    "tenant_provider_keys",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tenantId: uuid("tenant_id")
            .references(() => tenants.id, { onDelete: "cascade" })
            .notNull(),
        provider: varchar("provider", { length: 50 }).notNull(),
        authMethod: varchar("auth_method", { length: 20 }).notNull().default("api_key"),
        encryptedApiKey: text("encrypted_api_key"),
        oauthClientId: varchar("oauth_client_id", { length: 255 }),
        oauthClientSecretEnc: text("oauth_client_secret_enc"),
        oauthAccessTokenEnc: text("oauth_access_token_enc"),
        oauthRefreshTokenEnc: text("oauth_refresh_token_enc"),
        oauthTokenExpiresAt: timestamp("oauth_token_expires_at", { withTimezone: true }),
        keyAlias: varchar("key_alias", { length: 100 }),
        isActive: boolean("is_active").default(true),
        lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        unique("idx_unique_tenant_provider").on(table.tenantId, table.provider),
        index("idx_tenant_provider_keys_tenant").on(table.tenantId),
    ]
);
