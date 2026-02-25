import OpenAI from "openai";
import { config } from "../../config.js";
import { ProviderResponse, ToolCall } from "./anthropic.js";

/**
 * OpenAI Provider - Supports GPT-4o and other OpenAI models
 * Used as primary for OpenAI models, or as fallback for Anthropic failures
 */
export class OpenAIProvider {
    readonly name = "openai";

    private getClient(apiKey?: string) {
        const key = apiKey || config.OPENAI_API_KEY;
        if (!key) {
            throw new Error("OPENAI_API_KEY not configured");
        }
        return new OpenAI({ apiKey: key });
    }

    async chat(params: {
        model: string;
        systemPrompt: string;
        messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
        tenantApiKey?: string;
        authMethod?: string;
        tools?: Array<{
            name: string;
            description: string;
            input_schema: any;
        }>;
    }): Promise<ProviderResponse> {
        const client = this.getClient(params.tenantApiKey);

        // Convert tool definitions to OpenAI format
        const tools = params.tools?.map((tool) => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }));

        // Build messages array with system message
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: params.systemPrompt },
            ...params.messages
                .filter((m) => m.role !== "system")
                .map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
        ];

        const response = await client.chat.completions.create({
            model: params.model || "gpt-4o",
            messages,
            tools,
            temperature: 1,
            max_tokens: 2048,
        });

        const message = response.choices[0].message;

        // Extract text content
        const content = message.content || "";

        // Extract tool calls if any
        const toolCalls: ToolCall[] = [];
        if (message.tool_calls) {
            for (const toolCall of message.tool_calls) {
                if (toolCall.type === "function") {
                    toolCalls.push({
                        id: toolCall.id,
                        name: toolCall.function.name,
                        input: JSON.parse(toolCall.function.arguments),
                    });
                }
            }
        }

        return {
            content,
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
            },
            model: response.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            stopReason: response.choices[0].finish_reason || undefined,
        };
    }
}
