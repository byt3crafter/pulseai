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

export interface StreamCallbacks {
    onDelta?: (delta: string) => void;
    onComplete?: () => void;
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
        stream?: StreamCallbacks;
    }): Promise<ProviderResponse> {
        const client = this.getClient(params.tenantApiKey, params.authMethod);

        const mappedMessages = params.messages.filter((m) => m.role !== "system").map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

        const createParams = {
            model: params.model || "claude-sonnet-4-20250514",
            max_tokens: 2048,
            system: params.systemPrompt,
            messages: mappedMessages,
            tools: params.tools,
        };

        // Streaming path
        if (params.stream?.onDelta) {
            const stream = client.messages.stream(createParams);
            let replyContent = "";
            const toolCalls: ToolCall[] = [];

            stream.on("text", (text) => {
                replyContent += text;
                params.stream!.onDelta!(text);
            });

            const finalMessage = await stream.finalMessage();
            params.stream.onComplete?.();

            for (const block of finalMessage.content) {
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
                    inputTokens: finalMessage.usage?.input_tokens || 0,
                    outputTokens: finalMessage.usage?.output_tokens || 0,
                },
                model: finalMessage.model,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                stopReason: finalMessage.stop_reason || undefined,
            };
        }

        // Non-streaming path
        const response = await client.messages.create(createParams);

        const textContent = response.content.find((c) => c.type === "text");
        const replyContent = textContent?.type === "text" ? textContent.text : "";

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
