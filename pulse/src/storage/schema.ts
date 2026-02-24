import {
    pgTable,
    uuid,
    varchar,
    jsonb,
    timestamp,
    text,
    decimal,
    boolean,
    index,
    unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

// -- Channel connections per tenant --
export const channelConnections = pgTable("channel_connections", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
        .references(() => tenants.id)
        .notNull(),
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
            .references(() => tenants.id)
            .notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
