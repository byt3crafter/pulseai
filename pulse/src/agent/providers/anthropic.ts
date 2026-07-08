import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";

interface ProviderMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

/** An image attached to the current turn (e.g. a Telegram photo) — see InboundMessage.attachments. */
export interface ProviderAttachment {
    type: "image";
    path: string;
    mime: string;
}

const ANTHROPIC_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/**
 * Find the last message with role "user" and plain-string content (the
 * original user turn — tool-result "user" messages have array content and
 * are skipped) and splice in Anthropic image content blocks ahead of the
 * text. Mutates a shallow copy so the caller's array isn't touched.
 */
async function attachImagesToMessages(
    messages: Array<{ role: string; content: any }>,
    attachments: ProviderAttachment[]
): Promise<Array<{ role: string; content: any }>> {
    const targetIdx = [...messages].map((m, i) => ({ m, i })).reverse()
        .find(({ m }) => m.role === "user" && typeof m.content === "string")?.i;
    if (targetIdx === undefined) return messages;

    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    for (const att of attachments) {
        if (att.type !== "image") continue;
        const mime = ANTHROPIC_IMAGE_MIME.has(att.mime) ? att.mime : "image/jpeg";
        try {
            const bytes = await readFile(att.path);
            imageBlocks.push({
                type: "image",
                source: { type: "base64", media_type: mime as any, data: bytes.toString("base64") },
            });
        } catch (err) {
            logger.warn({ err, path: att.path }, "Failed to read image attachment for Anthropic; skipping");
        }
    }
    if (imageBlocks.length === 0) return messages;

    const result = [...messages];
    const original = result[targetIdx];
    result[targetIdx] = {
        ...original,
        content: [...imageBlocks, { type: "text", text: original.content }],
    };
    return result;
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
        tenantId?: string;
        agentProfileId?: string;
        conversationId?: string;
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
        /** Images attached to the current turn (e.g. a Telegram photo). */
        attachments?: ProviderAttachment[];
        /** Not used by Anthropic today — accepted for cross-provider type compatibility. */
        reasoningEffort?: string;
    }): Promise<ProviderResponse> {
        const client = this.getClient(params.tenantApiKey, params.authMethod);

        const mappedMessages = params.messages.filter((m) => m.role !== "system").map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

        const finalMessages = params.attachments?.length
            ? await attachImagesToMessages(mappedMessages, params.attachments)
            : mappedMessages;

        const createParams = {
            model: params.model || "claude-sonnet-4-20250514",
            max_tokens: 2048,
            system: params.systemPrompt,
            messages: finalMessages as any,
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
