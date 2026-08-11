export interface InboundMessage {
  id: string; // the internal ID for this normalized message
  tenantId: string; // Which business does this belong to
  agentProfileId?: string; // The specific virtual employee/persona handling this
  channelType: "telegram" | "whatsapp" | "webchat" | "api" | "heartbeat" | "webapp" | "channel";
  channelContactId: string;  // Telegram user ID (DM) or group chat ID (group)
  // How this invocation was triggered, for the operational run record. When a
  // background source (cron, heartbeat, commitment, delegation) creates the
  // inbound it sets this; otherwise the runtime derives it from the channel.
  trigger?: "chat" | "api" | "cron" | "heartbeat" | "commitment" | "standing_order" | "delegation" | "approval" | "channel";
  triggerRef?: string;   // Optional id of the triggering entity (jobId, parent run, …)
  parentRunId?: string;  // For delegated sub-tasks: the run that spawned this one
  // Org-channel context (Company→Dept→Group). When set, the message belongs to a
  // shared channel thread and agentProfileId is the pre-resolved responder (lead or @mentioned).
  channelId?: string;
  contactName?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  // Inbound files the agent can actually "see" (currently Telegram photos).
  // Paths are absolute, on-disk under WORKSPACE_BASE_DIR — safe to round-trip
  // through the BullMQ (Redis) JSON queue since only plain strings are stored.
  attachments?: Array<{ type: "image"; path: string; mime: string }>;
  replyToMessageId?: string;
  raw?: unknown;  // Original channel-specific payload for advanced needs
  receivedAt: Date | string;
  // Group chat fields
  isGroup?: boolean;
  senderUserId?: string;       // The actual user who sent the message in a group
  senderUsername?: string;      // @username of the sender
  groupTitle?: string;          // Title of the group chat
  wasMentioned?: boolean;       // Whether the bot was @mentioned
  isReplyToBot?: boolean;       // Whether this is a reply to a bot message
}

export interface OutboundMessage {
  conversationId: string; // Links back to our Postgres thread
  tenantId: string;
  // The agent whose response this is. Multi-bot channel adapters (e.g. Telegram,
  // where a tenant can connect a separate bot per agent) use this to pick the
  // right outbound connection/bot instead of assuming one bot per tenant.
  agentProfileId?: string;
  channelType: string;
  channelContactId: string;
  content: string;
  format?: "text" | "markdown" | "html";
  replyToMessageId?: string;
  // Reasoning models emit a chain-of-thought that is stripped from `content`.
  // Surfaces (e.g. the web chat) can show it in a collapsible panel; channel
  // adapters that don't support it simply ignore it. Never persisted.
  thinking?: string;
}
