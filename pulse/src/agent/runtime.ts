import { InboundMessage, OutboundMessage } from "../channels/types.js";
import { ProviderManager } from "./providers/provider-manager.js";
import { ToolCall } from "./providers/anthropic.js";
import { ToolRegistry } from "./tools/registry.js";
import { db } from "../storage/db.js";
import { messages, conversations, usageRecords, tenantBalances, ledgerTransactions, globalSettings } from "../storage/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

const defaultSystemPrompt = `You are a helpful AI assistant. Be professional, friendly, and concise. Respect the user's time and keep responses focused. If you don't know something, say so.`;

export class AgentRuntime {
    private providerManager = new ProviderManager();
    private toolRegistry = new ToolRegistry();

    async processMessage(
        inbound: InboundMessage,
        sendMessageCallback: (msg: OutboundMessage) => Promise<{ channelMessageId: string }>
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
            await db.insert(messages).values({
                conversationId: conversation.id,
                tenantId: inbound.tenantId,
                role: "user",
                content: inbound.content,
                metadata: { receivedAt: inbound.receivedAt },
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

            // 3.5. Get enabled tools for tenant
            const enabledTools = await this.toolRegistry.getEnabledTools(inbound.tenantId);
            const toolDefinitions = enabledTools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
            }));

            tenantLog.debug(
                { toolCount: enabledTools.length, tools: enabledTools.map((t) => t.name) },
                "Loaded enabled tools for tenant"
            );

            // 3.75 Fecth dynamic Provider API Keys from Postgres Settings
            const rootSettings = await db.query.globalSettings.findFirst({
                where: eq(globalSettings.id, "root")
            });

            // 4. Call LLM with tools (with automatic fallback)
            // TODO: Fetch custom System Prompt and Custom API key from Tenant DB records.
            tenantLog.debug("Dispatching to LLM Provider");
            let llmResponse = await this.providerManager.chat({
                model: "claude-3-7-sonnet-20250219",
                systemPrompt: defaultSystemPrompt,
                messages: llmMessages,
                tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                globalAnthropicKey: rootSettings?.anthropicApiKeyHash || undefined,
                globalOpenAIKey: rootSettings?.openaiApiKeyHash || undefined,
            });

            // 4.5. Handle tool calls in a loop (support multi-turn tool use)
            let toolUseCount = 0;
            const maxToolIterations = 5; // Prevent infinite loops
            let totalInputTokens = llmResponse.usage.inputTokens;
            let totalOutputTokens = llmResponse.usage.outputTokens;

            while (llmResponse.toolCalls && llmResponse.toolCalls.length > 0 && toolUseCount < maxToolIterations) {
                toolUseCount++;
                tenantLog.debug(
                    { iteration: toolUseCount, toolCallCount: llmResponse.toolCalls.length },
                    "Processing tool calls"
                );

                const calls = llmResponse.toolCalls as ToolCall[];
                // Execute all tool calls
                const toolResults = await Promise.all(
                    calls.map(async (toolCall: ToolCall) => {
                        tenantLog.debug({ toolCall }, "Executing tool");

                        const result = await this.toolRegistry.executeTool(toolCall.name, {
                            tenantId: inbound.tenantId,
                            conversationId: conversation.id,
                            args: toolCall.input,
                        });

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
                        ...calls.map((tc: ToolCall) => ({
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

                // Call LLM with tool results
                llmResponse = await this.providerManager.chat({
                    model: "claude-3-7-sonnet-20250219",
                    systemPrompt: defaultSystemPrompt,
                    messages: [
                        ...llmMessages,
                        assistantMessage as any,
                        toolResultMessage as any,
                    ],
                    tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                    globalAnthropicKey: rootSettings?.anthropicApiKeyHash || undefined,
                    globalOpenAIKey: rootSettings?.openaiApiKeyHash || undefined,
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
            // Get pricing based on actual provider and model used
            const pricing = this.providerManager.getPricing(llmResponse.model, llmResponse.provider);
            const costUsd =
                (llmResponse.usage.inputTokens * pricing.input) / 1000000 +
                (llmResponse.usage.outputTokens * pricing.output) / 1000000;
            const creditsUsed = costUsd * 100; // 1 credit = $0.01

            tenantLog.info(
                {
                    provider: llmResponse.provider,
                    model: llmResponse.model,
                    inputTokens: llmResponse.usage.inputTokens,
                    outputTokens: llmResponse.usage.outputTokens,
                    costUsd: costUsd.toFixed(6),
                    creditsUsed: creditsUsed.toFixed(4),
                },
                "Usage calculated"
            );

            const [usageRecord] = await db.insert(usageRecords).values({
                tenantId: inbound.tenantId,
                conversationId: conversation.id,
                model: `${llmResponse.provider}:${llmResponse.model}`, // Record provider for transparency
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
                description: `Message generation usage (${llmResponse.model})`,
                referenceId: usageRecord.id,
            });

            // 7. Dispatch Response to Channel Adapter
            await sendMessageCallback({
                conversationId: conversation.id,
                tenantId: inbound.tenantId,
                channelType: inbound.channelType,
                channelContactId: inbound.channelContactId,
                content: llmResponse.content,
                format: "markdown",
            });

        } catch (err) {
            tenantLog.error({ err }, "Agent Runtime failed to process message");
            // Graceful degradation response
            await sendMessageCallback({
                conversationId: randomUUID(), // fallback if conv undefined
                tenantId: inbound.tenantId,
                channelType: inbound.channelType,
                channelContactId: inbound.channelContactId,
                content: "I am currently experiencing technical difficulties processing your request. Please try again later.",
            }).catch((e) => tenantLog.error({ e }, "Failed to send fallback error message"));
        }
    }
}
