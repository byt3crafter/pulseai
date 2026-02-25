import { InboundMessage, OutboundMessage } from "./types.js";

// We don't have the ChannelConnection schema full-typing mapped here yet, 
// using generic shape until we import it from zod/drizzle.
export interface ChannelConnectionConfig {
    id: string;
    tenantId: string;
    agentProfileId?: string | null;
    channelType: string;
    channelConfig: Record<string, any>;
}

export interface ChannelAdapter {
    readonly channelType: string;

    // Boots all active connections for this channel type across all tenants
    initialize(connections: ChannelConnectionConfig[]): Promise<void>;

    // Cleanly disconnects (e.g., closing polling or webhooks)
    shutdown(): Promise<void>;

    // Normalize incoming message to common format
    onMessage(handler: (msg: InboundMessage) => Promise<void>): void;

    // Send response back through channel
    sendMessage(msg: OutboundMessage): Promise<{ channelMessageId: string }>;

    // Format the raw LLM output into whatever the channel requires (MarkdownV2 for TG, etc)
    formatResponse(content: string): string;
}
