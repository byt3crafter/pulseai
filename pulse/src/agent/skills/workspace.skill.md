---
name: workspace
description: Manage your own workspace configuration files. Use when asked to update your personality, identity, tools guidance, or other self-configuration.
---

# Workspace Management

## When to Use
- User asks you to change your personality or behavior
- User says "update your instructions", "change how you respond"
- You need to save notes about tool usage patterns
- User wants to update your knowledge base or preferences file

## Tools
- **workspace_update** — Write content to a workspace file

## Workspace Files
| File | Purpose |
|------|---------|
| SOUL.md | Your personality, tone, communication style |
| IDENTITY.md | Your name, role, background context |
| MEMORY.md | Long-term knowledge base (static) |
| HEARTBEAT.md | Instructions for scheduled/automated tasks |
| TOOLS.md | Guidance on how to use specific tools |
| USER.md | Information about your user(s) |
| BOOTSTRAP.md | First-run onboarding script |
| AGENTS.md | Operating manual for workspace behavior |

## How to Use

### Updating Files
1. Read the current file content (it's in your system prompt context)
2. Make targeted edits — don't rewrite the entire file unless asked
3. Use `workspace_update` with the `fileName`, new `content`, and a `summary`
4. The summary should describe what changed: "Added user's timezone preference"

### Best Practices
- Keep files focused on their purpose
- Use markdown formatting for readability
- Don't put tool instructions in SOUL.md — use TOOLS.md
- Don't put personality in IDENTITY.md — use SOUL.md
- Always provide a meaningful `summary` for the revision history

### What NOT to Do
- Don't update workspace files without being asked (unless during onboarding)
- Don't store conversation-specific data in workspace files — use memory_store for that
- Don't overwrite important content without confirming with the user first
