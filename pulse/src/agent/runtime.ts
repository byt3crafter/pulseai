import { InboundMessage, OutboundMessage } from "../channels/types.js";
import { ProviderManager } from "./providers/provider-manager.js";
import { ToolCall, StreamCallbacks } from "./providers/anthropic.js";
import { ToolRegistry } from "./tools/registry.js";
import { workspaceService } from "./workspace/workspace-service.js";
import { getDefaultModel, getProviderByModel } from "./providers/model-registry.js";
import { providerKeyService } from "./providers/provider-key-service.js";
import { memoryService } from "../memory/memory-service.js";
import { autoMemoryService } from "../memory/auto-memory-service.js";
import { getDelegatableAgents, getAgentDelegationConfig } from "./orchestration/agent-registry.js";
import { resolveAgent } from "./orchestration/agent-router.js";
import { getChannelLeadContext } from "../gateway/channel-service.js";
import { getPerson, canAddressAgent } from "../channels/people-service.js";
import { hookRegistry } from "../plugins/hooks.js";
import { buildAgentSystemPrompt, SILENT_REPLY_TOKEN } from "./system-prompt-builder.js";
import { getActiveStandingOrders, formatStandingOrdersForPrompt } from "../standing-orders/standing-order-service.js";
import { ToolPolicy, isToolAllowed } from "./tools/tool-policy.js";
import { ensureToolApproved } from "./tools/approval-gate.js";
import type { PromptMode, DelegatableAgent } from "./system-prompt-builder.js";
import { resolveAgentSkills, formatSkillsForPrompt } from "./skills/skill-loader.js";
import { db } from "../storage/db.js";
import { messages, conversations, usageRecords, tenantBalances, ledgerTransactions, agentProfiles, globalSettings, tenants } from "../storage/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { startRun, finishRun, RunHandle, RunTrigger, bindRunToConversation, unbindRunFromConversation } from "./run-recorder.js";
import { logger } from "../utils/logger.js";
import { sanitizeToolSchema } from "./tools/schema-sanitizer.js";
import {
    parseToolSearchConfig,
    isDeferrable,
    shouldUseToolSearch,
    toolSearchDefinition,
    rankDeferredTools,
    formatSearchResult,
    TOOL_SEARCH_NAME,
} from "./tools/tool-search.js";
import { randomUUID } from "crypto";

const defaultSystemPrompt = `You are a helpful AI assistant. Be professional, friendly, and concise. Respect the user's time and keep responses focused. If you don't know something, say so.`;

interface AutoMemoryConfig {
    enabled: boolean;
    maxMemories: number;
}

function parseAutoMemoryConfig(config: unknown): AutoMemoryConfig {
    const raw = (config && typeof config === "object" ? (config as Record<string, unknown>).auto_memory : undefined);
    const autoMemory = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const enabled = autoMemory.enabled !== false;
    const maxRaw = typeof autoMemory.maxMemories === "number" ? autoMemory.maxMemories : 3;
    const maxMemories = Math.max(0, Math.min(5, Math.floor(maxRaw)));
    return { enabled, maxMemories };
}

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
                parseMode?: string,
                agentProfileId?: string
            ) => Promise<void>;
        }
    ): Promise<void> {
        const tenantLog = logger.child({ tenantId: inbound.tenantId, channel: inbound.channelType });

        // Keystone: open an operational run record for this invocation. Finished
        // in the `finally` below with final status + metrics. Fail-soft — never
        // affects message processing.
        const derivedTrigger: RunTrigger =
            inbound.trigger ??
            (inbound.channelType === "heartbeat" ? "heartbeat"
                : inbound.channelType === "api" ? "api"
                : inbound.channelId ? "channel"
                : "chat");
        const run: RunHandle = await startRun({
            tenantId: inbound.tenantId,
            agentProfileId: inbound.agentProfileId ?? null,
            trigger: derivedTrigger,
            triggerRef: inbound.triggerRef ?? inbound.channelId ?? null,
            parentRunId: inbound.parentRunId ?? null,
            title: (inbound.content || "").trim().slice(0, 120) || null,
            channelType: inbound.channelType,
            channelContactId: inbound.channelContactId,
        });
        let boundConversationId: string | null = null;

        try {
            // 0. Pre-Flight Check: Verify tenant has sufficient credits.
            // Skipped entirely in self-hosted / "unlimited" billing mode — used for
            // dedicated client deployments running on the client's own API keys.
            const rootSettings = await db.query.globalSettings.findFirst({
                where: eq(globalSettings.id, "root"),
            });
            const billingMode = (rootSettings?.config as any)?.billingMode ?? "credits";
            const tenantSettings = await db.query.tenants.findFirst({
                where: eq(tenants.id, inbound.tenantId),
                columns: { config: true },
            });
            const autoMemoryConfig = parseAutoMemoryConfig(tenantSettings?.config);

            if (billingMode !== "unlimited") {
                const balanceRecord = await db.query.tenantBalances.findFirst({
                    where: eq(tenantBalances.tenantId, inbound.tenantId),
                });

                const currentBalance = balanceRecord?.balance ? parseFloat(balanceRecord.balance as string) : 0;
                if (currentBalance <= 0) {
                    tenantLog.warn({ currentBalance }, "Message rejected due to insufficient credits");
                    await sendMessageCallback({
                        conversationId: randomUUID(), // Fallback conversation string
                        tenantId: inbound.tenantId,
                        agentProfileId: inbound.agentProfileId,
                        channelType: inbound.channelType,
                        channelContactId: inbound.channelContactId,
                        content: "Your account has insufficient credits to process this message. Please top up your balance in the dashboard.",
                    });
                    return;
                }
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

            // Bind the run to this conversation so a Codex agent's tool calls
            // (which execute out in the MCP operator bridge, not this loop) get
            // attributed back to this run. Unbound in the finally below.
            boundConversationId = conversation.id;
            bindRunToConversation(conversation.id, run);

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
                // Org-channel attribution (null for legacy 1:1 threads)
                channelId: inbound.channelId ?? null,
                senderType: inbound.channelId ? "human" : null,
                senderUserId: inbound.channelId ? (inbound.senderUserId ?? null) : null,
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

            // 3.5. Resolve agentProfileId via routing rules (or channel default / tenant fallback).
            // For org-channel messages the responder is pre-resolved (lead or @mentioned agent),
            // so we honor it directly and bypass tenant routing rules.
            let resolvedAgentProfileId = inbound.channelId && inbound.agentProfileId
                ? inbound.agentProfileId
                : await resolveAgent(inbound);
            if (!resolvedAgentProfileId) {
                const fallbackProfile = await db.query.agentProfiles.findFirst({
                    where: and(eq(agentProfiles.tenantId, inbound.tenantId), eq(agentProfiles.enabled, true)),
                });
                if (fallbackProfile) {
                    resolvedAgentProfileId = fallbackProfile.id;
                    tenantLog.warn({ agentProfileId: resolvedAgentProfileId }, "No routing rule matched, using tenant fallback");
                }
            }

            // 3.55. People access control (Telegram-only, Stage 1): the adapter already
            // filters out "blocked"/"observe" senders before a message ever reaches the
            // queue/runtime. What the adapter *can't* know in advance is which agent a
            // tenant-wide default bot will route to (that's decided above, by
            // resolveAgent/the tenant fallback) — so this is the one check that has to
            // live here rather than in the adapter: does this "talk"-access person have
            // permission to address the agent that was just resolved?
            if (inbound.channelType === "telegram" && resolvedAgentProfileId) {
                const telegramUserId = inbound.isGroup ? inbound.senderUserId : inbound.channelContactId;
                if (telegramUserId) {
                    const person = await getPerson(inbound.tenantId, telegramUserId);
                    if (person && person.access !== "talk") {
                        // Defense in depth — should not normally trigger since the adapter
                        // already stops blocked/observe senders before dispatch.
                        tenantLog.info({ access: person.access }, "Person lacks talk access — dropping message");
                        return;
                    }
                    if (person && !canAddressAgent(person, resolvedAgentProfileId)) {
                        const targetProfile = await db.query.agentProfiles.findFirst({
                            where: eq(agentProfiles.id, resolvedAgentProfileId),
                            columns: { name: true },
                        });
                        await sendMessageCallback({
                            conversationId: conversation.id,
                            tenantId: inbound.tenantId,
                            agentProfileId: resolvedAgentProfileId,
                            channelType: inbound.channelType,
                            channelContactId: inbound.channelContactId,
                            content: `You don't have access to ${targetProfile?.name ?? "this agent"} here.`,
                        });
                        return;
                    }
                }
            }

            // 3.6. Get enabled tools for tenant and agent profile
            const enabledTools = await this.toolRegistry.getEnabledTools(inbound.tenantId, resolvedAgentProfileId ?? undefined);

            // 3.65 Channel lead routing: if this responder is the LEAD of the channel, it can
            // route work to its teammates (delegate_to_agent) and to other departments
            // (route_to_channel). Load context and ensure the routing tools are available
            // even if the tenant hasn't enabled them as skills.
            let channelTeammates: { id: string; name: string; specialization: string; modelId: string }[] = [];
            let routableChannels: { name: string; description: string | null }[] = [];
            if (inbound.channelId && resolvedAgentProfileId) {
                try {
                    const ctx = await getChannelLeadContext(inbound.tenantId, inbound.channelId, resolvedAgentProfileId);
                    if (ctx.isLead) {
                        channelTeammates = ctx.teammates;
                        routableChannels = ctx.routable.map((c) => ({ name: c.name, description: c.description }));
                        // Respect the agent's Tool Policy: a lead-injected routing tool
                        // must still honor an explicit Deny (an allow-list, if set, must
                        // permit it) — otherwise `deny: ["delegate_to_agent"]` is silently
                        // overridden for channel leads.
                        const leadProfile = await db.query.agentProfiles.findFirst({
                            where: eq(agentProfiles.id, resolvedAgentProfileId),
                            columns: { toolPolicy: true },
                        });
                        const leadPolicy = (leadProfile?.toolPolicy as ToolPolicy) || null;
                        const toolsToAdd = ["delegate_to_agent", "list_agents"];
                        if (routableChannels.length > 0) toolsToAdd.push("route_to_channel");
                        for (const name of toolsToAdd) {
                            if (!isToolAllowed(leadPolicy, name)) continue;
                            if (!enabledTools.some((t) => t.name === name)) {
                                const tool = this.toolRegistry.getBuiltInTool(name);
                                if (tool) enabledTools.push(tool);
                            }
                        }
                    }
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to load channel lead context (non-fatal)");
                }
            }

            const toolDefinitions = enabledTools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: sanitizeToolSchema(t.name, structuredClone(t.parameters)),
            }));

            // 3.7 Tool Search (progressive disclosure): when enabled and there are
            // enough extension tools, send only core tool schemas + a `tool_search`
            // meta-tool up front. Extension tools (plugins/MCP/custom/server) are
            // revealed on demand when the agent searches. Per-tenant, backward-compatible.
            const toolSearchCfg = parseToolSearchConfig(tenantSettings?.config);
            const deferrableTools = enabledTools.filter(isDeferrable);
            const toolSearchActive = shouldUseToolSearch(toolSearchCfg, deferrableTools.length);
            const defByName = new Map(toolDefinitions.map((d) => [d.name, d]));
            const deferredNames = new Set(deferrableTools.map((t) => t.name));
            const revealedNames = new Set<string>();
            const buildActiveDefs = () => {
                if (!toolSearchActive) return toolDefinitions;
                const core = toolDefinitions.filter((d) => !deferredNames.has(d.name));
                const revealed = Array.from(revealedNames)
                    .map((n) => defByName.get(n))
                    .filter((d): d is (typeof toolDefinitions)[number] => Boolean(d));
                return [...core, toolSearchDefinition(), ...revealed];
            };
            let activeToolDefinitions = buildActiveDefs();

            tenantLog.debug(
                {
                    toolCount: enabledTools.length,
                    tools: enabledTools.map((t) => t.name),
                    toolSearch: toolSearchActive ? { mode: toolSearchCfg.mode, deferred: deferrableTools.length } : "off",
                },
                "Loaded enabled tools for tenant"
            );

            // 3.75 Resolve per-agent model and system prompt (workspace-first, DB fallback)
            let basePrompt = defaultSystemPrompt;
            let activeModelId = getDefaultModel().id;
            let activeAgentName = "Agent";
            // Per-agent progress verbosity: "off" | "progress" (default) | "verbose".
            let activeProgressVerbosity = "progress";
            // Per-agent reasoning effort override (Codex/GPT-5.5 etc.). Undefined
            // means "let the provider use its own default" — never send a bogus value.
            let activeReasoningEffort: string | undefined = undefined;
            // Per-agent Tool Policy — used to gate "ask" tools behind human approval.
            let agentToolPolicy: ToolPolicy | null = null;
            // Determine prompt mode — delegated calls use minimal mode
            const promptMode: PromptMode = inbound.channelType === "heartbeat" ? "minimal" : "full";

            if (resolvedAgentProfileId) {
                // Scope by tenant: resolvedAgentProfileId can originate from a
                // caller-supplied value (e.g. /api/app/chat body), so an id from
                // another tenant must never load that tenant's profile/persona.
                const profile = await db.query.agentProfiles.findFirst({
                    where: and(
                        eq(agentProfiles.id, resolvedAgentProfileId),
                        eq(agentProfiles.tenantId, inbound.tenantId)
                    )
                });

                // Disabled agents are paused — they don't respond or route.
                if (profile && profile.enabled === false) {
                    tenantLog.info({ agentProfileId: resolvedAgentProfileId }, "Resolved agent is disabled — not responding");
                    return;
                }

                if (profile) {
                    agentToolPolicy = (profile.toolPolicy as ToolPolicy) || null;
                    // Use per-agent model if set
                    if (profile.modelId) {
                        activeModelId = profile.modelId;
                    }
                    if (profile.name) activeAgentName = profile.name;
                    if (profile.progressVerbosity) activeProgressVerbosity = profile.progressVerbosity;

                    // Use per-agent reasoning effort if set (null/absent = inherit default)
                    if (profile.reasoningEffort) {
                        activeReasoningEffort = profile.reasoningEffort;
                    }

                    // Try workspace prompt first, fall back to DB systemPrompt
                    const workspacePrompt = await workspaceService.buildSystemPrompt(
                        inbound.tenantId,
                        resolvedAgentProfileId
                    );

                    if (workspacePrompt) {
                        basePrompt = workspacePrompt;
                    } else if (profile.systemPrompt) {
                        basePrompt = profile.systemPrompt;
                    }
                }
            }

            tenantLog.info({ model: activeModelId, agentProfileId: resolvedAgentProfileId ?? "none", promptMode }, "Model resolved for request");

            // 3.8 Gather all context for the system prompt builder
            let relevantMemories: string | undefined;
            if (resolvedAgentProfileId) {
                try {
                    const memoryContext = await memoryService.getRelevantContext(
                        inbound.tenantId, resolvedAgentProfileId, inbound.content, 5
                    );
                    if (memoryContext) {
                        relevantMemories = memoryContext;
                    }
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to retrieve memory context (non-fatal)");
                }
            }

            // 3.85 Gather delegation context
            let delegationActive = false;
            let availableAgents: DelegatableAgent[] = [];
            if (channelTeammates.length > 0) {
                // Channel lead: its teammates are the delegation set (org routing).
                delegationActive = true;
                availableAgents = channelTeammates.map((t) => ({
                    id: t.id, name: t.name, specialization: t.specialization, modelId: t.modelId,
                }));
            } else if (resolvedAgentProfileId) {
                try {
                    const delConfig = await getAgentDelegationConfig(resolvedAgentProfileId);
                    if (delConfig.canDelegate) {
                        const agents = await getDelegatableAgents(inbound.tenantId, resolvedAgentProfileId);
                        if (agents.length > 0) {
                            delegationActive = true;
                            availableAgents = agents;
                        }
                    }
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to gather delegation context (non-fatal)");
                }
            }

            // 3.86 Gather workspace context files (TOOLS.md, USER.md)
            let toolsGuidance: string | undefined;
            let userPreferences: string | undefined;
            if (resolvedAgentProfileId) {
                try {
                    toolsGuidance = (await workspaceService.readToolsGuidance(inbound.tenantId, resolvedAgentProfileId)) ?? undefined;
                    userPreferences = (await workspaceService.readUserPreferences(inbound.tenantId, resolvedAgentProfileId)) ?? undefined;
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to read workspace context files (non-fatal)");
                }
            }

            // 3.865 Resolve agent skills (detailed tool usage guidance)
            let skillsContent: string | undefined;
            if (resolvedAgentProfileId) {
                try {
                    const skills = await resolveAgentSkills(inbound.tenantId, resolvedAgentProfileId);
                    if (skills.length > 0) {
                        skillsContent = formatSkillsForPrompt(skills);
                        tenantLog.debug({ skillCount: skills.length, skills: skills.map(s => s.name) }, "Resolved agent skills");
                    }
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to resolve agent skills (non-fatal)");
                }
            }

            // 3.87 Check if memory tools are available
            const hasMemoryTools = enabledTools.some(
                (t) => t.name === "memory_store" || t.name === "memory_search"
            );

            // 3.88 Build the complete system prompt via the builder
            let activeSystemPrompt = buildAgentSystemPrompt({
                basePrompt,
                enabledTools: enabledTools.map((t) => ({ name: t.name, description: t.description })),
                agentProfileId: resolvedAgentProfileId ?? undefined,
                modelId: activeModelId,
                channelType: inbound.channelType,
                relevantMemories,
                hasMemoryTools,
                delegationActive,
                availableAgents,
                toolsGuidance,
                userPreferences,
                skills: skillsContent,
                promptMode,
                contactName: inbound.contactName,
                senderUsername: inbound.senderUsername,
                isGroup: inbound.isGroup,
                groupTitle: inbound.groupTitle,
                routableChannels,
            });

            // 3.885 If self-editing is enabled, state it explicitly. Models otherwise
            // falsely claim they "have no filesystem access" and refuse — especially
            // when older conversation turns (from before the tool existed) say so.
            // On the codex provider the tool arrives via the "pulse" MCP server
            // (operator bridge), so use MCP wording there.
            if (enabledTools.some((t) => t.name === "workspace_update")) {
                const viaCodex = getProviderByModel(activeModelId)?.id === "codex";
                activeSystemPrompt +=
                    "\n\n## Editing your own workspace (IMPORTANT)\n" +
                    (viaCodex
                        ? "You DO have a `workspace_update` tool available RIGHT NOW via the `pulse` MCP server (check your MCP tools). "
                        : "You DO have a `workspace_update` tool right now. ") +
                    "You CAN edit your own workspace files: " +
                    "SOUL.md, IDENTITY.md, MEMORY.md, HEARTBEAT.md, TOOLS.md, USER.md, AGENTS.md, BOOTSTRAP.md. " +
                    "When the user asks you to update your workspace, personality, identity, memory, or instructions, " +
                    "actually CALL `workspace_update` with the full new file content — do not just acknowledge. " +
                    "NEVER tell the user you lack filesystem access or that the tool isn't available: you have it. " +
                    "Ignore any earlier claims in this conversation that the tool is unavailable — those predate your current toolset. " +
                    "Only confirm the change after the tool call returns successfully.";
            }

            // 3.886 If the agent has dedicated email tools, force it to use them.
            // Otherwise (esp. on slow Codex turns) it tries to operate webmail
            // through the browser tools — clicking Compose, filling the To field —
            // which is dramatically slower and blows the turn timeout.
            if (enabledTools.some((t) => t.name === "email_send")) {
                activeSystemPrompt +=
                    "\n\n## Sending & reading email (IMPORTANT)\n" +
                    "To send email, ALWAYS call the `email_send` tool with {to, subject, body}. " +
                    "To read or list email, use `email_read` / `email_list`. " +
                    "NEVER operate a webmail site (SOGo, Gmail, Outlook) through the browser tools to send or read mail — " +
                    "that is slow, error-prone, and will time out. The email tools talk to your mailbox directly over SMTP/IMAP.";
            }

            // 3.887 Inject the agent's standing orders (per-agent operating programs).
            // These run the routine autonomously and escalate exceptions.
            if (resolvedAgentProfileId) {
                try {
                    const orders = await getActiveStandingOrders(inbound.tenantId, resolvedAgentProfileId);
                    const section = formatStandingOrdersForPrompt(orders);
                    if (section) activeSystemPrompt += section;
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to inject standing orders (non-fatal)");
                }
            }

            // 3.89 Run before-prompt-build plugin hooks (plugins can append/modify)
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

            // 3.9 Pre-Flight: Verify an AI provider key exists before calling the LLM.
            // "codex" is keyless — it authenticates via the local Codex CLI (CODEX_HOME
            // / ChatGPT subscription), so it's exempt from the API-key requirement.
            const providerDef = getProviderByModel(activeModelId);
            const providerId = providerDef?.id ?? "anthropic";
            const keylessProvider = providerId === "codex";
            const resolvedKey = keylessProvider ? null : await providerKeyService.resolveKey(inbound.tenantId, providerId);

            if (!resolvedKey && !keylessProvider) {
                tenantLog.warn({ model: activeModelId, provider: providerId }, "No AI provider key configured");
                await sendMessageCallback({
                    conversationId: conversation.id,
                    tenantId: inbound.tenantId,
                    agentProfileId: resolvedAgentProfileId ?? inbound.agentProfileId,
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
                                streamAccumulated + " ...",
                                undefined,
                                resolvedAgentProfileId ?? undefined
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
                    agentProfileId: resolvedAgentProfileId ?? inbound.agentProfileId,
                    channelType: inbound.channelType,
                    channelContactId: inbound.channelContactId,
                    content: "...",
                    replyToMessageId: inbound.isGroup ? (inbound.raw as any)?.message_id?.toString() : undefined,
                });
                streamMessageId = placeholder.channelMessageId;
                lastEditTime = Date.now();
            }

            // Progress streaming for TOOL turns (text streaming above only fires
            // for tool-less turns). While the agent works through a long,
            // otherwise-silent operation (e.g. cOrtex running server commands),
            // show a live "working…" status the human can watch — like
            // OpenClaw/Hermes. The final reply replaces it; a silent turn just
            // leaves the last status. Only for channels that support edits.
            let progressMsgId: string | null = null;
            const progressSteps: string[] = [];
            let progressStepCount = 0;
            let lastProgressEdit = 0;
            let progressSending = false;
            const PROGRESS_THROTTLE_MS = 2500;
            const agentDisplayName = activeAgentName || "Agent";
            const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const spinnerFrames = ["◐", "◓", "◑", "◒"];
            const renderProgress = () => {
                const frame = spinnerFrames[progressStepCount % spinnerFrames.length];
                const shown = progressSteps.slice(-7);
                const hidden = progressSteps.length - shown.length;
                const lines = shown.map((l) => `<code>❯ ${escHtml(l)}</code>`);
                const head = `${frame} <b>${escHtml(agentDisplayName)}</b> <i>working…</i>`;
                const more = hidden > 0 ? `\n<i>…+${hidden} earlier</i>` : "";
                return `${head}\n\n${lines.join("\n")}${more}`;
            };
            let onProgress: ((text: string) => void) | undefined;
            if (options?.editMessageCallback && toolDefinitions.length > 0 && activeProgressVerbosity !== "off") {
                onProgress = (text: string) => {
                    // De-dupe consecutive identical steps.
                    if (progressSteps[progressSteps.length - 1] !== text) {
                        progressSteps.push(text);
                        progressStepCount++;
                    }
                    const now = Date.now();
                    if (now - lastProgressEdit < PROGRESS_THROTTLE_MS || progressSending) return;
                    lastProgressEdit = now;
                    const body = renderProgress();
                    if (!progressMsgId) {
                        progressSending = true;
                        sendMessageCallback({
                            conversationId: conversation.id,
                            tenantId: inbound.tenantId,
                            agentProfileId: resolvedAgentProfileId ?? inbound.agentProfileId,
                            channelType: inbound.channelType,
                            channelContactId: inbound.channelContactId,
                            content: body,
                            format: "html",
                        }).then((r) => { progressMsgId = r.channelMessageId; }).catch(() => {}).finally(() => { progressSending = false; });
                    } else {
                        options.editMessageCallback!(
                            inbound.tenantId, inbound.channelContactId, progressMsgId, body,
                            "html", resolvedAgentProfileId ?? undefined,
                        ).catch(() => {});
                    }
                };
            }

            let llmResponse = await this.providerManager.chat({
                agentProfileId: resolvedAgentProfileId ?? undefined,
                conversationId: conversation.id,
                model: activeModelId,
                tenantId: inbound.tenantId,
                onProgress,
                progressVerbosity: activeProgressVerbosity,
                systemPrompt: activeSystemPrompt,
                messages: llmMessages,
                tools: activeToolDefinitions.length > 0 ? activeToolDefinitions : undefined,
                stream: streamCallbacks,
                attachments: inbound.attachments,
                reasoningEffort: activeReasoningEffort,
            });

            // 4.5. Handle tool calls in a loop (support multi-turn tool use)
            let toolUseCount = 0;
            // Higher limit when delegation is active; +2 when Tool Search is on so
            // the search step(s) don't eat into the real tool-use budget.
            const maxToolIterations = (delegationActive ? 10 : 5) + (toolSearchActive ? 2 : 0);
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

                        // Tool Search meta-tool: reveal matching deferred tools so the
                        // model can call them on the next turn. Handled inline (it's not
                        // a registered tool — it manipulates which schemas are exposed).
                        if (toolSearchActive && toolCall.name === TOOL_SEARCH_NAME) {
                            const query = String((toolCall.input as any)?.query ?? "");
                            const { matches, total } = rankDeferredTools(deferrableTools, query, toolSearchCfg.maxResults);
                            for (const m of matches) revealedNames.add(m.name);
                            tenantLog.debug(
                                { query, revealed: matches.map((m) => m.name) },
                                "tool_search revealed tools"
                            );
                            return {
                                type: "tool_result" as const,
                                tool_use_id: toolCall.id,
                                content: formatSearchResult(matches, total, query),
                            };
                        }

                        // Hard approval gate (shared with the Codex MCP path): if this
                        // tool is marked "ask", block until an approver decides.
                        const gate = await ensureToolApproved({
                            tenantId: inbound.tenantId,
                            agentProfileId: resolvedAgentProfileId ?? null,
                            toolName: toolCall.name,
                            args: (toolCall.input as Record<string, any>) || {},
                            channelType: inbound.channelType,
                            channelContactId: inbound.channelContactId,
                            policy: agentToolPolicy,
                            agentName: activeAgentName,
                        });
                        if (!gate.ok) {
                            return {
                                type: "tool_result" as const,
                                tool_use_id: toolCall.id,
                                content: gate.message,
                            };
                        }

                        const tool = enabledTools.find(t => t.name === toolCall.name);
                        let result: { result: string; metadata?: any };

                        if (!tool) {
                            tenantLog.warn({ toolName: toolCall.name }, "Attempted to execute unknown tool");
                            result = { result: `Error: Tool '${toolCall.name}' not found` };
                        } else {
                            const toolStart = Date.now();
                            try {
                                // Inject _agentId so tools can identify the calling agent
                                const toolArgs = { ...(toolCall.input as Record<string, any>) };
                                if (resolvedAgentProfileId) {
                                    toolArgs._agentId = resolvedAgentProfileId;
                                }
                                result = await tool.execute({
                                    tenantId: inbound.tenantId,
                                    conversationId: conversation.id,
                                    args: toolArgs,
                                });
                                run.addToolCall(toolCall.name, true, Date.now() - toolStart);
                            } catch (err: any) {
                                tenantLog.error({ err, toolName: toolCall.name }, "Tool execution failed");
                                result = { result: `Error executing tool '${toolCall.name}': ${err.message || "Unknown error"}` };
                                run.addToolCall(toolCall.name, false, Date.now() - toolStart);
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

                // Rebuild active tool schemas — a tool_search this round may have
                // revealed new tools that must be callable on the next turn.
                if (toolSearchActive) activeToolDefinitions = buildActiveDefs();

                // Call LLM with tool results — same model + tenant routing
                llmResponse = await this.providerManager.chat({
                    agentProfileId: resolvedAgentProfileId ?? undefined,
                    conversationId: conversation.id,
                    model: activeModelId,
                    tenantId: inbound.tenantId,
                    systemPrompt: activeSystemPrompt,
                    messages: [
                        ...llmMessages,
                        assistantMessage as any,
                        toolResultMessage as any,
                    ],
                    tools: activeToolDefinitions.length > 0 ? activeToolDefinitions : undefined,
                    attachments: inbound.attachments,
                    reasoningEffort: activeReasoningEffort,
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

            // 4.55 Strip chain-of-thought — reasoning models (e.g. MiniMax M2.5) emit
            // <think>…</think> in the content; never surface it to users or persist it.
            llmResponse.content = llmResponse.content
                .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")  // paired blocks
                .replace(/<\/?think(?:ing)?>/gi, "")                          // stray tags
                .trim();

            // 4.6 Check for silent reply token — suppress empty/ack responses
            const isSilentReply = llmResponse.content.trim() === SILENT_REPLY_TOKEN;

            // 5. Store LLM Assistant response in Database (skip silent replies)
            if (!isSilentReply) {
                await db.insert(messages).values({
                    conversationId: conversation.id,
                    tenantId: inbound.tenantId,
                    role: "assistant",
                    content: llmResponse.content,
                    // Attribute the reply to the responding agent in a shared channel thread
                    channelId: inbound.channelId ?? null,
                    senderType: inbound.channelId ? "agent" : null,
                    senderAgentId: inbound.channelId ? (resolvedAgentProfileId ?? null) : null,
                });
            }

            // Bump the conversation's updatedAt so "Last Updated" reflects real
            // activity (not just creation) and threads sort by recency.
            await db.update(conversations)
                .set({ updatedAt: new Date() })
                .where(eq(conversations.id, conversation.id));

            // Auto-memory runs in the BACKGROUND (fire-and-forget) so its extra
            // extraction LLM call never delays the user's reply. It bills its own
            // usage in a separate record rather than the main turn's.
            if (!isSilentReply && autoMemoryConfig.enabled && resolvedAgentProfileId && inbound.channelType !== "heartbeat") {
                const amAgentId = resolvedAgentProfileId;
                const amModel = activeModelId;
                const amProvider = llmResponse.provider;
                const amUser = inbound.content;
                const amAssistant = llmResponse.content;
                const amTenantId = inbound.tenantId;
                const amConversationId = conversation.id;
                void (async () => {
                    try {
                        const r = await autoMemoryService.captureTurn({
                            tenantId: amTenantId,
                            agentId: amAgentId,
                            model: amModel,
                            userMessage: amUser,
                            assistantMessage: amAssistant,
                            maxMemories: autoMemoryConfig.maxMemories,
                        });
                        if (r.storedCount > 0) {
                            tenantLog.info({ storedCount: r.storedCount }, "Auto-memory stored extracted memories");
                        }
                        const amTokens = r.usage.inputTokens + r.usage.outputTokens;
                        if (amTokens > 0) {
                            const p = await this.providerManager.getPricing(amModel, amProvider);
                            const base = (r.usage.inputTokens * p.baseInput + r.usage.outputTokens * p.baseOutput) / 1_000_000;
                            const cost = (r.usage.inputTokens * p.customerInput + r.usage.outputTokens * p.customerOutput) / 1_000_000;
                            const credits = cost * 100;
                            await db.transaction(async (tx) => {
                                const [rec] = await tx.insert(usageRecords).values({
                                    tenantId: amTenantId,
                                    conversationId: amConversationId,
                                    model: amModel,
                                    inputTokens: r.usage.inputTokens.toString(),
                                    outputTokens: r.usage.outputTokens.toString(),
                                    costUsd: cost.toFixed(6),
                                    baseCostUsd: base.toFixed(6),
                                    creditsUsed: credits.toFixed(4),
                                }).returning();
                                await tx.execute(sql`UPDATE tenant_balances SET balance = balance - ${credits}, updated_at = NOW() WHERE tenant_id = ${amTenantId}`);
                                await tx.insert(ledgerTransactions).values({
                                    tenantId: amTenantId,
                                    amount: (-credits).toFixed(4),
                                    type: "usage",
                                    description: `${amProvider}/${amModel} (auto-memory)`,
                                    referenceId: rec.id,
                                });
                            });
                        }
                    } catch (err) {
                        tenantLog.warn({ err }, "Auto-memory background capture failed");
                    }
                })();
            }

            // 6. Record Cost/Usage for Billing Tracking
            // Use canonical model ID (from our registry) for accurate pricing
            const usedModel = llmResponse.canonicalModel;
            const pricing = await this.providerManager.getPricing(usedModel, llmResponse.provider);

            // Base cost = real provider cost (what we pay)
            const baseCostUsd =
                (llmResponse.usage.inputTokens * pricing.baseInput) / 1000000 +
                (llmResponse.usage.outputTokens * pricing.baseOutput) / 1000000;

            // Customer cost = what we charge (includes markup)
            const costUsd =
                (llmResponse.usage.inputTokens * pricing.customerInput) / 1000000 +
                (llmResponse.usage.outputTokens * pricing.customerOutput) / 1000000;

            const creditsUsed = costUsd * 100; // 1 credit = $0.01

            // Keystone: snapshot the run's operational metrics.
            run.setAgent(resolvedAgentProfileId ?? inbound.agentProfileId);
            run.setUsage(usedModel, llmResponse.usage.inputTokens, llmResponse.usage.outputTokens, costUsd);

            tenantLog.info(
                {
                    provider: llmResponse.provider,
                    requestedModel: activeModelId,
                    usedModel,
                    wasFallback: llmResponse.wasFallback,
                    inputTokens: llmResponse.usage.inputTokens,
                    outputTokens: llmResponse.usage.outputTokens,
                    baseCostUsd: baseCostUsd.toFixed(6),
                    costUsd: costUsd.toFixed(6),
                    creditsUsed: creditsUsed.toFixed(4),
                    profit: (costUsd - baseCostUsd).toFixed(6),
                },
                "Usage calculated"
            );

            // Record canonical model ID (matches registry) with provider prefix for clarity
            // Wrap usage + balance + ledger in a transaction to prevent race conditions
            await db.transaction(async (tx) => {
                const [usageRecord] = await tx.insert(usageRecords).values({
                    tenantId: inbound.tenantId,
                    conversationId: conversation.id,
                    model: usedModel,
                    inputTokens: llmResponse.usage.inputTokens.toString(),
                    outputTokens: llmResponse.usage.outputTokens.toString(),
                    costUsd: costUsd.toFixed(6),
                    baseCostUsd: baseCostUsd.toFixed(6),
                    creditsUsed: creditsUsed.toFixed(4),
                }).returning();

                // 6.b Deduct from Balance with row-level lock and Record Ledger
                await tx.execute(
                    sql`UPDATE tenant_balances SET balance = balance - ${creditsUsed}, updated_at = NOW() WHERE tenant_id = ${inbound.tenantId}`
                );

                await tx.insert(ledgerTransactions).values({
                    tenantId: inbound.tenantId,
                    amount: (-creditsUsed).toFixed(4),
                    type: "usage",
                    description: `${llmResponse.provider}/${usedModel}${llmResponse.wasFallback ? " (fallback)" : ""}`,
                    referenceId: usageRecord.id,
                });
            });

            // 7. Dispatch Response to Channel Adapter (skip silent replies)
            if (isSilentReply) {
                tenantLog.debug("Silent reply token detected — suppressing response");
            } else if (streamMessageId && options?.editMessageCallback) {
                // Streaming was active — do final edit with fully formatted content
                await options.editMessageCallback(
                    inbound.tenantId,
                    inbound.channelContactId,
                    streamMessageId,
                    llmResponse.content,
                    "markdown",
                    resolvedAgentProfileId ?? undefined
                ).catch((e) => tenantLog.error({ e }, "Failed final streaming edit"));
            } else {
                const outbound: OutboundMessage = {
                    conversationId: conversation.id,
                    tenantId: inbound.tenantId,
                    agentProfileId: resolvedAgentProfileId ?? inbound.agentProfileId,
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
            run.setError(err?.message || String(err));

            // Provide actionable, correctly-classified error messages. When the provider
            // manager returns an aggregate ("All LLM providers failed. Primary (X): ..."),
            // classify on the PRIMARY provider's real cause so we don't mislabel (e.g. a
            // Google quota 429 was being reported as an auth failure).
            const errMsg = err?.message || "";
            const primaryMatch = errMsg.match(/Primary \(([^)]+)\):\s*(.*?)(?:,\s*Fallback|$)/i);
            const primaryProvider = primaryMatch ? primaryMatch[1].toLowerCase() : "";
            const cause = ((primaryMatch ? primaryMatch[2] : errMsg) + " " + errMsg).toLowerCase();
            const isGemini = primaryProvider === "google" || /google|gemini/.test(cause);

            let userMessage: string;
            if (/quota|billing|resource_exhausted|free_tier|insufficient|exceeded your current quota|add credits/.test(cause)
                || (isGemini && /429/.test(cause))) {
                // Gemini's 429 is a plan/quota limit (its quota detail sits in a body the
                // OpenAI SDK can't parse), so treat a Google 429 as quota/billing, not transient.
                userMessage = "Your AI provider hit a quota or billing limit. Enable billing on the key (or top up), then try again — Settings → AI Providers.";
            } else if (/permission_denied|status\D*403|denied access|not supported when|not enabled|access is denied|is not supported for/.test(cause)) {
                userMessage = "Your AI provider denied access for this model or account — often a region or plan restriction. Try a different model or key in Settings → AI Providers.";
            } else if (/429|rate.?limit/.test(cause)) {
                userMessage = "AI rate limit reached. Please wait a moment and try again.";
            } else if (/401|unauthorized|invalid.?api.?key|invalid x-api-key|authentication|api key.*(invalid|expired)|token.*expired/.test(cause)) {
                userMessage = "AI authentication failed — the API key looks invalid or expired. Update it in Settings → AI Providers.";
            } else if (/timeout|timed out|econnrefused|enotfound|network|fetch failed/.test(cause)) {
                userMessage = "Couldn't reach the AI provider (network or timeout). Please try again.";
            } else if (errMsg.includes("All LLM providers failed") || errMsg.includes("No fallback available")) {
                userMessage = `AI service error: ${errMsg.substring(0, 180)}. Check your provider keys in Settings → AI Providers.`;
            } else {
                userMessage = "I encountered an error processing your request. Please try again or contact your administrator if this persists.";
            }

            await sendMessageCallback({
                conversationId: randomUUID(),
                tenantId: inbound.tenantId,
                agentProfileId: inbound.agentProfileId,
                channelType: inbound.channelType,
                channelContactId: inbound.channelContactId,
                content: userMessage,
                replyToMessageId: inbound.isGroup ? (inbound.raw as any)?.message_id?.toString() : undefined,
            }).catch((e) => tenantLog.error({ e }, "Failed to send fallback error message"));
        } finally {
            // Keystone: close the operational run record with its final state.
            unbindRunFromConversation(boundConversationId);
            await finishRun(run);
        }
    }

    /**
     * Run a single tool out-of-band after a human approved a gated call. Loads the
     * agent's current toolset, finds the tool, executes it. Used by the approval
     * flow so a queued action runs whenever the operator taps Allow (even later).
     */
    async executeApprovedTool(params: {
        tenantId: string;
        agentId: string | null;
        toolName: string;
        args: Record<string, any>;
    }): Promise<string> {
        const tools = await this.toolRegistry.getEnabledTools(params.tenantId, params.agentId ?? undefined);
        const tool = tools.find((t) => t.name === params.toolName);
        if (!tool) throw new Error(`Tool '${params.toolName}' is no longer available for this agent`);
        const args: Record<string, any> = { ...params.args };
        if (params.agentId) args._agentId = params.agentId;
        const out = await tool.execute({
            tenantId: params.tenantId,
            conversationId: randomUUID(),
            args,
        });
        return out.result;
    }
}
