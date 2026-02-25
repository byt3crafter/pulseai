export interface InboundMessage {
  id: string; // the internal ID for this normalized message
  tenantId: string; // Which business does this belong to
  agentProfileId?: string; // The specific virtual employee/persona handling this
  channelType: "telegram" | "whatsapp" | "webchat";
  channelContactId: string;  // Telegram user ID (DM) or group chat ID (group)
  contactName?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  replyToMessageId?: string;
  raw: unknown;  // Original channel-specific payload for advanced needs
  receivedAt: Date;
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
  channelType: string;
  channelContactId: string;
  content: string;
  format?: "text" | "markdown" | "html";
  replyToMessageId?: string;
}
