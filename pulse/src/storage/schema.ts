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
    anthropicApiKeyHash: varchar("anthropic_api_key_hash", { length: 255 }),
    openaiApiKeyHash: varchar("openai_api_key_hash", { length: 255 }),
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
    systemPrompt: text("system_prompt"), // The specific instructions injected to the LLM
    modelId: varchar("model_id", { length: 100 }).default("claude-sonnet-4-20250514"),
    workspacePath: varchar("workspace_path", { length: 512 }),
    dockerSandboxEnabled: boolean("docker_sandbox_enabled").default(false), // WARNING: Grants raw bash execution
    selfConfigEnabled: boolean("self_config_enabled").notNull().default(false), // Allow agent to edit its own workspace files
    heartbeatConfig: jsonb("heartbeat_config").notNull().default({}), // Heartbeat scheduling config
    sandboxConfig: jsonb("sandbox_config").notNull().default({}), // Enhanced sandbox settings
    toolPolicy: jsonb("tool_policy").notNull().default({}), // Tool allow/deny lists
    delegationConfig: jsonb("delegation_config").notNull().default({}), // Multi-agent delegation settings
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
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [
        index("idx_messages_conversation").on(table.conversationId, table.createdAt),
        index("idx_messages_tenant").on(table.tenantId, table.createdAt),
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
        costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).default("0"),
        creditsUsed: decimal("credits_used", { precision: 12, scale: 4 }).default("0"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => [index("idx_usage_tenant").on(table.tenantId, table.createdAt)]
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
    role: varchar("role", { length: 20 }).notNull().default("TENANT"), // 'ADMIN', 'TENANT'
    tenantId: uuid("tenant_id").references(() => tenants.id), // Nullable for global admins
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    onboardingComplete: boolean("onboarding_complete").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

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
        embedding: text("embedding"), // Stored as text, cast to vector in queries
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
