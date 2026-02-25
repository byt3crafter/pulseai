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

    private getClient(apiKey?: string, authMethod?: string) {
        if (authMethod === "setup_token" && apiKey) {
            // Explicitly null out apiKey so the SDK only sends Authorization: Bearer
            return new Anthropic({ authToken: apiKey, apiKey: null });
        }
        return new Anthropic({ apiKey: apiKey || config.ANTHROPIC_API_KEY });
    }

    async chat(params: {
        model: string;
        systemPrompt: string;
        messages: ProviderMessage[];
        tenantApiKey?: string;
        authMethod?: string;
        tools?: Array<{
            name: string;
            description: string;
            input_schema: any;
        }>;
    }): Promise<ProviderResponse> {
        const client = this.getClient(params.tenantApiKey, params.authMethod);

        // Map internal 'system' messages into standard user/assistant chain if any, or pass as system string to Claude API.
        const mappedMessages = params.messages.filter((m) => m.role !== "system").map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

        const response = await client.messages.create({
            model: params.model || "claude-sonnet-4-20250514",
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
