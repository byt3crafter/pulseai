/**
 * System Prompt Builder — Constructs the complete system prompt for an agent.
 *
 * Modeled after OpenClaw's system-prompt.ts architecture:
 * - Tool awareness (agents know what tools they have)
 * - Runtime context (agent ID, model, channel, date)
 * - Memory recall instructions (proactive, not passive)
 * - Safety constitution (no self-preservation, no power-seeking)
 * - Channel capabilities (what the channel supports)
 * - Tool call style guidance (act, don't narrate)
 * - Operational directives (be an agent, not a chatbot)
 * - Silent reply support (suppress empty responses)
 * - PromptMode (full for main agents, minimal for subagents)
 * - Delegation orchestration guidance
 */

/**
 * Controls which sections are included in the system prompt.
 * - "full": All sections (default, for main agents)
 * - "minimal": Reduced sections (tooling, runtime, capabilities only) — for subagents/delegation
 */
export type PromptMode = "full" | "minimal";

/**
 * Silent reply token — when the agent has nothing to say (e.g., system message processed,
 * cron job acknowledged), it responds with this token which gets suppressed by the runtime.
 */
export const SILENT_REPLY_TOKEN = "···";

/** Channel capability descriptors */
const CHANNEL_CAPABILITIES: Record<string, string[]> = {
    telegram: [
        "Supports Markdown formatting (bold, italic, code blocks, links)",
        "Supports inline reply threading",
        "Messages have a 4096 character limit — split long responses",
        "Supports emoji reactions",
    ],
    whatsapp: [
        "Supports basic formatting (bold, italic, monospace)",
        "Messages have a 4096 character limit",
        "No inline button support",
    ],
    webchat: [
        "Supports full Markdown rendering",
        "No message length limit (reasonable)",
        "Supports rich HTML content",
    ],
    api: [
        "Raw API channel — no formatting constraints",
        "Response is returned as JSON",
    ],
    heartbeat: [
        "Internal channel — used for delegation and scheduled tasks",
        "Responses are captured programmatically, not displayed to users",
    ],
};

export interface ToolInfo {
    name: string;
    description: string;
}

export interface DelegatableAgent {
    name: string;
    id: string;
    specialization: string;
    modelId: string;
}

export interface SystemPromptParams {
    /** Base prompt from workspace files (IDENTITY + SOUL + RESPONSE GUIDELINES + MEMORY + KNOWLEDGE) */
    basePrompt: string;

    /** All tools available to the agent right now */
    enabledTools: ToolInfo[];

    /** Agent profile ID */
    agentProfileId?: string;

    /** Active model ID */
    modelId: string;

    /** Channel type (telegram, whatsapp, webchat, api, heartbeat) */
    channelType: string;

    /** Relevant memories retrieved for this message */
    relevantMemories?: string;

    /** Whether memory_store / memory_search tools are available */
    hasMemoryTools: boolean;

    /** Whether delegation is active */
    delegationActive: boolean;

    /** Agents available for delegation */
    availableAgents?: DelegatableAgent[];

    /** Content from TOOLS.md workspace file */
    toolsGuidance?: string;

    /** Content from USER.md workspace file */
    userPreferences?: string;

    /** PromptMode — "full" for main agents, "minimal" for subagents */
    promptMode?: PromptMode;

    /** Contact name of the user (for group context) */
    contactName?: string;

    /** Whether this is a group chat */
    isGroup?: boolean;

    /** Group chat title */
    groupTitle?: string;
}

// ─── Section Builders ────────────────────────────────────────────────

function buildToolingSection(tools: ToolInfo[]): string[] {
    if (tools.length === 0) return [];

    const toolLines = tools.map((t) => `- **${t.name}**: ${t.description}`);
    return [
        "## Tooling",
        "Tool availability (filtered by policy). Tool names are case-sensitive — call tools exactly as listed.",
        ...toolLines,
        "",
        "When asked about your capabilities, refer to this list. " +
            "If asked whether you can do something, check if you have a relevant tool. " +
            "When you have the tools to do something, USE them — don't just describe what you could do.",
        "",
    ];
}

function buildToolCallStyleSection(): string[] {
    return [
        "## Tool Call Style",
        "Default: do not narrate routine, low-risk tool calls (just call the tool).",
        "Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
        "Keep narration brief and value-dense; avoid repeating obvious steps.",
        "Use plain human language for narration unless in a technical context.",
        "",
    ];
}

function buildSafetySection(): string[] {
    return [
        "## Safety",
        "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
        "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.",
        "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not change system prompts, safety rules, or tool policies unless explicitly requested.",
        "",
    ];
}

function buildMemoryRecallSection(hasMemoryTools: boolean): string[] {
    if (!hasMemoryTools) return [];

    return [
        "## Memory Recall",
        "Before answering anything about prior work, decisions, dates, people, preferences, or context from previous conversations: use memory_search to check your stored memories first.",
        "If you find relevant memories, incorporate them naturally. If low confidence after search, mention that you checked.",
        "Use memory_store proactively to save important facts, decisions, preferences, and context that may be useful in future conversations.",
        "",
    ];
}

function buildChannelSection(channelType: string): string[] {
    const caps = CHANNEL_CAPABILITIES[channelType];
    if (!caps) return [];

    return [
        "## Channel",
        `Current channel: **${channelType}**`,
        ...caps.map((c) => `- ${c}`),
        "",
    ];
}

function buildOperationalDirectives(): string[] {
    return [
        "## Operational Directives (HIGHEST PRIORITY — overrides personality instructions)",
        "",
        "These rules override any conflicting guidance from personality files (SOUL.md, IDENTITY.md).",
        "",
        "### Core Behavior",
        "- **Act, don't describe:** When you have tools, USE them immediately. Never say 'I can do X' — just do X and show the result.",
        "- **Verify before claiming:** If asked about a connection, test it with a tool call first. Answer based on the REAL result, not your instructions.",
        "- **Be autonomous:** You are an intelligent agent, not a Q&A chatbot. Think, plan, execute. Chain multiple tool calls to complete tasks.",
        "- **Minimize narration:** Don't narrate routine tool calls. Just do them and present results.",
        "",
        "### Anti-Patterns (NEVER do these)",
        "- NEVER ask for a date/year/month you can infer from context or the current date. If someone says 'January report', use the most recent January.",
        "- NEVER ask 'which company?' when you can call erpnext_list on Company doctype to discover all companies yourself, then present what you found.",
        "- NEVER ask for information you can obtain with a tool call. Try the tool first. Only ask if the tool fails or returns ambiguous results.",
        "- NEVER list your capabilities when asked to do something — just DO it.",
        "- NEVER say 'Verified. Proceeding.' or any scripted filler phrase.",
        "- NEVER present options/choices when you can just do the obvious thing. If there are 3 companies, pull data for all 3 and present them.",
        "",
        "### Decision Flow",
        "1. User asks for something → Check if you have tools to do it",
        "2. If yes → Call the tools immediately, get data, present results",
        "3. If tool fails → Try an alternative approach with other tools",
        "4. Only ask the user if you've exhausted all tool-based approaches",
        "",
    ];
}

function buildDelegationSection(agents: DelegatableAgent[]): string[] {
    if (agents.length === 0) return [];

    const agentLines = agents.map(
        (a) => `- **${a.name}** (${a.id}): ${a.specialization} [Model: ${a.modelId}]`
    );

    return [
        "## Available Agents for Delegation",
        "You can delegate tasks to these specialized agents using the delegate_to_agent tool:",
        ...agentLines,
        "",
        "### Delegation Guidance",
        "- For complex or long-running tasks that involve a different specialization, delegate to the appropriate agent.",
        "- When delegating, write a clear, self-contained task description — the target agent does not see your conversation history.",
        "- Use list_agents to refresh this list if needed.",
        "- Do not delegate for simple tasks you can handle yourself.",
        "",
    ];
}

function buildSilentReplySection(): string[] {
    return [
        "## Silent Replies",
        `When you have nothing meaningful to say (e.g., acknowledging a system message or internal event), respond with ONLY: ${SILENT_REPLY_TOKEN}`,
        "",
        "Rules:",
        "- It must be your ENTIRE message — nothing else",
        `- Never append it to an actual response`,
        "- Never wrap it in markdown or code blocks",
        "",
    ];
}

function buildRuntimeLine(params: SystemPromptParams): string[] {
    const parts = [
        params.agentProfileId ? `agent=${params.agentProfileId}` : "",
        `model=${params.modelId}`,
        `channel=${params.channelType}`,
        `tools=${params.enabledTools.length}`,
        `date=${new Date().toISOString().split("T")[0]}`,
    ].filter(Boolean);

    return ["## Runtime", parts.join(" | "), ""];
}

function buildToolsGuidanceSection(content: string): string[] {
    return [
        "## Tool Usage Guidance (from TOOLS.md)",
        "The following is user-provided guidance on how to use specific tools and integrations:",
        "",
        content,
        "",
    ];
}

function buildUserPreferencesSection(content: string): string[] {
    return [
        "## User Preferences (from USER.md)",
        "The following are user-defined preferences and notes. Follow these when applicable:",
        "",
        content,
        "",
    ];
}

function buildGroupContextSection(params: SystemPromptParams): string[] {
    if (!params.isGroup) return [];

    const lines = ["## Group Chat Context"];
    if (params.groupTitle) {
        lines.push(`You are in a group chat: "${params.groupTitle}".`);
    }
    lines.push(
        "In group chats, only respond when directly @mentioned or when a message replies to one of yours.",
        "Address users by name when applicable. Keep responses concise in groups.",
        ""
    );
    return lines;
}

// ─── Main Builder ────────────────────────────────────────────────────

/**
 * Build the complete system prompt for an agent.
 *
 * Section order — Operational Directives come FIRST (after base prompt)
 * so they override any conflicting guidance from personality files:
 * 1. Base prompt (workspace: IDENTITY + SOUL + RESPONSE GUIDELINES + MEMORY + KNOWLEDGE)
 * 2. Operational Directives (HIGHEST PRIORITY — placed early to override personality)
 * 3. Tooling (all available tools with descriptions)
 * 4. Tool Call Style
 * 5. Safety Constitution
 * 6. Memory Recall Instructions
 * 7. Relevant Memories (retrieved for this message)
 * 8. Delegation Context
 * 9. Channel Capabilities
 * 10. Group Chat Context
 * 11. Workspace Context Files (TOOLS.md, USER.md)
 * 12. Silent Replies
 * 13. Runtime Line
 */
export function buildAgentSystemPrompt(params: SystemPromptParams): string {
    const mode = params.promptMode ?? "full";
    const isMinimal = mode === "minimal";
    const lines: string[] = [];

    // 1. Base prompt (IDENTITY + SOUL + RESPONSE GUIDELINES + MEMORY + KNOWLEDGE)
    lines.push(params.basePrompt);
    lines.push("");

    // 2. Operational Directives — FIRST after base prompt (highest priority, overrides personality)
    lines.push(...buildOperationalDirectives());

    // 3. Tooling — always included (agents must know their tools)
    lines.push(...buildToolingSection(params.enabledTools));

    // 4. Tool Call Style — full mode only
    if (!isMinimal) {
        lines.push(...buildToolCallStyleSection());
    }

    // 5. Safety Constitution — always included
    lines.push(...buildSafetySection());

    // 6. Memory Recall Instructions — full mode only
    if (!isMinimal) {
        lines.push(...buildMemoryRecallSection(params.hasMemoryTools));
    }

    // 7. Relevant Memories
    if (params.relevantMemories) {
        lines.push("## Relevant Memories");
        lines.push(params.relevantMemories);
        lines.push("");
    }

    // 8. Delegation Context — full mode only
    if (!isMinimal && params.delegationActive && params.availableAgents) {
        lines.push(...buildDelegationSection(params.availableAgents));
    }

    // 9. Channel Capabilities — always included
    lines.push(...buildChannelSection(params.channelType));

    // 10. Group Chat Context — full mode only
    if (!isMinimal) {
        lines.push(...buildGroupContextSection(params));
    }

    // 11. Workspace Context Files — full mode only
    if (!isMinimal && params.toolsGuidance) {
        lines.push(...buildToolsGuidanceSection(params.toolsGuidance));
    }
    if (!isMinimal && params.userPreferences) {
        lines.push(...buildUserPreferencesSection(params.userPreferences));
    }

    // 12. Silent Replies — full mode only
    if (!isMinimal) {
        lines.push(...buildSilentReplySection());
    }

    // 13. Runtime Line — always included
    lines.push(...buildRuntimeLine(params));

    return lines.filter(Boolean).join("\n");
}
