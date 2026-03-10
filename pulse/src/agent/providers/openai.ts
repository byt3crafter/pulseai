import OpenAI from "openai";
import { config } from "../../config.js";
import { ProviderResponse, ToolCall, StreamCallbacks } from "./anthropic.js";
import { logger } from "../../utils/logger.js";

/**
 * OpenAI Provider - Supports GPT models via two API paths:
 *   - Chat Completions API (api.openai.com) for standard API keys (sk-...)
 *   - ChatGPT Backend Codex Responses API (chatgpt.com/backend-api/codex/responses)
 *     for OAuth tokens (ChatGPT subscription)
 *
 * The OAuth path matches pi-ai / OpenClaw's openai-codex-responses provider.
 * The Codex CLI client (app_EMoamEEZ73f0CkXaXp7hrann) issues tokens that
 * only work with the ChatGPT backend, NOT the public OpenAI API.
 */

const CHATGPT_CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";

/**
 * Convert Anthropic-format messages to OpenAI Chat Completions format.
 *
 * The runtime builds content as arrays with `tool_use` / `tool_result` blocks
 * (Anthropic's native format). OpenAI expects:
 * - Assistant tool calls in `tool_calls` field (not inline content blocks)
 * - Tool results as separate messages with role "tool"
 */
function convertToOpenAIMessages(
    messages: Array<{ role: string; content: any }>
): OpenAI.Chat.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
        // Skip system messages (handled separately)
        if (msg.role === "system") continue;

        // If content is a string, pass through directly
        if (typeof msg.content === "string") {
            result.push({
                role: msg.role as "user" | "assistant",
                content: msg.content,
            });
            continue;
        }

        // If content is an array, it's Anthropic-format content blocks
        if (Array.isArray(msg.content)) {
            const blocks = msg.content as Array<{ type: string; [key: string]: any }>;

            // Check what types of blocks we have
            const hasToolUse = blocks.some((b) => b.type === "tool_use");
            const hasToolResult = blocks.some((b) => b.type === "tool_result");

            if (hasToolUse && msg.role === "assistant") {
                // Assistant message with tool calls → OpenAI format
                const textParts = blocks.filter((b) => b.type === "text").map((b) => b.text);
                const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");

                const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = toolUseBlocks.map((tc) => ({
                    id: tc.id,
                    type: "function" as const,
                    function: {
                        name: tc.name,
                        arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
                    },
                }));

                result.push({
                    role: "assistant",
                    content: textParts.join("\n") || null,
                    tool_calls: toolCalls,
                });
            } else if (hasToolResult) {
                // Tool result blocks → separate "tool" role messages (OpenAI format)
                const toolResultBlocks = blocks.filter((b) => b.type === "tool_result");
                for (const tr of toolResultBlocks) {
                    result.push({
                        role: "tool",
                        tool_call_id: tr.tool_use_id,
                        content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
                    });
                }
            } else {
                // Other array content — convert text blocks to string
                const textParts = blocks
                    .filter((b) => b.type === "text")
                    .map((b) => b.text);
                result.push({
                    role: msg.role as "user" | "assistant",
                    content: textParts.join("\n") || "",
                });
            }
        }
    }

    return result;
}

/**
 * Convert Anthropic-format messages to OpenAI Responses API format.
 * The Responses API uses a different structure than Chat Completions.
 */
function convertToResponsesAPIInput(
    messages: Array<{ role: string; content: any }>
): Array<Record<string, any>> {
    const result: Array<Record<string, any>> = [];

    for (const msg of messages) {
        if (msg.role === "system") continue;

        if (typeof msg.content === "string") {
            result.push({
                role: msg.role,
                content: msg.content,
            });
            continue;
        }

        if (Array.isArray(msg.content)) {
            const blocks = msg.content as Array<{ type: string; [key: string]: any }>;
            const hasToolUse = blocks.some((b) => b.type === "tool_use");
            const hasToolResult = blocks.some((b) => b.type === "tool_result");

            if (hasToolUse && msg.role === "assistant") {
                // For Responses API: tool calls become function_call output items
                const textParts = blocks.filter((b) => b.type === "text").map((b) => b.text);
                if (textParts.length > 0) {
                    result.push({ type: "message", role: "assistant", content: textParts.join("\n") });
                }
                for (const tc of blocks.filter((b) => b.type === "tool_use")) {
                    result.push({
                        type: "function_call",
                        call_id: tc.id,
                        name: tc.name,
                        arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
                    });
                }
            } else if (hasToolResult) {
                // Tool results become function_call_output items
                for (const tr of blocks.filter((b) => b.type === "tool_result")) {
                    result.push({
                        type: "function_call_output",
                        call_id: tr.tool_use_id,
                        output: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
                    });
                }
            } else {
                const textParts = blocks.filter((b) => b.type === "text").map((b) => b.text);
                result.push({
                    role: msg.role,
                    content: textParts.join("\n") || "",
                });
            }
        }
    }

    return result;
}

export class OpenAIProvider {
    readonly name = "openai";

    private getClient(apiKey?: string, baseURL?: string) {
        const key = apiKey || config.OPENAI_API_KEY;
        if (!key) {
            throw new Error("OPENAI_API_KEY not configured");
        }
        return new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) });
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
        stream?: StreamCallbacks;
        baseURL?: string;
    }): Promise<ProviderResponse> {
        // OAuth tokens use ChatGPT backend Codex Responses API;
        // standard API keys use Chat Completions
        if (params.authMethod === "oauth") {
            return this.chatViaChatGPTBackend(params);
        }
        return this.chatViaCompletions(params);
    }

    /**
     * Standard Chat Completions path — for API keys (sk-...)
     */
    private async chatViaCompletions(params: {
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
        stream?: StreamCallbacks;
        baseURL?: string;
    }): Promise<ProviderResponse> {
        const client = this.getClient(params.tenantApiKey, params.baseURL);

        const tools = params.tools?.map((tool) => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }));

        // Convert Anthropic-format content blocks to OpenAI format
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: params.systemPrompt },
            ...convertToOpenAIMessages(params.messages),
        ];

        logger.debug(
            { model: params.model, api: "chat.completions", messageCount: messages.length },
            "OpenAI Chat Completions request"
        );

        try {
            // Streaming path
            if (params.stream?.onDelta) {
                const stream = await client.chat.completions.create({
                    model: params.model || "gpt-4o",
                    messages,
                    tools: tools && tools.length > 0 ? tools : undefined,
                    temperature: 1,
                    max_tokens: 2048,
                    stream: true,
                });

                let content = "";
                const toolCallArgs: Map<number, { id: string; name: string; args: string }> = new Map();
                let model = "";
                let finishReason = "";
                let promptTokens = 0;
                let completionTokens = 0;

                for await (const chunk of stream) {
                    const delta = chunk.choices[0]?.delta;
                    if (!delta) continue;

                    model = chunk.model || model;

                    if (delta.content) {
                        content += delta.content;
                        params.stream.onDelta!(delta.content);
                    }

                    // Accumulate tool call deltas
                    if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index;
                            if (!toolCallArgs.has(idx)) {
                                toolCallArgs.set(idx, {
                                    id: tc.id || "",
                                    name: tc.function?.name || "",
                                    args: "",
                                });
                            }
                            const entry = toolCallArgs.get(idx)!;
                            if (tc.id) entry.id = tc.id;
                            if (tc.function?.name) entry.name = tc.function.name;
                            if (tc.function?.arguments) entry.args += tc.function.arguments;
                        }
                    }

                    if (chunk.choices[0]?.finish_reason) {
                        finishReason = chunk.choices[0].finish_reason;
                    }

                    if (chunk.usage) {
                        promptTokens = chunk.usage.prompt_tokens || 0;
                        completionTokens = chunk.usage.completion_tokens || 0;
                    }
                }

                params.stream.onComplete?.();

                const toolCalls: ToolCall[] = [];
                for (const [_, tc] of toolCallArgs) {
                    toolCalls.push({
                        id: tc.id,
                        name: tc.name,
                        input: tc.args ? JSON.parse(tc.args) : {},
                    });
                }

                return {
                    content,
                    usage: { inputTokens: promptTokens, outputTokens: completionTokens },
                    model,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    stopReason: finishReason || undefined,
                };
            }

            // Non-streaming path
            const response = await client.chat.completions.create({
                model: params.model || "gpt-4o",
                messages,
                tools: tools && tools.length > 0 ? tools : undefined,
                temperature: 1,
                max_tokens: 2048,
            });

            const message = response.choices[0].message;
            const content = message.content || "";

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
        } catch (err: any) {
            logger.error(
                { model: params.model, api: "chat.completions", status: err.status, message: err.message },
                "OpenAI Chat Completions failed"
            );
            throw err;
        }
    }

    /**
     * ChatGPT Backend Codex Responses API — for OAuth tokens (ChatGPT subscription)
     *
     * Uses the same endpoint as pi-ai's openai-codex-responses provider:
     *   POST https://chatgpt.com/backend-api/codex/responses
     *
     * Requires:
     *   - Bearer token from OAuth flow
     *   - chatgpt-account-id header (extracted from JWT)
     *   - OpenAI-Beta: responses=experimental header
     *
     * Request format matches the OpenAI Responses API (model, instructions, input).
     * Response is SSE-streamed with response.completed containing the final output.
     */
    private async chatViaChatGPTBackend(params: {
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
        stream?: StreamCallbacks;
    }): Promise<ProviderResponse> {
        const token = params.tenantApiKey;
        if (!token) {
            throw new Error("OAuth token not available");
        }

        // Extract chatgpt_account_id from JWT claims (required header)
        const accountId = this.extractAccountId(token);

        // Convert Anthropic-format content blocks to Responses API format
        const input = convertToResponsesAPIInput(params.messages);

        // Build tools in Responses API format
        const tools = params.tools?.map((tool) => ({
            type: "function" as const,
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
            strict: false,
        }));

        const body: Record<string, any> = {
            model: params.model || "gpt-4o",
            instructions: params.systemPrompt,
            input,
            stream: true,
            store: false,
            tool_choice: "auto",
            parallel_tool_calls: true,
        };

        if (tools && tools.length > 0) {
            body.tools = tools;
        }

        logger.debug(
            {
                model: params.model,
                api: "chatgpt-codex-responses",
                messageCount: input.length,
                hasTools: !!tools,
                accountId: accountId.substring(0, 8) + "...",
            },
            "ChatGPT Backend Codex Responses request"
        );

        const response = await fetch(CHATGPT_CODEX_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "chatgpt-account-id": accountId,
                "OpenAI-Beta": "responses=experimental",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let friendlyMessage = `ChatGPT API error (${response.status})`;
            try {
                const parsed = JSON.parse(errorText);
                const err = parsed?.error;
                if (err?.code === "usage_limit_reached" || err?.code === "usage_not_included" || response.status === 429) {
                    const mins = err.resets_at
                        ? Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60000))
                        : undefined;
                    friendlyMessage = `ChatGPT usage limit reached.${mins !== undefined ? ` Try again in ~${mins} min.` : ""}`;
                } else {
                    friendlyMessage = err?.message || friendlyMessage;
                }
            } catch { /* ignore parse errors */ }

            logger.error(
                { model: params.model, api: "chatgpt-codex-responses", status: response.status, error: friendlyMessage },
                "ChatGPT Backend request failed"
            );
            throw new Error(friendlyMessage);
        }

        // Parse SSE stream to extract final response
        const result = await this.consumeSSEStream(response, params.stream?.onDelta);
        params.stream?.onComplete?.();

        logger.debug(
            {
                model: result.model || params.model,
                inputTokens: result.usage?.input_tokens,
                outputTokens: result.usage?.output_tokens,
            },
            "ChatGPT Backend Codex Responses success"
        );

        // Extract tool calls from output items
        const toolCalls: ToolCall[] = [];
        if (result.output) {
            for (const item of result.output) {
                if (item.type === "function_call") {
                    toolCalls.push({
                        id: item.call_id || item.id,
                        name: item.name,
                        input: typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments,
                    });
                }
            }
        }

        return {
            content: result.outputText || "",
            usage: {
                inputTokens: result.usage?.input_tokens || 0,
                outputTokens: result.usage?.output_tokens || 0,
            },
            model: result.model || params.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            stopReason: result.status === "completed" ? "end_turn" : result.status || undefined,
        };
    }

    /**
     * Extract chatgpt_account_id from the OAuth JWT token.
     * Matches pi-ai's extractAccountId() function.
     */
    private extractAccountId(token: string): string {
        try {
            const parts = token.split(".");
            if (parts.length !== 3) throw new Error("Invalid JWT");
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
            const accountId = payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
            if (!accountId) throw new Error("No chatgpt_account_id in JWT claims");
            return accountId;
        } catch (err: any) {
            logger.error({ err: err.message }, "Failed to extract accountId from OAuth token");
            throw new Error("Failed to extract ChatGPT account ID from token. Try reconnecting your ChatGPT account.");
        }
    }

    /**
     * Consume SSE stream from ChatGPT backend and extract the final response.
     * The stream emits events like response.output_text.delta, response.completed, etc.
     * We collect text content and wait for the response.completed event.
     */
    private async consumeSSEStream(response: Response, onDelta?: (delta: string) => void): Promise<{
        outputText: string;
        output: any[];
        model: string;
        status: string;
        usage: { input_tokens: number; output_tokens: number } | null;
    }> {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let outputText = "";
        let finalResponse: any = null;
        const output: any[] = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events (separated by double newline)
                let idx = buffer.indexOf("\n\n");
                while (idx !== -1) {
                    const chunk = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);

                    const dataLines = chunk
                        .split("\n")
                        .filter((l) => l.startsWith("data:"))
                        .map((l) => l.slice(5).trim());

                    if (dataLines.length > 0) {
                        const data = dataLines.join("\n").trim();
                        if (data && data !== "[DONE]") {
                            try {
                                const event = JSON.parse(data);
                                const type = event.type;

                                // Collect text deltas
                                if (type === "response.output_text.delta" && event.delta) {
                                    outputText += event.delta;
                                    onDelta?.(event.delta);
                                }

                                // Collect output items
                                if (type === "response.output_item.done" && event.item) {
                                    output.push(event.item);
                                }

                                // Final response with usage data
                                if (type === "response.completed" || type === "response.done") {
                                    finalResponse = event.response;
                                }

                                // Handle errors
                                if (type === "response.failed") {
                                    const msg = event.response?.error?.message || "Response failed";
                                    throw new Error(msg);
                                }
                                if (type === "error") {
                                    throw new Error(event.message || event.code || "Stream error");
                                }
                            } catch (parseErr: any) {
                                if (parseErr.message && !parseErr.message.includes("JSON")) {
                                    throw parseErr; // Re-throw non-JSON errors (our custom errors)
                                }
                                // Skip malformed JSON
                            }
                        }
                    }
                    idx = buffer.indexOf("\n\n");
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Use final response if available, otherwise construct from collected data
        if (finalResponse) {
            return {
                outputText: finalResponse.output_text || outputText,
                output: finalResponse.output || output,
                model: finalResponse.model || "",
                status: finalResponse.status || "completed",
                usage: finalResponse.usage || null,
            };
        }

        return {
            outputText,
            output,
            model: "",
            status: "completed",
            usage: null,
        };
    }
}
