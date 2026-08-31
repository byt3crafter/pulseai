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
import { getTenantTimezone } from "./tools/tz-util.js";
import { shouldRunGate, runTruthGate, isErrorResult, type ToolOutcome } from "./truth-gate.js";
import { getActiveStandingOrders, formatStandingOrdersForPrompt } from "../standing-orders/standing-order-service.js";
import { getAgentSkills, formatSkillCatalogue } from "../skills/skill-service.js";
import { checkTenantAccess } from "../billing/tenant-access.js";
import { modelGroups } from "../storage/schema.js";
import { normalizeGroup, orderModelsForTurn } from "./providers/model-group-service.js";
import { ToolPolicy, isToolAllowed } from "./tools/tool-policy.js";
import { ensureToolApproved } from "./tools/approval-gate.js";
import type { PromptMode, DelegatableAgent } from "./system-prompt-builder.js";
import { resolveAgentSkills, formatSkillsForPrompt } from "./skills/skill-loader.js";
import { db } from "../storage/db.js";
import { messages, conversations, usageRecords, tenantBalances, ledgerTransactions, agentProfiles, globalSettings, tenants } from "../storage/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { startRun, finishRun, RunHandle, RunTrigger, bindRunToConversation, unbindRunFromConversation, savePartialContent, PARTIAL_PERSIST_MS } from "./run-recorder.js";
import { emitChatEvent } from "../utils/chat-bus.js";
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
import { getToolUsageScores, topToolsByUsage, getRecentToolNames } from "./tools/tool-usage.js";
import { randomUUID } from "crypto";

const defaultSystemPrompt = `You are a helpful AI assistant. Be professional, friendly, and concise. Respect the user's time and keep responses focused. If you don't know something, say so.`;

/**
 * Smart model routing (industry pattern: cheap heuristic gate, no router-LLM call).
 * Sends a turn to the agent's FAST model only when it's clearly trivial and tool-free;
 * anything with tools, attachments, code/URLs, length, or action/complexity intent goes
 * to the capable model. Biases ambiguous cases UP to capable (safe default) — the top
 * failure mode is sending a tool-needing turn to a weak model. Returns the model id to
 * use plus a short human-readable reason (surfaced for transparency).
 */
export function routeModel(
    text: string,
    opts: { hasTools: boolean; hasAttachments: boolean; capableModel: string; fastModel: string }
): { modelId: string; reason: string } {
    const t = (text || "").trim();
    const cap = (reason: string) => ({ modelId: opts.capableModel, reason: `capable: ${reason}` });
    if (!t) return cap("empty");
    if (opts.hasAttachments) return cap("attachment");
    if (/```|https?:\/\//i.test(t)) return cap("code/url");
    if (t.includes("?")) return cap("a question");

    // WHITELIST routing: only clearly-trivial small talk (any language) goes to the
    // fast model. Everything else — questions, follow-ups ("Explication", "why"),
    // tasks, and anything non-English — stays on the capable model, because a weak
    // model must never handle something that might need tools or prior context.
    // (A keyword blocklist leaked: short/French/ambiguous turns were misrouted and the
    // weak model confabulated. Whitelisting is the safe default.)
    const words = t.split(/\s+/).filter(Boolean).length;
    const TRIVIAL = /^(hi+|hey+|hello+|yo|sup|hiya|thanks?|thank you|thx|ty|okay?|k|kk|cool|nice|great|awesome|perfect|got it|gotcha|noted|understood|yes|no|yep|nope|yeah|bye|goodbye|good ?(morning|afternoon|evening|night|day)|cheers|salut|bonjour|bonsoir|coucou|merci( beaucoup)?|mersi|correc|nickel|super|bien|ok merci|👍|🙏|😊|🎉)[\s.!…]*$/i;
    if (words <= 5 && TRIVIAL.test(t)) return { modelId: opts.fastModel, reason: "fast: greeting/ack" };
    return cap("non-trivial (whitelist)");
}

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

/** Human, present-tense label for a tool call, shown in the live step rows. */
function toolStepLabel(name: string): string {
    const map: Record<string, string> = {
        web_search: "Searching the web",
        web_fetch: "Reading a page",
        email_send: "Sending email", email_reply: "Replying to email", email_draft: "Drafting email",
        email_search: "Searching email", email_read: "Reading email", email_list: "Checking the inbox",
        email_fetch_unread: "Checking unread email",
        contact_lookup: "Looking up a contact", contact_list: "Reading contacts", contact_save: "Saving a contact",
        calendar_add: "Adding a calendar event", calendar_list: "Checking the calendar", calendar_search: "Searching the calendar",
        memory_search: "Recalling memory", memory_store: "Saving to memory",
        note_save: "Saving a note", todo_add: "Adding a to-do", task_create: "Creating a task", task_update: "Updating a task",
        document_search: "Searching documents", document_read: "Reading a document", pdf_read: "Reading a PDF", pdf_fill_form: "Filling a PDF",
        expense_add: "Logging an expense", commitment_create: "Setting a follow-up",
        python_execute: "Running a calculation", exec: "Running a command", bash_sandbox: "Running code",
        schedule_job: "Scheduling a job", notify: "Sending a notification",
        erpnext_create: "Creating in ERPNext", erpnext_update: "Updating ERPNext", erpnext_read: "Reading ERPNext",
        erpnext_list: "Querying ERPNext", erpnext_method: "Calling ERPNext",
        browser_navigate: "Opening a page", browser_click: "Clicking", browser_fill: "Filling a form", browser_extract: "Reading the page",
        server_exec: "Running a server command", server_list: "Listing servers", server_read: "Checking a server",
        pulse_help: "Checking what's set up", activity_log: "Checking the activity log",
        get_current_time: "Checking the time", calculator: "Calculating",
    };
    if (map[name]) return map[name];
    if (name.startsWith("server")) return "Working on a server";
    if (name.startsWith("erpnext")) return "Working in ERPNext";
    if (name.startsWith("email")) return "Working with email";
    if (name.startsWith("browser")) return "Using the browser";
    // Fallback: "get_current_time" -> "Get current time"
    const words = name.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
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
            // Per-invocation reasoning-effort override (e.g. the web chat composer's
            // selector). Wins over the agent's own default when provided. Undefined =
            // fall back to the agent profile / provider default.
            reasoningEffort?: string;
            // Stream EVERY turn's tokens (incl. reasoning) via editMessageCallback,
            // with no placeholder message — the web chat sets this for a live,
            // Telegram-like feel even on tool-enabled agents. Telegram leaves it unset
            // and keeps its placeholder+progress-trail behaviour.
            forceStream?: boolean;
            // Per-invocation model override (the assistant's model picker). Wins over
            // the agent's own model. The provider is resolved from the model id, so a
            // Claude/OpenAI/MiniMax id works if that provider's key is configured.
            modelOverride?: string;
            // Live tool-activity callback — fires when a tool starts and finishes,
            // so streaming surfaces (web chat) can show calm "step" rows. Fire-soft;
            // never affects execution.
            onToolStep?: (step: { name: string; label: string; phase: "start" | "done" | "error"; detail?: string }) => void;
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
            userId: inbound.actorUserId ?? null,
        });
        let boundConversationId: string | null = null;

        try {
            // 0. Pre-flight: may this workspace run at all? (see checkTenantAccess)
            const tenantSettings = await db.query.tenants.findFirst({
                where: eq(tenants.id, inbound.tenantId),
                columns: { config: true },
            });
            const autoMemoryConfig = parseAutoMemoryConfig(tenantSettings?.config);

            /*
             * One gate for "may this workspace run at all".
             *
             * This used to be an inline credits check against a DEPLOYMENT-WIDE
             * billingMode, which cannot express a vendor's reality: Runstate runs
             * unlimited on its own keys while a paying customer is on a monthly
             * plan, both on the same box. checkTenantAccess also enforces
             * tenants.status and the subscription state — the former existed as a
             * column that nothing ever read, so a non-paying customer could not
             * actually be stopped.
             */
            const access = await checkTenantAccess(inbound.tenantId);
            if (!access.allowed) {
                tenantLog.warn({ reason: access.reason }, "Message rejected — workspace may not run");
                await sendMessageCallback({
                    conversationId: randomUUID(), // Fallback conversation string
                    tenantId: inbound.tenantId,
                    agentProfileId: inbound.agentProfileId,
                    channelType: inbound.channelType,
                    channelContactId: inbound.channelContactId,
                    content: access.message ?? "This workspace cannot process messages right now.",
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
                        /*
                         * Owner and visibility are set TOGETHER, and that pairing
                         * is load-bearing.
                         *
                         * The column default is 'private'. If a row is inserted
                         * with no owner it inherits that default and becomes
                         * private-with-no-owner — readable by nobody, including
                         * the person who just wrote it. That is exactly what
                         * happened in production: chats were saved and instantly
                         * invisible.
                         *
                         * So a thread with a human asker is private to them; a
                         * thread with no asker (cron, API) is the workspace's.
                         * Never the impossible third state.
                         */
                        ownerUserId: inbound.actorUserId ?? null,
                        visibility: inbound.actorUserId ? "private" : "workspace",
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
            // Honor an explicitly-chosen agent for org-channel messages (pre-resolved
            // lead/@mention) AND for the browser assistant (the user picks the agent in
            // the dropdown / @mentions one) — both bypass tenant routing rules. Everything
            // else (Telegram, API, …) routes via rules.
            let resolvedAgentProfileId = (inbound.channelId || inbound.channelType === "webapp") && inbound.agentProfileId
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

            // A job that declares what it needs pays only for what it needs. The
            // agent keeps its full toolset everywhere else; this narrows a single
            // invocation, and an empty or unmatched scope is ignored rather than
            // leaving the agent with nothing to work with.
            const scope = (inbound.allowedTools || []).filter(Boolean);
            if (scope.length) {
                const wanted = new Set(scope);
                const narrowed = enabledTools.filter((t) => wanted.has(t.name));
                if (narrowed.length) {
                    tenantLog.debug(
                        { requested: scope.length, matched: narrowed.length, from: enabledTools.length },
                        "Tool scope applied for this run",
                    );
                    enabledTools.length = 0;
                    enabledTools.push(...narrowed);
                } else {
                    tenantLog.warn({ scope }, "Tool scope matched nothing — running with the full toolset");
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
            // Usage-aware "hot cache": keep this agent's most-used extension tools
            // always loaded (frequent → instant), so only the cold long tail is
            // deferred behind tool_search. Idle tools degrade to search-on-demand.
            let toolUsageScores = new Map<string, number>();
            if (toolSearchActive) {
                toolUsageScores = await getToolUsageScores(inbound.tenantId, resolvedAgentProfileId ?? undefined);
                const HOT_CACHE = 6;
                for (const n of topToolsByUsage(toolUsageScores, HOT_CACHE, deferredNames)) revealedNames.add(n);
                // Recency ("short-term memory"): always keep the last few tools the
                // agent used loaded, even if they're not its most frequent ones.
                for (const n of await getRecentToolNames(inbound.tenantId, resolvedAgentProfileId ?? undefined, 5, deferredNames)) {
                    revealedNames.add(n);
                }

                // Predictive reveal: surface deferred tools whose name/description
                // matches what the user just asked, so relevant tools (e.g. erpnext_*
                // when the message says "invoice on erpnext") are usable immediately —
                // a weak model can't be relied on to run the tool_search dance first.
                const tokens = (inbound.content || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
                if (tokens.length) {
                    const relevant = deferrableTools
                        .map((t) => {
                            const name = t.name.toLowerCase();
                            const desc = (t.description || "").toLowerCase();
                            let score = 0;
                            for (const tok of tokens) { if (name.includes(tok)) score += 3; else if (desc.includes(tok)) score += 1; }
                            return { name: t.name, score };
                        })
                        .filter((x) => x.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, Math.max(toolSearchCfg.maxResults, 6));
                    for (const r of relevant) revealedNames.add(r.name);
                }
            }
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
            let activeFallbackChain: string[] | undefined; // set when the agent uses a model group
            let routeReason: string | undefined; // set when smart routing picks the model
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

                    /*
                     * Model group: the agent auto-picks from a configured, ordered
                     * set of models with a selectable strategy. Takes precedence
                     * over both the single model and smart routing — a group is
                     * the explicit "use these, in this way" choice. The lead model
                     * runs; the rest are the failover chain, walked by
                     * provider-manager on error. Nothing here is hardcoded; the
                     * models and strategy come from the group row.
                     */
                    let usedGroup = false;
                    if ((profile as any).modelGroupId) {
                        try {
                            const row = await db.query.modelGroups.findFirst({
                                where: and(
                                    eq(modelGroups.id, (profile as any).modelGroupId),
                                    eq(modelGroups.tenantId, inbound.tenantId),
                                ),
                            });
                            const group = normalizeGroup(row as any);
                            if (group) {
                                const ordered = orderModelsForTurn(group, {
                                    text: inbound.content || "",
                                    hasTools: enabledTools.length > 0,
                                    hasAttachments: Array.isArray(inbound.attachments) && inbound.attachments.length > 0,
                                });
                                if (ordered.length > 0) {
                                    activeModelId = ordered[0];
                                    activeFallbackChain = ordered;
                                    routeReason = `group:${group.strategy}`;
                                    usedGroup = true;
                                    tenantLog.info({ model: activeModelId, strategy: group.strategy, chain: ordered }, "Model group resolved");
                                }
                            }
                        } catch (err) {
                            tenantLog.warn({ err }, "Model group resolution failed (non-fatal) — using single model");
                        }
                    }

                    // Smart routing: route trivial, tool-free turns to the agent's fast
                    // model. Skipped when a group is in charge. A per-message model
                    // override (below) still wins.
                    if (!usedGroup && (profile as any).smartRouting && (profile as any).fastModelId) {
                        const decision = routeModel(inbound.content || "", {
                            hasTools: enabledTools.length > 0,
                            hasAttachments: Array.isArray(inbound.attachments) && inbound.attachments.length > 0,
                            capableModel: activeModelId,
                            fastModel: (profile as any).fastModelId,
                        });
                        activeModelId = decision.modelId;
                        routeReason = decision.reason;
                        tenantLog.info({ routedModel: activeModelId, routeReason }, "Smart routing decision");
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
                    // The L3 persona profile is always-on (stable long-term context);
                    // relevant atoms are retrieved on-demand for this message. Both are
                    // bounded so they can't crowd the prompt.
                    const [persona, memoryContext] = await Promise.all([
                        memoryService.getPersona(inbound.tenantId, resolvedAgentProfileId).catch(() => null),
                        memoryService.getRelevantContext(inbound.tenantId, resolvedAgentProfileId, inbound.content, 5, {
                            // Recall the asker's own memories plus the workspace's.
                            // Without this an agent could repeat something it
                            // learned from one person back to another.
                            ownerUserId: inbound.actorUserId ?? null,
                        }).catch(() => null),
                    ]);
                    const parts: string[] = [];
                    if (persona) parts.push(`[profile] ${persona}`);
                    if (memoryContext) parts.push(memoryContext);
                    if (parts.length) {
                        relevantMemories = parts.join("\n\n");
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
            const workspaceTimezone = await getTenantTimezone(inbound.tenantId);
            // Built-in tools that exist but aren't enabled for this agent — so it
            // can suggest the owner turn them on (it still can't call them).
            const enabledToolNames = new Set(enabledTools.map((t) => t.name));
            const suggestableTools = this.toolRegistry.getAllTools()
                .filter((t) => !enabledToolNames.has(t.name))
                .map((t) => ({ name: t.name, description: t.description }));
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
                senderRole: inbound.senderRole,
                isGroup: inbound.isGroup,
                groupTitle: inbound.groupTitle,
                routableChannels,
                timezone: workspaceTimezone,
                suggestableTools,
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

            /*
             * 3.888 Inject the agent's skill catalogue.
             *
             * Names and one-line descriptions only. Measured on the real
             * upstream packs, 802 skills' descriptions are ~64k tokens and
             * their bodies far more — a catalogue carrying bodies would cost
             * more per message than the conversation it belongs to. The agent
             * calls `skill_read` once it has decided a skill applies.
             *
             * An agent with no skills gets an empty string here and no
             * skill_read tool, so it costs exactly what it did before.
             */
            if (resolvedAgentProfileId) {
                try {
                    const skills = await getAgentSkills(inbound.tenantId, resolvedAgentProfileId);
                    const section = formatSkillCatalogue(skills);
                    if (section) {
                        activeSystemPrompt += section;
                        tenantLog.info(
                            { agentProfileId: resolvedAgentProfileId, skillCount: skills.length },
                            "Skill catalogue injected",
                        );
                    }
                } catch (err) {
                    tenantLog.warn({ err }, "Failed to inject skill catalogue (non-fatal)");
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
            let lastPartialWrite = 0;
            // Web (forceStream) streams over a WebSocket with no rate limit → fast,
            // smooth. Telegram edits are rate-limited so throttle much harder.
            const EDIT_THROTTLE_MS = options?.forceStream ? 120 : 1000;

            // Stream token deltas when the surface supports edits. Telegram only
            // streams tool-less turns (tool turns get a progress trail instead); the
            // web sets forceStream to stream EVERY turn — including live reasoning —
            // for a Telegram-like feel even on tool-enabled agents.
            if (options?.editMessageCallback && (toolDefinitions.length === 0 || options.forceStream)) {
                const streamMsgId = () => streamMessageId ?? "web-stream";
                streamCallbacks = {
                    onDelta: (delta: string) => {
                        streamAccumulated += delta;
                        const now = Date.now();
                        if (now - lastEditTime >= EDIT_THROTTLE_MS) {
                            lastEditTime = now;
                            options.editMessageCallback!(
                                inbound.tenantId,
                                inbound.channelContactId,
                                streamMsgId(),
                                streamAccumulated,
                                undefined,
                                resolvedAgentProfileId ?? undefined
                            ).catch(() => {});

                            // Also publish to the chat bus, so a browser that
                            // reconnected on a NEW socket still receives the rest
                            // of its own answer. The callback above only reaches
                            // the socket that sent the message.
                            emitChatEvent({
                                type: "chat:delta",
                                tenantId: inbound.tenantId,
                                userId: inbound.actorUserId ?? null,
                                contactId: inbound.channelContactId,
                                runId: run.id,
                                agentProfileId: resolvedAgentProfileId ?? null,
                                content: streamAccumulated,
                                thinking: "",
                            });
                        }
                        // Checkpoint to the DB on a slower cadence so a full page
                        // reload mid-answer shows progress rather than a blank
                        // thread. Throttled hard: this is a write, not a frame.
                        if (now - lastPartialWrite >= PARTIAL_PERSIST_MS) {
                            lastPartialWrite = now;
                            void savePartialContent(run, streamAccumulated);
                        }
                    },
                    onComplete: () => {
                        // Final edit happens after the full response is built.
                    },
                };

                if (!options.forceStream) {
                    // Telegram-style: start a "typing" placeholder and edit it in place.
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
                // forceStream (web): no placeholder — deltas go straight to the socket
                // as agent.streaming; the final reply is dispatched normally below.
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
            if (options?.editMessageCallback && !options?.forceStream && toolDefinitions.length > 0 && activeProgressVerbosity !== "off") {
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

            // Per-invocation override (web chat composer) wins over the agent default.
            if (options?.reasoningEffort) {
                activeReasoningEffort = options.reasoningEffort === "auto" ? undefined : options.reasoningEffort;
            }
            // Per-invocation MODEL override (assistant model picker). Provider is
            // resolved from the model id downstream, so any configured provider works.
            if (options?.modelOverride && options.modelOverride.trim()) {
                activeModelId = options.modelOverride.trim();
                tenantLog.debug({ modelOverride: activeModelId }, "Using per-message model override");
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
                fallbackChain: activeFallbackChain,
            });

            // 4.5. Handle tool calls in a loop (support multi-turn tool use)
            let toolUseCount = 0;
            // Higher limit when delegation is active; +2 when Tool Search is on so
            // the search step(s) don't eat into the real tool-use budget.
            const maxToolIterations = (delegationActive ? 10 : 8) + (toolSearchActive ? 2 : 0);
            let totalInputTokens = llmResponse.usage.inputTokens;
            let totalOutputTokens = llmResponse.usage.outputTokens;
            // Running conversation for the tool loop. Each turn must see ALL prior
            // tool calls + results — previously only the latest exchange was passed,
            // so the model "forgot" what it had already done, re-called tools, and
            // looped until the cap (which then dispatched an empty reply).
            const workingMessages: any[] = [...llmMessages];
            // Every tool outcome this turn — the Truth Gate's ground truth for
            // catching "I did it" claims that no successful action backs.
            const turnToolOutcomes: ToolOutcome[] = [];

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
                            const { matches, total } = rankDeferredTools(deferrableTools, query, toolSearchCfg.maxResults, toolUsageScores);
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
                            const stepLabel = toolStepLabel(toolCall.name);
                            try { options?.onToolStep?.({ name: toolCall.name, label: stepLabel, phase: "start" }); } catch { /* fire-soft */ }
                            try {
                                // Inject _agentId so tools can identify the calling agent
                                const toolArgs = { ...(toolCall.input as Record<string, any>) };
                                if (resolvedAgentProfileId) {
                                    toolArgs._agentId = resolvedAgentProfileId;
                                }
                                // ...and _actorUserId, so a tool acting on a
                                // person's behalf can use THEIR mailbox and
                                // credentials rather than the workspace's.
                                // Absent for cron and API runs, where the agent
                                // is acting as itself.
                                if (inbound.actorUserId) {
                                    toolArgs._actorUserId = inbound.actorUserId;
                                }
                                result = await tool.execute({
                                    tenantId: inbound.tenantId,
                                    conversationId: conversation.id,
                                    args: toolArgs,
                                });
                                run.addToolCall(toolCall.name, true, Date.now() - toolStart);
                                const ok = !isErrorResult(result.result);
                                const count = (result.metadata as any)?.count;
                                const detail = typeof count === "number" ? `${count} result${count === 1 ? "" : "s"}` : undefined;
                                try { options?.onToolStep?.({ name: toolCall.name, label: stepLabel, phase: ok ? "done" : "error", detail }); } catch { /* fire-soft */ }
                            } catch (err: any) {
                                tenantLog.error({ err, toolName: toolCall.name }, "Tool execution failed");
                                result = { result: `Error executing tool '${toolCall.name}': ${err.message || "Unknown error"}` };
                                run.addToolCall(toolCall.name, false, Date.now() - toolStart);
                                try { options?.onToolStep?.({ name: toolCall.name, label: stepLabel, phase: "error" }); } catch { /* fire-soft */ }
                            }
                        }

                        // Record the outcome for the Truth Gate (ground truth of
                        // what actually happened, success or failure).
                        turnToolOutcomes.push({
                            name: toolCall.name,
                            ok: !isErrorResult(result.result),
                            result: result.result,
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

                // Grow the running history so the model remembers everything it has
                // already done this turn (prevents the re-call loop).
                workingMessages.push(assistantMessage as any, toolResultMessage as any);

                // Web streaming: reset the buffer so this turn's answer/reasoning
                // streams fresh (the previous turn's pre-tool text isn't the answer).
                if (options?.forceStream && streamCallbacks) streamAccumulated = "";

                // Call LLM with tool results — same model + tenant routing
                llmResponse = await this.providerManager.chat({
                    agentProfileId: resolvedAgentProfileId ?? undefined,
                    conversationId: conversation.id,
                    model: activeModelId,
                    tenantId: inbound.tenantId,
                    systemPrompt: activeSystemPrompt,
                    stream: options?.forceStream ? streamCallbacks : undefined,
                    messages: workingMessages,
                    tools: activeToolDefinitions.length > 0 ? activeToolDefinitions : undefined,
                    attachments: inbound.attachments,
                    reasoningEffort: activeReasoningEffort,
                    fallbackChain: activeFallbackChain,
                });

                totalInputTokens += llmResponse.usage.inputTokens;
                totalOutputTokens += llmResponse.usage.outputTokens;
            }

            if (toolUseCount >= maxToolIterations) {
                tenantLog.warn("Reached maximum tool use iterations, stopping");
            }

            // Safety net: if the loop ended with the model still wanting a tool (hit
            // the cap) or with no user-facing text, force ONE final answer with tools
            // disabled — otherwise the user gets an empty reply.
            const pendingToolCalls = (llmResponse.toolCalls?.length ?? 0) > 0;
            const visibleContent = (llmResponse.content || "")
                .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
                .replace(/<\/?think(?:ing)?>/gi, "").trim();
            if (pendingToolCalls || !visibleContent) {
                tenantLog.info({ pendingToolCalls, hadText: !!visibleContent }, "Forcing a final answer turn (tools disabled)");
                try {
                    if (options?.forceStream && streamCallbacks) streamAccumulated = "";
                    const finalResp = await this.providerManager.chat({
                        agentProfileId: resolvedAgentProfileId ?? undefined,
                        conversationId: conversation.id,
                        model: activeModelId,
                        tenantId: inbound.tenantId,
                        systemPrompt: activeSystemPrompt,
                        stream: options?.forceStream ? streamCallbacks : undefined,
                        messages: [...workingMessages, { role: "user", content: "Give me your final answer now, based on the results above. Reply to me directly and do not call any more tools." } as any],
                        tools: undefined, // no tools → the model must produce text
                        attachments: inbound.attachments,
                        reasoningEffort: activeReasoningEffort,
                        fallbackChain: activeFallbackChain,
                    });
                    totalInputTokens += finalResp.usage.inputTokens;
                    totalOutputTokens += finalResp.usage.outputTokens;
                    llmResponse = finalResp;
                } catch (e) {
                    tenantLog.warn({ e }, "Final answer turn failed; using best-effort content");
                }
            }

            // Update usage to reflect total tokens across all iterations
            llmResponse.usage.inputTokens = totalInputTokens;
            llmResponse.usage.outputTokens = totalOutputTokens;

            // 4.55 Strip chain-of-thought — reasoning models (e.g. MiniMax M2.5) emit
            // <think>…</think> in the content; never persist it. Capture it first so
            // surfaces that opt in (web chat's collapsible "thinking" panel) can show
            // it; it is never written to the DB or sent to channels that don't ask.
            let capturedThinking = "";
            llmResponse.content = llmResponse.content
                .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, (_m, inner) => { capturedThinking += inner; return ""; })
                .replace(/<\/?think(?:ing)?>/gi, "")                          // stray tags
                .trim();
            capturedThinking = capturedThinking.trim();

            // 4.55a COLLAPSED-ANSWER RECOVERY — some models (notably MiniMax) sometimes
            // put the ENTIRE deliverable INSIDE <think>…</think> and leave only a short
            // trailing sentence (e.g. a follow-up question) outside it. The strip above
            // would then route the whole answer into the "thinking" panel and show the
            // user almost nothing. When what's left is short while the captured thinking
            // is substantial and much larger, the answer was clearly trapped in the
            // reasoning block — promote it back so nothing is lost.
            let recoveredIntoContent = false;
            const strippedAnswer = llmResponse.content;
            const looksCollapsed =
                capturedThinking.length > 500 &&
                strippedAnswer.length < 300 &&
                capturedThinking.length > strippedAnswer.length * 3;
            if (looksCollapsed) {
                llmResponse.content = strippedAnswer
                    ? `${capturedThinking}\n\n${strippedAnswer}`
                    : capturedThinking;
                capturedThinking = "";
                recoveredIntoContent = true;
                tenantLog.warn(
                    { recoveredChars: llmResponse.content.length, trailingChars: strippedAnswer.length },
                    "Recovered an answer the model emitted inside <think> (would otherwise have shown only the trailing text)"
                );
            }

            // 4.55b TRUTH GATE — before the user sees the reply, make sure it doesn't
            // claim a consequential action was done when no successful tool backs it.
            // Runs only on the risky path (a completion claim with no successful
            // state-changing tool call), so the happy path pays nothing.
            if (llmResponse.content && llmResponse.content.trim() !== SILENT_REPLY_TOKEN
                && shouldRunGate(llmResponse.content, turnToolOutcomes)) {
                const gated = await runTruthGate({
                    reply: llmResponse.content,
                    outcomes: turnToolOutcomes,
                    chat: async (system, userText) => {
                        const resp = await this.providerManager.chat({
                            agentProfileId: resolvedAgentProfileId ?? undefined,
                            conversationId: conversation.id,
                            model: activeModelId,
                            tenantId: inbound.tenantId,
                            systemPrompt: system,
                            messages: [{ role: "user", content: userText } as any],
                            tools: undefined,
                            reasoningEffort: "low",
                            fallbackChain: activeFallbackChain,
                        });
                        totalInputTokens += resp.usage.inputTokens;
                        totalOutputTokens += resp.usage.outputTokens;
                        llmResponse.usage.inputTokens = totalInputTokens;
                        llmResponse.usage.outputTokens = totalOutputTokens;
                        return (resp.content || "").replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
                    },
                    log: (msg, data) => tenantLog.warn({ ...data }, msg),
                });
                if (gated.corrected) {
                    tenantLog.warn({ tools: turnToolOutcomes.map((o) => `${o.name}:${o.ok ? "ok" : "fail"}`) }, "Truth Gate corrected an unsupported completion claim");
                    // The final assistant message (persisted + sent to the client) now
                    // carries the corrected text; on streaming surfaces the final
                    // message replaces the streamed draft.
                    llmResponse.content = gated.reply;
                }
            }

            // 4.6 Check for silent reply token — suppress empty/ack responses
            const isSilentReply = llmResponse.content.trim() === SILENT_REPLY_TOKEN;

            // 5. Dispatch the reply to the user FIRST — before persistence, billing,
            //    and auto-memory. Those are bookkeeping the user shouldn't wait on;
            //    doing them before the final send left the web "streaming" cursor
            //    blinking (and the composer locked) for the extra seconds they took.
            //    Now the cursor stops the instant the answer is ready.
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
                    thinking: capturedThinking || undefined,
                    // Recovery moved the reasoning INTO content — tell streaming
                    // surfaces to drop any separately-streamed thinking so it
                    // isn't duplicated in the collapsible panel.
                    thinkingSuppressed: recoveredIntoContent,
                    // Which model actually answered (for the "answered by X" transparency
                    // badge) and why smart routing picked it (undefined = not routed).
                    model: (llmResponse as any).canonicalModel || activeModelId,
                    routeReason,
                } as OutboundMessage & { thinkingSuppressed?: boolean; model?: string; routeReason?: string };

                // For group messages, reply in-thread to the original message
                if (inbound.isGroup && inbound.raw) {
                    const rawMsg = inbound.raw as any;
                    if (rawMsg.message_id) {
                        outbound.replyToMessageId = rawMsg.message_id.toString();
                    }
                }

                await sendMessageCallback(outbound);

                // Publish the completed answer to the chat bus too, so a browser
                // that reconnected on a new socket (or reloaded) sees the reply
                // land instead of sitting on a half-written checkpoint.
                emitChatEvent({
                    type: "chat:final",
                    tenantId: inbound.tenantId,
                    userId: inbound.actorUserId ?? null,
                    contactId: inbound.channelContactId,
                    runId: run.id,
                    agentProfileId: resolvedAgentProfileId ?? null,
                    content: llmResponse.content,
                });
            }

            // 5b. Persist the assistant message (after dispatch — bookkeeping) (skip silent replies).
            //
            // NON-FATAL: the reply has already been generated (and, on streaming
            // surfaces, delivered live to the user). If the conversation row is
            // gone — e.g. the user deleted this chat/session mid-turn — this
            // insert hits a FK violation. That must NOT throw into the outer
            // catch, or the delivered answer gets clobbered by a generic error
            // bubble and the stream/composer locks up waiting for a completion
            // that never comes. Log it and carry on to send the final message.
            if (!isSilentReply) {
                try {
                    await db.insert(messages).values({
                        conversationId: conversation.id,
                        tenantId: inbound.tenantId,
                        role: "assistant",
                        content: llmResponse.content,
                        // Attribute the reply to the responding agent — in a shared channel
                        // thread AND in the browser assistant (so a shared/team room can show
                        // which agent said what on history reload).
                        channelId: inbound.channelId ?? null,
                        senderType: (inbound.channelId || inbound.channelType === "webapp") ? "agent" : null,
                        senderAgentId: (inbound.channelId || inbound.channelType === "webapp") ? (resolvedAgentProfileId ?? null) : null,
                    });
                } catch (persistErr) {
                    tenantLog.error({ persistErr, conversationId: conversation.id }, "Failed to persist assistant message (reply already produced) — continuing without it");
                }
            }

            // Bump the conversation's updatedAt so "Last Updated" reflects real
            // activity (not just creation) and threads sort by recency. Also
            // non-fatal for the same reason.
            try {
                await db.update(conversations)
                    .set({ updatedAt: new Date() })
                    .where(eq(conversations.id, conversation.id));
            } catch (bumpErr) {
                tenantLog.warn({ bumpErr, conversationId: conversation.id }, "Failed to bump conversation updatedAt — continuing");
            }

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

            // 7. Dispatch handled earlier (moved above persistence/billing so the
            //    user's cursor stops the instant the reply is ready).

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
            } else if (/unterminated|unexpected token|unexpected end|malformed|json|\bparse\b/.test(cause)) {
                userMessage = "The AI model returned a malformed reply — this usually happens on a very large or complex request. Please try again, ask for a bit less at once, or switch to a more reliable model in the composer.";
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
