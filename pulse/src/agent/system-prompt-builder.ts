/**
 * System Prompt Builder — Constructs the complete system prompt for an agent.
 *
 * Modeled after OpenClaw's system-prompt.ts architecture:
 * - Identity line (agent knows what platform it runs on)
 * - Current date & time (prominent, human-readable — not buried in runtime)
 * - Operational directives (HIGHEST PRIORITY — override personality)
 * - Tool awareness (agents know what tools they have)
 * - Tool call style guidance (act, don't narrate)
 * - Safety constitution (no self-preservation, no power-seeking)
 * - Memory recall instructions (proactive, not passive)
 * - Channel capabilities (what the channel supports)
 * - Messaging guidance (system messages, routing)
 * - Delegation orchestration guidance
 * - Silent reply support (NO_REPLY token)
 * - PromptMode (full for main agents, minimal for subagents)
 * - Runtime context (agent ID, model, channel)
 * - Prompt sanitization (strip Unicode control chars)
 */

/**
 * Controls which sections are included in the system prompt.
 * - "full": All sections (default, for main agents)
 * - "minimal": Reduced sections (tooling, runtime, capabilities only) — for subagents/delegation
 */
export type PromptMode = "full" | "minimal";

/**
 * Silent reply token — matches OpenClaw's NO_REPLY convention.
 * When the agent has nothing to say (e.g., system message processed,
 * cron job acknowledged), it responds with this token which gets suppressed by the runtime.
 */
export const SILENT_REPLY_TOKEN = "NO_REPLY";

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

    /** Agent display name (from SOUL.md or profile) */
    agentName?: string;

    /** Resolved skills for this agent (detailed tool usage guidance) */
    skills?: string;
}

// ─── Utilities ───────────────────────────────────────────────────────

/**
 * Sanitize strings for prompt injection safety.
 * Strips Unicode control characters (Cc), format characters (Cf),
 * and line/paragraph separators (U+2028/U+2029).
 * Matches OpenClaw's sanitizeForPromptLiteral().
 */
function sanitize(value: string): string {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, "");
}

/**
 * Format current date/time in a human-readable way.
 * Matches OpenClaw's formatUserTime() — "Thursday, February 27th, 2026 — 3:26 PM"
 */
function formatCurrentDateTime(): string {
    const now = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];

    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const date = now.getDate();
    const year = now.getFullYear();

    // Ordinal suffix
    const suffix = (date === 1 || date === 21 || date === 31) ? "st"
        : (date === 2 || date === 22) ? "nd"
        : (date === 3 || date === 23) ? "rd"
        : "th";

    // 12-hour format
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    return `${dayName}, ${monthName} ${date}${suffix}, ${year} — ${hours}:${minutes} ${ampm}`;
}

// ─── Section Builders ────────────────────────────────────────────────

function buildCurrentDateTimeSection(): string[] {
    return [
        "## Current Date & Time",
        formatCurrentDateTime(),
        "Use this to infer dates from relative references. If someone says 'January report', use the most recent January relative to today.",
        "",
    ];
}

function buildToolingSection(tools: ToolInfo[]): string[] {
    if (tools.length === 0) return [];

    const toolLines = tools.map((t) => `- **${t.name}**: ${t.description}`);
    return [
        "## Tooling",
        "Tool availability (filtered by policy). Tool names are case-sensitive — call tools exactly as listed.",
        ...toolLines,
        "",
        "TOOLS.md does not control tool availability; it is user guidance for how to use external tools.",
        "When asked about your capabilities, refer to this list.",
        "If asked whether you can do something, check if you have a relevant tool.",
        "When you have the tools to do something, USE them — don't just describe what you could do.",
        "",
    ];
}

function buildSkillsSection(skillsContent: string): string[] {
    if (!skillsContent) return [];
    return [skillsContent, ""];
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

function buildMessagingSection(): string[] {
    return [
        "## Messaging",
        "- Reply in the current session → automatically routes to the source channel (Telegram, WhatsApp, etc.)",
        "- `[System Message] ...` blocks are internal context and are not user-visible by default.",
        "- If a `[System Message]` reports completed work and asks for a user update, rewrite it in your normal voice and send that update (do not forward raw system text or respond with NO_REPLY).",
        "- Never use tool calls for provider messaging; the platform handles all routing internally.",
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
        `- Never append it to an actual response (never include "${SILENT_REPLY_TOKEN}" in real replies)`,
        "- Never wrap it in markdown or code blocks",
        "",
        `Wrong: "Here's the data... ${SILENT_REPLY_TOKEN}"`,
        `Wrong: "${SILENT_REPLY_TOKEN}"`,
        `Right: ${SILENT_REPLY_TOKEN}`,
        "",
    ];
}

function buildRuntimeLine(params: SystemPromptParams): string[] {
    const parts = [
        params.agentProfileId ? `agent=${sanitize(params.agentProfileId)}` : "",
        `model=${sanitize(params.modelId)}`,
        `channel=${sanitize(params.channelType)}`,
        `tools=${params.enabledTools.length}`,
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
        lines.push(`You are in a group chat: "${sanitize(params.groupTitle)}".`);
    }
    lines.push(
        "In group chats, only respond when directly @mentioned or when a message replies to one of yours.",
        "Address users by name when applicable. Keep responses concise in groups.",
        ""
    );
    return lines;
}

function buildSoulInstruction(): string[] {
    return [
        "",
        "If SOUL.md content is present above, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions (Operational Directives) override it.",
        "",
    ];
}

// ─── Main Builder ────────────────────────────────────────────────────

/**
 * Build the complete system prompt for an agent.
 *
 * Section order — designed so the most important behavioral rules come first:
 * 1. Base prompt (workspace: IDENTITY + SOUL + RESPONSE GUIDELINES + MEMORY + KNOWLEDGE)
 * 2. SOUL.md instruction (embody persona)
 * 3. Current Date & Time (prominent, human-readable)
 * 4. Operational Directives (HIGHEST PRIORITY — override personality)
 * 5. Tooling (all available tools with descriptions)
 * 5.5 Skills (detailed tool usage guidance)
 * 6. Tool Call Style
 * 7. Safety Constitution
 * 8. Memory Recall Instructions
 * 9. Relevant Memories (retrieved for this message)
 * 10. Channel Capabilities
 * 11. Messaging Guidance
 * 12. Group Chat Context
 * 13. Delegation Context
 * 14. Workspace Context Files (TOOLS.md, USER.md)
 * 15. Silent Replies
 * 16. Runtime Line
 */
export function buildAgentSystemPrompt(params: SystemPromptParams): string {
    const mode = params.promptMode ?? "full";
    const isMinimal = mode === "minimal";
    const lines: string[] = [];

    // 1. Base prompt (IDENTITY + SOUL + RESPONSE GUIDELINES + MEMORY + KNOWLEDGE)
    lines.push(params.basePrompt);

    // 2. SOUL.md instruction — tell the agent to embody the persona
    if (!isMinimal) {
        lines.push(...buildSoulInstruction());
    }

    // 3. Current Date & Time — prominent, human-readable (not buried in runtime)
    lines.push(...buildCurrentDateTimeSection());

    // 4. Operational Directives — HIGHEST PRIORITY, overrides personality
    lines.push(...buildOperationalDirectives());

    // 5. Tooling — always included (agents must know their tools)
    lines.push(...buildToolingSection(params.enabledTools));

    // 5.5. Skills — detailed tool usage guidance (full mode only)
    if (!isMinimal && params.skills) {
        lines.push(...buildSkillsSection(params.skills));
    }

    // 6. Tool Call Style — full mode only
    if (!isMinimal) {
        lines.push(...buildToolCallStyleSection());
    }

    // 7. Safety Constitution — always included
    lines.push(...buildSafetySection());

    // 8. Memory Recall Instructions — full mode only
    if (!isMinimal) {
        lines.push(...buildMemoryRecallSection(params.hasMemoryTools));
    }

    // 9. Relevant Memories
    if (params.relevantMemories) {
        lines.push("## Relevant Memories");
        lines.push(params.relevantMemories);
        lines.push("");
    }

    // 10. Channel Capabilities — always included
    lines.push(...buildChannelSection(params.channelType));

    // 11. Messaging Guidance — full mode only
    if (!isMinimal) {
        lines.push(...buildMessagingSection());
    }

    // 12. Group Chat Context — full mode only
    if (!isMinimal) {
        lines.push(...buildGroupContextSection(params));
    }

    // 13. Delegation Context — full mode only
    if (!isMinimal && params.delegationActive && params.availableAgents) {
        lines.push(...buildDelegationSection(params.availableAgents));
    }

    // 14. Workspace Context Files — full mode only
    if (!isMinimal && params.toolsGuidance) {
        lines.push(...buildToolsGuidanceSection(params.toolsGuidance));
    }
    if (!isMinimal && params.userPreferences) {
        lines.push(...buildUserPreferencesSection(params.userPreferences));
    }

    // 15. Silent Replies — full mode only
    if (!isMinimal) {
        lines.push(...buildSilentReplySection());
    }

    // 16. Runtime Line — always included
    lines.push(...buildRuntimeLine(params));

    return lines.filter(Boolean).join("\n");
}
