import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";

interface ProviderMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface ToolCall {
    id: string;
    name: string;
    input: Record<string, any>;
}

export interface ToolResult {
    toolCallId: string;
    content: string;
}

export interface ProviderResponse {
    content: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    model: string;
    toolCalls?: ToolCall[];
    stopReason?: string;
}

export class AnthropicProvider {
    readonly name = "anthropic";

    private getClient(tenantApiKey?: string) {
        if (tenantApiKey) {
            return new Anthropic({ apiKey: tenantApiKey });
        }
        return new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    }

    async chat(params: {
        model: string;
        systemPrompt: string;
        messages: ProviderMessage[];
        tenantApiKey?: string;
        globalAnthropicKey?: string;
        tools?: Array<{
            name: string;
            description: string;
            input_schema: any;
        }>;
    }): Promise<ProviderResponse> {
        // Evaluate Key Hierarchy:
        // 1. Tenant specific overrides
        // 2. Dashboard super-admin DB configuration
        // 3. Falling back to local .env deployment config
        const activeKey = params.tenantApiKey || params.globalAnthropicKey || config.ANTHROPIC_API_KEY;
        const client = this.getClient(activeKey);

        // Map internal 'system' messages into standard user/assistant chain if any, or pass as system string to Claude API.
        const mappedMessages = params.messages.filter((m) => m.role !== "system").map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

        const response = await client.messages.create({
            model: params.model || "claude-3-7-sonnet-20250219",
            max_tokens: 2048,
            system: params.systemPrompt,
            messages: mappedMessages,
            tools: params.tools,
        });

        // Extract text content
        const textContent = response.content.find((c) => c.type === "text");
        const replyContent = textContent?.type === "text" ? textContent.text : "";

        // Extract tool calls if any
        const toolCalls: ToolCall[] = [];
        for (const block of response.content) {
            if (block.type === "tool_use") {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input as Record<string, any>,
                });
            }
        }

        return {
            content: replyContent,
            usage: {
                inputTokens: response.usage?.input_tokens || 0,
                outputTokens: response.usage?.output_tokens || 0,
            },
            model: response.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            stopReason: response.stop_reason || undefined,
        };
    }
}
