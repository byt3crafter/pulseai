export type ChannelSetupFieldType = "text" | "url" | "secret";

export interface ChannelSetupField {
    name: string;
    label: string;
    type: ChannelSetupFieldType;
    placeholder: string;
    required?: boolean;
    helpText?: string;
}

export interface ChannelSetupDefinition {
    type: string;
    label: string;
    description: string;
    runtimeStatus: "adapter_pending" | "available";
    fields: ChannelSetupField[];
}

export const CHANNEL_SETUP_CATALOG: ChannelSetupDefinition[] = [
    {
        type: "whatsapp",
        label: "WhatsApp Business",
        description: "Store WhatsApp Business API settings for the upcoming adapter.",
        runtimeStatus: "adapter_pending",
        fields: [
            { name: "phoneNumberId", label: "Phone Number ID", type: "text", placeholder: "123456789012345", required: true },
            { name: "businessAccountId", label: "Business Account ID", type: "text", placeholder: "987654321098765" },
            { name: "appSecret", label: "App Secret", type: "secret", placeholder: "Meta app secret", required: true },
            { name: "accessToken", label: "Access Token", type: "secret", placeholder: "Permanent access token", required: true },
            { name: "verifyToken", label: "Webhook Verify Token", type: "secret", placeholder: "Choose a long random token", required: true },
        ],
    },
    {
        type: "slack",
        label: "Slack",
        description: "Store Slack app credentials for the upcoming Events API adapter.",
        runtimeStatus: "adapter_pending",
        fields: [
            { name: "botToken", label: "Bot Token", type: "secret", placeholder: "xoxb-...", required: true },
            { name: "signingSecret", label: "Signing Secret", type: "secret", placeholder: "Slack signing secret", required: true },
            { name: "appId", label: "App ID", type: "text", placeholder: "A0123456789" },
        ],
    },
    {
        type: "discord",
        label: "Discord",
        description: "Store Discord bot credentials for the upcoming adapter.",
        runtimeStatus: "adapter_pending",
        fields: [
            { name: "botToken", label: "Bot Token", type: "secret", placeholder: "Discord bot token", required: true },
            { name: "applicationId", label: "Application ID", type: "text", placeholder: "123456789012345678" },
            { name: "publicKey", label: "Public Key", type: "text", placeholder: "Interaction public key" },
        ],
    },
    {
        type: "webchat",
        label: "WebChat",
        description: "Reserve tenant WebChat settings for the embeddable widget work.",
        runtimeStatus: "adapter_pending",
        fields: [
            { name: "allowedOrigins", label: "Allowed Origins", type: "text", placeholder: "https://example.com, https://app.example.com", required: true },
            { name: "widgetName", label: "Widget Name", type: "text", placeholder: "Support Assistant" },
        ],
    },
];

export function getChannelSetupDefinition(type: string): ChannelSetupDefinition | undefined {
    const normalized = type.trim().toLowerCase();
    return CHANNEL_SETUP_CATALOG.find((channel) => channel.type === normalized);
}
