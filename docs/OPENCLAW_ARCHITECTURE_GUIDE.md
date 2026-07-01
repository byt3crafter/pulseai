# OpenClaw Architecture Deep Dive

A detailed breakdown of how OpenClaw works — its memory system, reasoning loop, Soul identity, tools, skills, plugins, heartbeat scheduling, and sandboxing. Written as a reference for implementing similar patterns in your own agent platform.

---

## Table of Contents

1. [What Is OpenClaw](#what-is-openclaw)
2. [High-Level Architecture](#high-level-architecture)
3. [The Soul System (SOUL.md)](#the-soul-system)
4. [The ReAct Reasoning Loop](#the-react-reasoning-loop)
5. [Memory System](#memory-system)
6. [Tools](#tools)
7. [Skills](#skills)
8. [Plugins](#plugins)
9. [Heartbeat & Cron (Proactive Scheduling)](#heartbeat--cron)
10. [Sandboxing & Security](#sandboxing--security)
11. [How to Build Something Similar](#how-to-build-something-similar)

---

## What Is OpenClaw

OpenClaw is an open-source (MIT), local-first, autonomous AI agent created by Peter Steinberger. It launched in November 2025 as "Clawdbot", was renamed to "Moltbot", and finally became "OpenClaw". It surpassed 214,000 GitHub stars by February 2026, making it one of the fastest-growing open-source projects in history.

Key traits:
- **Local-first** — all memory is plain Markdown files on your filesystem
- **Multi-channel** — WhatsApp, Telegram, Slack, Discord, iMessage, IRC, Signal, 50+ integrations
- **Autonomous** — heartbeat daemon acts proactively without being prompted
- **Transparent** — every instruction, memory, and skill is readable Markdown
- **Self-hosted** — runs on your own hardware, no cloud dependency

Repository: https://github.com/openclaw/openclaw

---

## High-Level Architecture

```
                    ┌──────────────────────────────────────────┐
                    │              GATEWAY                     │
                    │  (Always-on daemon)                      │
                    │                                          │
  WhatsApp ────►    │  • Routes messages from channels         │
  Telegram ────►    │  • Manages sessions                      │
  Slack    ────►    │  • Runs cron jobs & heartbeats            │
  Discord  ────►    │  • Handles webhooks                      │
  Web Chat ────►    │  • Authentication & rate limiting         │
                    └────────────────┬─────────────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────────────┐
                    │           AGENT RUNTIME                  │
                    │  (Brain — ReAct Loop)                    │
                    │                                          │
                    │  1. Assemble system prompt:              │
                    │     SOUL.md + AGENTS.md + TOOLS.md       │
                    │     + active Skills + memory search      │
                    │                                          │
                    │  2. Stream to LLM provider               │
                    │     (Anthropic, OpenAI, local, etc.)     │
                    │                                          │
                    │  3. Watch for tool calls in response     │
                    │                                          │
                    │  4. Execute tools → return results       │
                    │                                          │
                    │  5. Loop until done (ReAct)              │
                    └────────────────┬─────────────────────────┘
                                     │
                    ┌────────────────┼─────────────────────────┐
                    │                │                          │
              ┌─────▼─────┐  ┌──────▼──────┐  ┌──────────────┐
              │   TOOLS    │  │   MEMORY    │  │   SKILLS     │
              │            │  │             │  │              │
              │ • bash     │  │ • MEMORY.md │  │ • SKILL.md   │
              │ • browser  │  │ • memory/   │  │ • ClawHub    │
              │ • files    │  │ • SQLite    │  │ • Per-agent  │
              │ • calendar │  │   index     │  │   filtering  │
              │ • email    │  │ • Embeddings│  │              │
              │ • MCP      │  │             │  │              │
              └────────────┘  └─────────────┘  └──────────────┘
```

The five core components:

| Component | Role |
|-----------|------|
| **Gateway** | Always-on daemon. Routes messages, manages sessions, runs cron/heartbeat |
| **Brain (Agent Runtime)** | Orchestrates the ReAct loop — LLM calls + tool execution |
| **Memory** | Persistent context across sessions. Plain Markdown files + SQLite index |
| **Skills** | Modular instruction sets (Markdown playbooks) loaded on demand |
| **Tools** | Real-world capabilities — shell, browser, files, APIs, MCP servers |

---

## The Soul System

The Soul is how OpenClaw gets its identity. It's a set of bootstrap Markdown files that define who the agent is and how it behaves.

### Core Identity Files

```
workspace/
├── SOUL.md          # Personality, tone, core principles
├── AGENTS.md        # Multi-agent routing and role definitions
├── TOOLS.md         # Available capabilities and permissions
├── IDENTITY.md      # Personal details (name, timezone, preferences)
└── HEARTBEAT.md     # What to check proactively
```

### SOUL.md — The Agent's Personality

This is the heart of the agent. It dictates personality, communication style, and core principles:

```markdown
# Soul

You are Jarvis, a personal AI assistant for Alex.

## Personality
- Concise and direct. No fluff.
- Proactive — suggest next steps without being asked.
- Technical — Alex is a senior engineer, match that level.

## Core Principles
- Always confirm before destructive actions (deleting files, sending emails)
- Never share personal data with third parties
- When unsure, ask rather than guess

## Communication Style
- Use bullet points over paragraphs
- Code blocks for anything technical
- No emojis unless Alex uses them first
```

### AGENTS.md — Multi-Agent Routing

Defines specialized agent roles. The runtime reads this to decide which agent handles a request:

```markdown
# Agents

## research-agent
- Role: Deep research, web search, summarization
- Skills: web-search, summarize, citation
- Sandbox: enabled

## devops-agent
- Role: Infrastructure, deployments, monitoring
- Skills: shell, docker, kubernetes
- Sandbox: disabled (needs host access)

## default
- Role: General assistant, fallback
- Skills: all
```

### Why This Matters

Everything is transparent and auditable:
- Open `SOUL.md` → see exactly what instructions the agent follows
- Open any `SKILL.md` → understand precisely how a capability works
- Open `MEMORY.md` → audit everything the agent knows about you

No black-box prompts. No hidden system messages. Full transparency.

---

## The ReAct Reasoning Loop

OpenClaw uses the **ReAct** (Reason + Act) pattern — the agent thinks, decides on an action, observes the result, and repeats until the task is complete.

### How One Turn Works

```
┌─────────────────────────────────────────────────────┐
│ 1. ASSEMBLE CONTEXT                                 │
│                                                      │
│    System prompt = SOUL.md + AGENTS.md + TOOLS.md    │
│                  + active skills (SKILL.md files)     │
│                  + memory_search(user's message)      │
│                  + conversation history               │
│                  + user's current message              │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 2. STREAM TO LLM                                    │
│                                                      │
│    Send assembled context to model provider           │
│    (Anthropic Claude, OpenAI GPT, local model, etc.) │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 3. PARSE RESPONSE                                   │
│                                                      │
│    Is there a tool call in the response?              │
│    ├── YES → Execute tool, get result, go to step 2  │
│    │         (feed tool result back to the LLM)       │
│    └── NO  → Return final text response to user      │
└─────────────────────────────────────────────────────┘
```

### Example ReAct Cycle

```
User: "What's the weather in Tokyo and should I bring an umbrella?"

THINK:  I need to check the weather in Tokyo. I'll use the web search tool.
ACT:    tool_call: web_search({ query: "Tokyo weather today" })
OBSERVE: "Tokyo: 18°C, 80% chance of rain, thunderstorms expected"

THINK:  High rain probability. I should recommend an umbrella.
ACT:    (no tool needed — generate final response)

Response: "Tokyo is 18°C with 80% chance of rain and thunderstorms.
           Definitely bring an umbrella."
```

### Context Assembly Detail

Before each LLM call, the runtime:

1. **Reads bootstrap files** — SOUL.md, AGENTS.md, TOOLS.md from workspace
2. **Loads active skills** — injects relevant SKILL.md content based on the message
3. **Queries memory** — runs `memory_search(user_message)` to find semantically relevant past conversations and facts
4. **Packages conversation history** — recent messages in the session
5. **Sends everything** as the system prompt + messages to the LLM

This is what gives the agent continuity — it's not "remembering" in a neural sense, it's reading files before every response.

---

## Memory System

This is OpenClaw's most distinctive feature. Memory is plain Markdown on your filesystem — no vector databases, no cloud services, no magic.

### Memory Tiers

```
┌─────────────────────────────────────────────────────┐
│ TIER 1: CONTEXT (per-session, ephemeral)            │
│                                                      │
│ Everything in a single request:                      │
│ • System prompts (SOUL.md, AGENTS.md, TOOLS.md)     │
│ • Active skills                                      │
│ • Conversation history                               │
│ • User's current message                             │
│                                                      │
│ Scope: one session. Dies when session ends.          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ TIER 2: MEMORY (persistent, survives sessions)      │
│                                                      │
│ Lives on your local disk:                            │
│ • MEMORY.md — durable facts, preferences, decisions │
│ • memory/YYYY-MM-DD.md — daily session logs         │
│ • Any .md file in memory/ subdirectory              │
│                                                      │
│ Scope: forever (until manually deleted).             │
└─────────────────────────────────────────────────────┘
```

### File Structure

```
workspace/
├── MEMORY.md                    # Core memory — preferences, key facts
└── memory/
    ├── 2026-03-15.md            # Session log from March 15
    ├── 2026-03-17.md            # Session log from March 17
    ├── 2026-03-19.md            # Today's session log
    └── projects/
        └── pulse-ai-notes.md   # Project-specific memory
```

### What Goes Where

| Destination | Content | Example |
|-------------|---------|---------|
| `MEMORY.md` | Durable facts, preferences, decisions | "User prefers dark mode. Timezone: UTC+4" |
| `memory/YYYY-MM-DD.md` | Daily running context, session logs | "Discussed refactoring auth module. Decided to use JWT." |
| Project-specific files | Deep context for specific projects | "Pulse AI uses Fastify + Drizzle ORM" |

### Memory Search: How Recall Works

OpenClaw doesn't just read the whole memory file — it uses **hybrid semantic search** to find relevant memories.

#### Indexing Pipeline

```
Markdown files
    │
    ▼
Chunker (target: ~400 tokens, 80-token overlap)
    │
    ▼
Embedding model (local or remote)
    │
    ▼
SQLite database (~/.openclaw/memory/<agentId>.sqlite)
    │
    ├── files table        — tracks mtime, size, content hashes
    ├── chunks table       — stores text, line ranges, JSON embeddings
    ├── chunks_vec (virtual) — binary float vectors (sqlite-vec)
    └── chunks_fts (virtual) — full-text search index (FTS5)
```

#### Hybrid Search (70/30 Split)

| Method | Weight | How It Works |
|--------|--------|-------------|
| **Vector search** | 70% | Cosine similarity on embeddings via sqlite-vec |
| **BM25 keyword search** | 30% | SQLite FTS5 full-text search for exact tokens |

This means searching "the pricing decision" can find a memory that says "we picked the $29 tier" — the embedding captures semantic similarity even when exact words don't match.

#### Agent-Facing Memory Tools

The LLM has two tools for memory access:

```
memory_search(query: string) → Semantic recall over indexed snippets
    Returns: snippet text (~700 chars), file path, line range, score

memory_get(file: string, lines?: range) → Read a specific file/range
    Returns: raw Markdown content from the specified file
```

### Pre-Compaction Memory Flush

A critical feature: as a session approaches the context window limit, OpenClaw runs a **silent turn** that nudges the model to write durable notes before older context is compacted away.

```
When token estimate > soft_threshold:
    → Inject prompt: "Write any lasting notes to memory/YYYY-MM-DD.md;
                      reply with NO_REPLY if nothing to store."
    → Model writes important context to disk
    → Older messages get compacted
    → Session continues with preserved memories
```

This prevents memory loss during long sessions — the agent saves what matters before the context window rolls over.

### File Watching

A filesystem watcher monitors `MEMORY.md` and `memory/` for changes:
- Changes mark the index as dirty (debounced 1.5 seconds)
- Re-indexing runs on session start, on search, or on interval
- Runs asynchronously — never blocks the agent

---

## Tools

Tools give the agent real-world capabilities. Each tool is a function the LLM can call during the ReAct loop.

### Built-in Tools

| Tool | Capability |
|------|-----------|
| **bash** | Execute shell commands on the host (or in Docker sandbox) |
| **browser** | Open URLs, scrape pages, fill forms via Chrome DevTools Protocol |
| **file_read** | Read file contents from the filesystem |
| **file_write** | Write/create files |
| **file_edit** | Apply diffs/patches to existing files |
| **memory_search** | Semantic search over memory files |
| **memory_get** | Read specific memory file/range |
| **calendar** | Read/write calendar events |
| **email** | Send emails |
| **web_search** | Search the internet |
| **mcp** | Connect to any MCP (Model Context Protocol) server |

### Tool Execution Flow

```
LLM response contains: tool_call("bash", { command: "ls -la /tmp" })
    │
    ▼
Runtime intercepts the tool call
    │
    ├── Check sandbox policy for this session
    │   ├── sandbox: enabled  → Execute inside Docker container
    │   └── sandbox: disabled → Execute natively on host
    │
    ▼
Execute the command, capture stdout/stderr
    │
    ▼
Return result to LLM as tool_result
    │
    ▼
LLM incorporates result into ongoing response
```

### Tool Permissions (TOOLS.md)

```markdown
# Tools

## Allowed
- bash: full access (main session only)
- browser: allowed
- file_read: allowed
- file_write: allowed (workspace only)
- memory_search: allowed
- memory_get: allowed

## Restricted
- email: requires confirmation before sending
- calendar: read-only unless explicitly approved

## Blocked
- No access to /etc, /proc, /sys
- No docker.sock access
- No network calls to internal services
```

### MCP (Model Context Protocol) Integration

OpenClaw can connect to external MCP servers, which expose additional tools:

```yaml
# In agent configuration
mcp_servers:
  - name: "github"
    command: "npx @modelcontextprotocol/server-github"
    env:
      GITHUB_TOKEN: "ghp_..."
  - name: "postgres"
    command: "npx @modelcontextprotocol/server-postgres"
    env:
      DATABASE_URL: "postgresql://..."
```

Each MCP server registers its tools with the agent runtime, making them available in the ReAct loop just like built-in tools.

---

## Skills

Skills are the playbooks that tell the agent **how** to use tools in a disciplined way. Without skills, the LLM improvises. With skills, it follows a recipe.

### What Is a Skill?

A skill is a folder containing a `SKILL.md` file:

```
skills/
└── deploy-to-production/
    └── SKILL.md
```

### SKILL.md Structure

```markdown
---
name: deploy-to-production
description: Deploy the current project to production safely
version: 1.0.0
triggers:
  - "deploy"
  - "push to prod"
  - "release"
requires:
  - bash
  - file_read
---

# Deploy to Production

## Instructions

When the user asks to deploy:

1. Run `git status` to check for uncommitted changes
   - If dirty: ask user to commit first, do NOT proceed
2. Run `npm test` to verify all tests pass
   - If tests fail: show failures, do NOT proceed
3. Run `npm run build` to create production build
   - If build fails: show errors, do NOT proceed
4. Run `./scripts/deploy.sh --tag=$(git describe --tags)`
5. Verify deployment by checking the health endpoint
6. Report success or failure to the user

## Rules

- NEVER deploy with uncommitted changes
- NEVER skip tests
- ALWAYS confirm with user before step 4
- If any step fails, stop and report — do not retry automatically
```

### Skills vs Tools

| | Tools | Skills |
|---|-------|--------|
| **What** | Raw capabilities (run command, read file) | Playbooks (how to use tools together) |
| **Format** | Code (functions) | Markdown (instructions) |
| **Analogy** | A hammer, saw, drill | A blueprint for building a shelf |
| **Without them** | Agent can't act | Agent improvises (inconsistent results) |

### Skill Loading

Skills are loaded into context **on demand** based on:
1. **Trigger words** in the user's message (from SKILL.md frontmatter)
2. **Agent role** — different agents can have different skill sets
3. **Manual activation** — user explicitly requests a skill

### Per-Agent Skill Filtering

```yaml
agents:
  research-agent:
    skills: [web-search, summarize, citation]
  devops-agent:
    skills: [shell, docker, kubernetes, deploy-to-production]
  default:
    skills: all
```

A research agent can't run shell commands. A DevOps agent can't send emails. Skills are scoped by role and trust level.

### ClawHub — The Skills Registry

ClawHub (https://clawhub.com) is the public registry with 13,700+ community-built skills. Install from terminal:

```bash
# Search for skills
openclaw skill search "deploy"

# Install a skill
openclaw skill install deploy-to-vercel

# Publish your own
openclaw skill publish --slug my-skill --name "My Skill" --version 1.0.0
```

---

## Plugins

Plugins extend OpenClaw beyond what skills can do. While skills are Markdown instruction files, plugins are **code** that can add new tools, hooks, memory backends, and channel integrations.

### Plugin Structure

```
plugins/
└── my-plugin/
    ├── openclaw.plugin.json    # Plugin manifest
    ├── index.ts                # Entry point
    ├── tools/                  # Custom tools
    │   └── my-tool.ts
    ├── hooks/                  # Lifecycle hooks
    │   └── before-message.ts
    └── skills/                 # Plugin-bundled skills
        └── my-skill/
            └── SKILL.md
```

### Plugin Manifest (openclaw.plugin.json)

```json
{
    "name": "my-plugin",
    "version": "1.0.0",
    "description": "Adds custom capabilities",
    "tools": ["tools/my-tool.ts"],
    "hooks": {
        "before:message": "hooks/before-message.ts",
        "after:message": "hooks/after-message.ts",
        "before:tool_call": "hooks/before-tool-call.ts"
    },
    "skills": ["skills/my-skill"],
    "config_schema": {
        "api_key": { "type": "string", "required": true },
        "verbose": { "type": "boolean", "default": false }
    }
}
```

### Plugin Lifecycle Hooks

Hooks let plugins intercept the agent's processing pipeline:

```
User message arrives
    │
    ▼
before:message hook ──► Can modify, filter, or reject the message
    │
    ▼
ReAct loop begins
    │
    ├── before:tool_call hook ──► Can approve, deny, or modify tool calls
    │       │
    │       ▼
    │   Tool executes
    │       │
    │       ▼
    │   after:tool_call hook ──► Can modify tool results
    │
    ▼
Response generated
    │
    ▼
after:message hook ──► Can modify, log, or post-process the response
```

### Plugin vs Skill vs Tool

| | Tool | Skill | Plugin |
|---|------|-------|--------|
| **Language** | Code | Markdown | Code |
| **Adds capabilities** | One function | Instructions for using tools | Tools + hooks + skills + config |
| **Lifecycle hooks** | No | No | Yes |
| **Custom memory backends** | No | No | Yes |
| **Installable from registry** | No | Yes (ClawHub) | Yes |
| **Use when** | You need a single new action | You need a repeatable workflow | You need deep integration |

### Memory Plugins

The default memory backend is `memory-core` (SQLite + Markdown). Plugins can replace it:

```json
{
    "name": "memory-postgres",
    "memory_backend": {
        "search": "search.ts",
        "index": "index.ts",
        "config": {
            "connection_string": { "type": "string", "required": true }
        }
    }
}
```

This lets you swap SQLite for Postgres, Milvus, Pinecone, or any vector store while keeping the same `memory_search` / `memory_get` interface.

---

## Heartbeat & Cron

These make OpenClaw proactive — it acts without being prompted.

### Heartbeat

The heartbeat runs inside the **main session** at regular intervals (default: 30 minutes). It reads `HEARTBEAT.md` and decides if anything needs attention.

#### HEARTBEAT.md

```markdown
# Heartbeat Checks

Every 30 minutes, check:

1. **Inbox** — Any new emails from @important-client.com?
2. **Calendar** — Any meetings in the next 2 hours?
3. **GitHub** — Any PRs assigned to me waiting for review?
4. **Monitoring** — Any alerts on the Grafana dashboard?

## Rules
- Only notify me if something actually needs attention
- Batch multiple items into one message
- If nothing is urgent, reply HEARTBEAT_OK (silent, no notification)
```

#### How Heartbeat Works

```
Every 30 minutes:
    │
    ▼
Gateway triggers heartbeat in main session
    │
    ▼
Agent reads HEARTBEAT.md
    │
    ▼
Runs checks (email, calendar, GitHub, etc.)
    │
    ├── Nothing urgent → Reply "HEARTBEAT_OK" (dropped silently)
    │
    └── Something needs attention → Send notification to user
        "Hey, you have a PR from Sarah waiting for review
         and a meeting with the client in 45 minutes."
```

Key properties:
- Runs in the **main session** — has full conversational context
- Can batch multiple checks into one message
- Quiet by default — only speaks when something matters
- Has access to recent conversation history for smart follow-ups

### Cron Jobs

Cron is for **precise scheduling** — things that must happen at exact times.

```yaml
cron:
  daily-standup:
    schedule: "0 9 * * 1-5"        # 9 AM weekdays
    timezone: "America/New_York"
    prompt: "Generate my daily standup update based on yesterday's git commits and today's calendar."
    session: isolated               # Separate from main session

  weekly-report:
    schedule: "0 17 * * 5"          # 5 PM Friday
    timezone: "America/New_York"
    prompt: "Write a weekly summary of completed tasks and send it to #team-updates on Slack."
    session: isolated
```

### Heartbeat vs Cron

| | Heartbeat | Cron |
|---|-----------|------|
| **Timing** | Regular interval (e.g., every 30 min) | Exact schedule (cron expression) |
| **Session** | Main session (shared context) | Isolated session (clean context) |
| **Purpose** | Awareness checks | Scheduled tasks |
| **Quiet mode** | Yes — HEARTBEAT_OK if nothing urgent | No — always runs the prompt |
| **Best for** | "Check if anything needs attention" | "Send report at 9 AM every Monday" |

---

## Sandboxing & Security

OpenClaw can run tool executions inside Docker containers for isolation.

### Sandbox Policies

```yaml
agents:
  defaults:
    sandbox:
      enabled: true
      image: "openclaw/sandbox:latest"
      network: "openclaw-sandbox"
      binds:
        - "/home/user/workspace:/workspace:rw"
      blocked_paths:
        - "/var/run/docker.sock"
        - "/etc"
        - "/proc"
        - "/sys"
        - "/dev"
```

### Per-Session Sandboxing

| Session Type | Default Sandbox | Why |
|-------------|----------------|-----|
| **Main session** | Disabled (native host) | Needs full access for development |
| **DM sessions** | Enabled (Docker) | Untrusted channel, isolate execution |
| **Group sessions** | Enabled (Docker) | Multiple users, reduce blast radius |
| **Cron sessions** | Configurable | Depends on what the job does |

### Browser Sandbox

The browser tool can run in a separate container:

```
Agent calls browser tool
    │
    ▼
Sandbox browser container starts
(Chromium + Chrome DevTools Protocol)
    │
    ▼
Dedicated Docker network: openclaw-sandbox-browser
    │
    ▼
Page loaded, content scraped
    │
    ▼
Result returned to agent
    │
    ▼
Container cleaned up
```

---

## How to Build Something Similar

If you want to implement OpenClaw-like patterns in your own agent platform (like Pulse AI), here's a mapping of concepts to implementation:

### 1. Soul System → System Prompt Files

```
OpenClaw                    Your Implementation
─────────                   ─────────────────────
SOUL.md                 →   Agent personality stored in DB or file
AGENTS.md               →   Agent registry with role definitions
TOOLS.md                →   Tool permissions per agent
IDENTITY.md             →   User preferences in settings
```

**Implementation:** Store agent personality as a text field in your agents table. Load it as the system prompt before every LLM call. Let users edit it through the dashboard.

### 2. Memory System → Markdown + SQLite Search

```
OpenClaw                    Your Implementation
─────────                   ─────────────────────
MEMORY.md               →   memory table in Postgres
memory/YYYY-MM-DD.md    →   conversation_logs table
memory_search()         →   pgvector similarity search
memory_get()            →   Direct DB query
Pre-compaction flush    →   Save context before token limit
```

**Implementation:**
```sql
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES agents(id),
    tenant_id UUID REFERENCES tenants(id),
    content TEXT NOT NULL,
    embedding VECTOR(1536),          -- pgvector
    memory_type TEXT,                -- 'fact', 'preference', 'session_log'
    source_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Skills → Prompt Templates with Metadata

```
OpenClaw                    Your Implementation
─────────                   ─────────────────────
SKILL.md files          →   skills table with prompt templates
ClawHub registry        →   Built-in + user-created skill library
Trigger words           →   Keyword matching or LLM classification
Per-agent filtering     →   agent_skills junction table
```

**Implementation:**
```sql
CREATE TABLE skills (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    prompt_template TEXT NOT NULL,    -- The SKILL.md content
    triggers TEXT[],                  -- Keywords that activate this skill
    required_tools TEXT[],           -- Tools this skill needs
    tenant_id UUID REFERENCES tenants(id),
    is_builtin BOOLEAN DEFAULT FALSE
);

CREATE TABLE agent_skills (
    agent_id UUID REFERENCES agents(id),
    skill_id UUID REFERENCES skills(id),
    PRIMARY KEY (agent_id, skill_id)
);
```

### 4. Plugins → Your Existing Plugin System

Pulse AI already has a plugin system (`pulse/plugins/`). OpenClaw's approach maps directly:

```
OpenClaw                    Pulse AI
─────────                   ─────────
openclaw.plugin.json    →   PluginManifest (index.ts export)
tools/                  →   tools[] in manifest
hooks.before:message    →   hooks["before:message"]
skills/                 →   Not yet implemented (add SKILL.md support)
```

### 5. Heartbeat → Scheduled Jobs with Smart Routing

```
OpenClaw                    Your Implementation
─────────                   ─────────────────────
HEARTBEAT.md            →   heartbeat_config in agents table
30-min interval         →   BullMQ recurring job
HEARTBEAT_OK            →   Skip notification if no action needed
Cron jobs               →   Existing scheduledJobs table
```

### Architecture Decision Summary

| OpenClaw Choice | Alternative for Server Apps |
|-----------------|---------------------------|
| Local Markdown files | Database tables (better for multi-tenant) |
| SQLite + sqlite-vec | Postgres + pgvector (already in your stack) |
| Filesystem watcher | DB triggers or event-driven updates |
| Docker sandboxing | Container per execution or code interpreter API |
| ClawHub registry | Built-in skill library + user-created skills |

---

## Sources

- [OpenClaw GitHub Repository](https://github.com/openclaw/openclaw)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [Memory Documentation](https://docs.openclaw.ai/concepts/memory)
- [Skills Documentation](https://docs.openclaw.ai/tools/skills)
- [Sandboxing Documentation](https://docs.openclaw.ai/gateway/sandboxing)
- [Cron vs Heartbeat](https://docs.openclaw.ai/automation/cron-vs-heartbeat)
- [How OpenClaw Works — Bibek Poudel (Medium)](https://bibek-poudel.medium.com/how-openclaw-works-understanding-ai-agents-through-a-real-architecture-5d59cc7a4764)
- [OpenClaw Explained — Steven Cen (Medium)](https://medium.com/@cenrunzhe/openclaw-explained-how-the-hottest-agent-framework-works-and-why-data-teams-should-pay-attention-69b41a033ca6)
- [OpenClaw Architecture Overview — Paolo (Substack)](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [OpenClaw Design Patterns — Ken Huang (Substack)](https://kenhuangus.substack.com/p/openclaw-design-patterns-part-1-of)
- [OpenClaw Memory Deep Dive — Study Notes](https://snowan.gitbook.io/study-notes/ai-blogs/openclaw-memory-system-deep-dive)
- [Soul Memory Skill Explained — DEV Community](https://dev.to/aloycwl/understanding-the-soul-memory-skill-for-openclaw-ai-memory-management-explained-4phb)
- [Memory & Search — DeepWiki](https://deepwiki.com/openclaw/openclaw/3.4.3-memory-and-search)
- [Local-First RAG with SQLite — PingCAP](https://www.pingcap.com/blog/local-first-rag-using-sqlite-ai-agent-memory-openclaw/)
- [OpenClaw — Milvus Complete Guide](https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md)
- [OpenClaw — Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [OpenClaw — DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- [OpenClaw — MindStudio](https://www.mindstudio.ai/blog/what-is-openclaw-ai-agent)
