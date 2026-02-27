import { InboundMessage, OutboundMessage } from "../channels/types.js";
import { ProviderManager } from "./providers/provider-manager.js";
import { ToolCall, StreamCallbacks } from "./providers/anthropic.js";
import { ToolRegistry } from "./tools/registry.js";
import { workspaceService } from "./workspace/workspace-service.js";
import { getDefaultModel, getProviderByModel } from "./providers/model-registry.js";
import { providerKeyService } from "./providers/provider-key-service.js";
import { memoryService } from "../memory/memory-service.js";
import { getDelegatableAgents, getAgentDelegationConfig } from "./orchestration/agent-registry.js";
import { resolveAgent } from "./orchestration/agent-router.js";
import { hookRegistry } from "../plugins/hooks.js";
import { db } from "../storage/db.js";
import { messages, conversations, usageRecords, tenantBalances, ledgerTransactions, agentProfiles } from "../storage/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { sanitizeToolSchema } from "./tools/schema-sanitizer.js";
import { randomUUID } from "crypto";

const defaultSystemPrompt = `You are a helpful AI assistant. Be professional, friendly, and concise. Respect the user's time and keep responses focused. If you don't know something, say so.`;

export class AgentRuntime {
    private providerManager = new ProviderManager();
    private toolRegistry = new ToolRegistry();

    async processMessage(
        inbound: InboundMessage,
        sendMessageCallback: (msg: OutboundMessage) => Promise<{ channelMessageId: string }>,
        options?: {
            editMessageCallback?: (
                tenantId: string,
                chatId: string,
                messageId: string,
                content: string,
                parseMode?: string
            ) => Promise<void>;
        }
    ): Promise<void> {
        const tenantLog = logger.child({ tenantId: inbound.tenantId, channel: inbound.channelType });

        try {
            // 0. Pre-Flight Check: Verify tenant has sufficient credits
            const balanceRecord = await db.query.tenantBalances.findFirst({
                where: eq(tenantBalances.tenantId, inbound.tenantId),
            });

            const currentBalance = balanceRecord?.balance ? parseFloat(balanceRecord.balance as string) : 0;
            if (currentBalance <= 0) {
                tenantLog.warn({ currentBalance }, "Message rejected due to insufficient credits");
                await sendMessageCallback({
                    conversationId: randomUUID(), // Fallback conversation string
                    tenantId: inbound.tenantId,
                    channelType: inbound.channelType,
                    channelContactId: inbound.channelContactId,
                    content: "Your account has insufficient credits to process this message. Please top up your balance in the dashboard.",
                });
                return;
            }
            // 1. Get or Create Conversation thread for Sliding Context Window
            let conversation = await db.query.conversations.findFirst({
                where: and(
                    eq(conversations.tenantId, inbound.tenantId),
                    eq(conversations.channelType, inbound.channelType),
                    eq(conversations.channelContactId, inbound.channelContactId)
                ),
            });

            if (!conversation) {
                const [insert] = await db
                    .insert(conversations)
                    .values({
                        tenantId: inbound.tenantId,
                        channelType: inbound.channelType,
                        channelContactId: inbound.channelContactId,
                        contactName: inbound.contactName,
                    })
                    .returning();
                conversation = insert;
                tenantLog.info({ conversationId: conversation.id }, "Created new conversation thread");
            }

            // 2. Save Inbound User Message to the database.
            const messageMetadata: Record<string, any> = { receivedAt: inbound.receivedAt };
            if (inbound.isGroup) {
                messageMetadata.senderUserId = inbound.senderUserId;
                messageMetadata.senderUsername = inbound.senderUsername;
                messageMetadata.groupTitle = inbound.groupTitle;
            }

            await db.insert(messages).values({
                conversationId: conversation.id,
                tenantId: inbound.tenantId,
                role: "user",
                content: inbound.content,
                metadata: messageMetadata,
            });

            // 3. Sliding Context Window: Fetch last 20 messages for Context limit. (Adapting OpenClaw strategy)
            const slidingWindowHistory = await db.query.messages.findMany({
                where: eq(messages.conversationId, conversation.id),
                orderBy: [desc(messages.createdAt)],
                limit: 20, // Strict truncation prevents token explosion
            });

            // Maintain chronological order for LLM.
            slidingWindowHistory.reverse();

            const llmMessages = slidingWindowHistory.map((m: any) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            }));

            // 3.5. Resolve agentProfileId via routing rules (or channel default / tenant fallback)
            let resolvedAgentProfileId = await resolveAgent(inbound);
            if (!resolvedAgentProfileId) {
                const fallbackProfile = await db.query.agentProfiles.findFirst({
                    where: eq(agentProfiles.tenantId, inbound.tenantId),
                });
                if (fallbackProfile) {
                    resolvedAgentProfileId = fallbackProfile.id;
                    tenantLog.warn({ agentProfileId: resolvedAgentProfileId }, "No routing rule matched, using tenant fallback");
                }
            }

            // 3.6. Get enabled tools for tenant and agent profile
            const enabledTools = await this.toolRegistry.getEnabledTools(inbound.tenantId, resolvedAgentProfileId ?? undefined);
            const toolDefinitions = enabledTools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: sanitizeToolSchema(t.name, structuredClone(t.parameters)),
            }));

            tenantLog.debug(
                { toolCount: enabledTools.length, tools: enabledTools.map((t) => t.name) },
                "Loaded enabled tools for tenant"
            );

            // 3.75 Resolve per-agent model and system prompt (workspace-first, DB fallback)
            let activeSystemPrompt = defaultSystemPrompt;
            let activeModelId = getDefaultModel().id;

            if (resolvedAgentProfileId) {
                const profile = await db.query.agentProfiles.findFirst({
                    where: eq(agentProfiles.id, resolvedAgentProfileId)
                });

                if (profile) {
                    // Use per-agent model if set
                    if (profile.modelId) {
                        activeModelId = profile.modelId;
                    }

                    // Try workspace prompt first, fall back to DB systemPrompt
                    const workspacePrompt = await workspaceService.buildSystemPrompt(
                        inbound.tenantId,
                        resolvedAgentProfileId
                    );

                    if (workspacePrompt) {
                        activeSystemPrompt = workspacePrompt;
                    } else if (profile.systemPrompt) {
                        activeSystemPrompt = profile.systemPrompt;
                    }
                }
            }

            tenantLog.info({ model: activeModelId, agentProfileId: resolvedAgentProfileId ?? "none" }, "Model resolved for request");

            // 3.8 Inject relevant memories into system prompt
            if (resolvedAgentProfileId) {
                try {
                    const memoryContext = await memoryService.getRelevantContext(
                        inbound.tenantId, resolvedAgentProfileId, inbound.content, 5
                    );
                    if (memoryContext) {
                        activeSystemPrompt += `\n\n## Relevant Memories\n${memoryContext}`;
                    }
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to inject memory context (non-fatal)");
                }
            }

            // 3.85 Inject delegation context into system prompt
            let delegationActive = false;
            if (resolvedAgentProfileId) {
                try {
                    const delConfig = await getAgentDelegationConfig(resolvedAgentProfileId);
                    if (delConfig.canDelegate) {
                        const availableAgents = await getDelegatableAgents(inbound.tenantId, resolvedAgentProfileId);
                        if (availableAgents.length > 0) {
                            delegationActive = true;
                            const agentLines = availableAgents.map(
                                (a) => `- ${a.name} (${a.id}): ${a.specialization} [Model: ${a.modelId}]`
                            );
                            activeSystemPrompt += `\n\n## Available Agents for Delegation\nYou can delegate tasks to these specialized agents:\n${agentLines.join("\n")}\nUse the delegate_to_agent tool to send them a task. Use list_agents to refresh this list.`;
                        }
                    }
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to inject delegation context (non-fatal)");
                }
            }

            // 3.87 Run before-prompt-build plugin hooks
            try {
                const promptCtx = await hookRegistry.run("before-prompt-build", {
                    tenantId: inbound.tenantId,
                    agentProfileId: resolvedAgentProfileId,
                    systemPrompt: activeSystemPrompt,
                    messages: llmMessages,
                });
                activeSystemPrompt = promptCtx.systemPrompt;
            } catch (err) {
                tenantLog.warn({ err }, "Plugin before-prompt-build hook failed (non-fatal)");
            }

            // 3.9 Pre-Flight: Verify an AI provider key exists before calling the LLM
            const providerDef = getProviderByModel(activeModelId);
            const providerId = providerDef?.id ?? "anthropic";
            const resolvedKey = await providerKeyService.resolveKey(inbound.tenantId, providerId);

            if (!resolvedKey) {
                tenantLog.warn({ model: activeModelId, provider: providerId }, "No AI provider key configured");
                await sendMessageCallback({
                    conversationId: conversation.id,
                    tenantId: inbound.tenantId,
                    channelType: inbound.channelType,
                    channelContactId: inbound.channelContactId,
                    content: `Setup required: No AI provider key is configured for ${providerDef?.name || providerId}. Please go to your dashboard Settings > AI Providers and add an API key, or ask your administrator to configure one.`,
                    replyToMessageId: inbound.isGroup ? (inbound.raw as any)?.message_id?.toString() : undefined,
                });
                return;
            }

            // 4. Call LLM with tools — ProviderManager routes to correct provider based on model
            tenantLog.info({ provider: providerId, model: activeModelId }, "Dispatching to LLM Provider");

            // Set up streaming callbacks for progressive message editing
            let streamCallbacks: StreamCallbacks | undefined;
            let streamMessageId: string | null = null;
            let streamAccumulated = "";
            let lastEditTime = 0;
            const EDIT_THROTTLE_MS = 1000;

            if (options?.editMessageCallback && toolDefinitions.length === 0) {
                // Only stream when there are no tools (tool calls need sync handling)
                streamCallbacks = {
                    onDelta: (delta: string) => {
                        streamAccumulated += delta;
                        const now = Date.now();

                        // Send initial message on first content
                        if (!streamMessageId && streamAccumulated.length > 20) {
                            // Will be sent asynchronously below
                        }

                        // Throttle edits to 1 per second
                        if (streamMessageId && now - lastEditTime >= EDIT_THROTTLE_MS) {
                            lastEditTime = now;
                            options.editMessageCallback!(
                                inbound.tenantId,
                                inbound.channelContactId,
                                streamMessageId,
                                streamAccumulated + " ..."
                            ).catch(() => {});
                        }
                    },
                    onComplete: () => {
                        // Final edit happens after the full response is built
                    },
                };

                // Start a "typing" placeholder and capture the message ID for edits
                const placeholder = await sendMessageCallback({
                    conversationId: conversation.id,
                    tenantId: inbound.tenantId,
                    channelType: inbound.channelType,
                    channelContactId: inbound.channelContactId,
                    content: "...",
                    replyToMessageId: inbound.isGroup ? (inbound.raw as any)?.message_id?.toString() : undefined,
                });
                streamMessageId = placeholder.channelMessageId;
                lastEditTime = Date.now();
            }

            let llmResponse = await this.providerManager.chat({
                model: activeModelId,
                tenantId: inbound.tenantId,
                systemPrompt: activeSystemPrompt,
                messages: llmMessages,
                tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                stream: streamCallbacks,
            });

            // 4.5. Handle tool calls in a loop (support multi-turn tool use)
            let toolUseCount = 0;
            const maxToolIterations = delegationActive ? 10 : 5; // Higher limit when delegation is active
            let totalInputTokens = llmResponse.usage.inputTokens;
            let totalOutputTokens = llmResponse.usage.outputTokens;

            while (llmResponse.toolCalls && llmResponse.toolCalls.length > 0 && toolUseCount < maxToolIterations) {
                toolUseCount++;
                tenantLog.debug(
                    { iteration: toolUseCount, toolCallCount: llmResponse.toolCalls.length },
                    "Processing tool calls"
                );

                const currentToolCalls = llmResponse.toolCalls as ToolCall[];
                // Execute all tool calls
                const toolResults = await Promise.all(
                    currentToolCalls.map(async (toolCall: ToolCall) => {
                        tenantLog.debug({ toolCall }, "Executing tool");

                        const tool = enabledTools.find(t => t.name === toolCall.name);
                        let result: { result: string; metadata?: any };

                        if (!tool) {
                            tenantLog.warn({ toolName: toolCall.name }, "Attempted to execute unknown tool");
                            result = { result: `Error: Tool '${toolCall.name}' not found` };
                        } else {
                            try {
                                result = await tool.execute({
                                    tenantId: inbound.tenantId,
                                    conversationId: conversation.id,
                                    args: toolCall.input as Record<string, any>,
                                });
                            } catch (err: any) {
                                tenantLog.error({ err, toolName: toolCall.name }, "Tool execution failed");
                                result = { result: `Error executing tool '${toolCall.name}': ${err.message || "Unknown error"}` };
                            }
                        }

                        return {
                            type: "tool_result" as const,
                            tool_use_id: toolCall.id,
                            content: result.result,
                        };
                    })
                );

                // Call LLM again with tool results
                // Build the assistant message with tool_use blocks
                const assistantMessage = {
                    role: "assistant" as const,
                    content: [
                        ...(llmResponse.content ? [{ type: "text" as const, text: llmResponse.content }] : []),
                        ...currentToolCalls.map((tc: ToolCall) => ({
                            type: "tool_use" as const,
                            id: tc.id,
                            name: tc.name,
                            input: tc.input,
                        })),
                    ],
                };

                // User message with tool results
                const toolResultMessage = {
                    role: "user" as const,
                    content: toolResults,
                };

                // Call LLM with tool results — same model + tenant routing
                llmResponse = await this.providerManager.chat({
                    model: activeModelId,
                    tenantId: inbound.tenantId,
                    systemPrompt: activeSystemPrompt,
                    messages: [
                        ...llmMessages,
                        assistantMessage as any,
                        toolResultMessage as any,
                    ],
                    tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                });

                totalInputTokens += llmResponse.usage.inputTokens;
                totalOutputTokens += llmResponse.usage.outputTokens;
            }

            if (toolUseCount >= maxToolIterations) {
                tenantLog.warn("Reached maximum tool use iterations, stopping");
            }

            // Update usage to reflect total tokens across all iterations
            llmResponse.usage.inputTokens = totalInputTokens;
            llmResponse.usage.outputTokens = totalOutputTokens;

            // 5. Store LLM Assistant response in Database
            await db.insert(messages).values({
                conversationId: conversation.id,
                tenantId: inbound.tenantId,
                role: "assistant",
                content: llmResponse.content,
            });

            // 6. Record Cost/Usage for Billing Tracking
            // Use canonical model ID (from our registry) for accurate pricing
            const usedModel = llmResponse.canonicalModel;
            const pricing = this.providerManager.getPricing(usedModel, llmResponse.provider);
            const costUsd =
                (llmResponse.usage.inputTokens * pricing.input) / 1000000 +
                (llmResponse.usage.outputTokens * pricing.output) / 1000000;
            const creditsUsed = costUsd * 100; // 1 credit = $0.01

            tenantLog.info(
                {
                    provider: llmResponse.provider,
                    requestedModel: activeModelId,
                    usedModel,
                    wasFallback: llmResponse.wasFallback,
                    inputTokens: llmResponse.usage.inputTokens,
                    outputTokens: llmResponse.usage.outputTokens,
                    costUsd: costUsd.toFixed(6),
                    creditsUsed: creditsUsed.toFixed(4),
                },
                "Usage calculated"
            );

            // Record canonical model ID (matches registry) with provider prefix for clarity
            const [usageRecord] = await db.insert(usageRecords).values({
                tenantId: inbound.tenantId,
                conversationId: conversation.id,
                model: usedModel,
                inputTokens: llmResponse.usage.inputTokens.toString(),
                outputTokens: llmResponse.usage.outputTokens.toString(),
                costUsd: costUsd.toFixed(6),
                creditsUsed: creditsUsed.toFixed(4),
            }).returning();

            // 6.b Deduct from Balance and Record Ledger
            await db.update(tenantBalances)
                .set({
                    balance: sql`${tenantBalances.balance} - ${creditsUsed}`,
                    updatedAt: new Date(),
                })
                .where(eq(tenantBalances.tenantId, inbound.tenantId));

            await db.insert(ledgerTransactions).values({
                tenantId: inbound.tenantId,
                amount: (-creditsUsed).toFixed(4),
                type: "usage",
                description: `${llmResponse.provider}/${usedModel}${llmResponse.wasFallback ? " (fallback)" : ""}`,
                referenceId: usageRecord.id,
            });

            // 7. Dispatch Response to Channel Adapter
            if (streamMessageId && options?.editMessageCallback) {
                // Streaming was active — do final edit with fully formatted content
                await options.editMessageCallback(
                    inbound.tenantId,
                    inbound.channelContactId,
                    streamMessageId,
                    llmResponse.content,
                    "markdown"
                ).catch((e) => tenantLog.error({ e }, "Failed final streaming edit"));
            } else {
                const outbound: OutboundMessage = {
                    conversationId: conversation.id,
                    tenantId: inbound.tenantId,
                    channelType: inbound.channelType,
                    channelContactId: inbound.channelContactId,
                    content: llmResponse.content,
                    format: "markdown",
                };

                // For group messages, reply in-thread to the original message
                if (inbound.isGroup && inbound.raw) {
                    const rawMsg = inbound.raw as any;
                    if (rawMsg.message_id) {
                        outbound.replyToMessageId = rawMsg.message_id.toString();
                    }
                }

                await sendMessageCallback(outbound);
            }

        } catch (err: any) {
            tenantLog.error({ err }, "Agent Runtime failed to process message");

            // Provide actionable error messages instead of generic "technical difficulties"
            let userMessage: string;
            const errMsg = err?.message || "";

            if (errMsg.includes("All LLM providers failed") || errMsg.includes("No fallback available")) {
                userMessage = `AI service error: ${errMsg.substring(0, 200)}. Check your provider keys in Settings > AI Providers.`;
            } else if (errMsg.includes("401") || errMsg.includes("authentication") || errMsg.includes("invalid_api_key")) {
                userMessage = "AI authentication failed. The API key may be invalid or expired. Please update it in Settings > AI Providers.";
            } else if (errMsg.includes("rate") || errMsg.includes("429")) {
                userMessage = "AI rate limit reached. Please wait a moment and try again.";
            } else if (errMsg.includes("insufficient") || errMsg.includes("quota")) {
                userMessage = "AI provider quota exceeded. Please check your API key billing or add credits.";
            } else {
                userMessage = "I encountered an error processing your request. Please try again or contact your administrator if this persists.";
            }

            await sendMessageCallback({
                conversationId: randomUUID(),
                tenantId: inbound.tenantId,
                channelType: inbound.channelType,
                channelContactId: inbound.channelContactId,
                content: userMessage,
                replyToMessageId: inbound.isGroup ? (inbound.raw as any)?.message_id?.toString() : undefined,
            }).catch((e) => tenantLog.error({ e }, "Failed to send fallback error message"));
        }
    }
}
