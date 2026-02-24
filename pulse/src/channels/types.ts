export interface InboundMessage {
    id: string; // the internal ID for this normalized message
    tenantId: string; // Which business does this belong to
    channelType: "telegram" | "whatsapp" | "webchat";
    channelContactId: string;  // Telegram user ID, phone number, etc.
    contactName?: string;
    content: string;
    mediaUrl?: string;
    mediaType?: "image" | "audio" | "video" | "document";
    replyToMessageId?: string;
    raw: unknown;  // Original channel-specific payload for advanced needs
    receivedAt: Date;
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
