"Tools" are the functions an agent can actually call. This page covers the built-in catalog, the (important, easy-to-miss) difference between a tool being *registered* in code and being *enabled* for a tenant, and Tool Search — the mechanism that keeps large tool lists from bloating every prompt.

## The built-in tool catalog

`pulse/src/agent/tools/registry.ts` registers this fixed set of built-in tools in code:

| Group | Tools |
|---|---|
| Utility | `get_current_time`, `calculator` |
| Execution | `exec`, `process`, `python_execute` |
| Sandbox | `sandbox` / enhanced sandbox tool (injected only if Docker sandbox or the enhanced sandbox mode is on for the agent) |
| Scripts | `script_save`, `script_load`, `script_list` |
| Memory | `memory_store`, `memory_search`, `memory_forget` |
| Scheduling | `schedule_job`, `schedule_once`, `list_jobs`, `cancel_job` |
| Multi-agent | `delegate_to_agent`, `list_agents`, `route_to_channel` |
| Credentials | `credential_list` |
| Email | `email_send`, `email_read`, `email_list`, `email_fetch_unread`, `email_reply`, `email_search`, `email_flag`, `email_move`, `email_delete`, `email_folders` |
| Self-config | `workspace_update` (only injected if the agent's **Self-config** flag is on) |

Beyond this fixed list, an agent can also pick up **extension tools**: MCP server tools, [plugin](/docs/tools--plugins)-contributed tools, [custom HTTP tools](/docs/tools--custom), and [server SSH tools](/docs/tools--servers). These are loaded per-agent based on their own bindings/assignments, not through the mechanism below.

## Registered vs. enabled — the tenant_skills gate

This is the single most important thing to understand about built-in tools: **being in the registry above does not mean an agent can use it.** Every tenant has a `tenant_skills` table (`tenantId`, `skillName`, `enabled`), and `ToolRegistry.getEnabledTools()` only loads a built-in tool into an agent's toolset if there is a matching, enabled row for that exact tool name.

> **`tenant_skills` is not seeded automatically.** Creating a new tenant (`createTenantAction` in `dashboard/src/app/admin/tenants/actions.ts`) does not insert any `tenant_skills` rows. There is no dashboard UI to bulk-toggle it either. In practice, rows get created by hand-written SQL migrations that target tenants already using a related tool — see `scripts/migrations/0026_email_tools_skills.sql`, which back-fills `email_reply`, `email_search`, `email_flag`, `email_move`, `email_delete`, `email_folders`, and `email_fetch_unread` for any tenant that already had `email_send` enabled.
>
> The practical consequence: **when a new built-in tool ships, it is invisible to every existing tenant until someone inserts a `tenant_skills` row for it.** If an agent can't see a tool you know exists in code, check `tenant_skills` before assuming a bug.

## "Skills" in the dashboard is a different thing

The **Skills** section on an agent (Capabilities → Skills) does *not* control the gate above. It toggles `agentProfiles.skillConfig.enabledBuiltIn` / `disabledBuiltIn` against a fixed list — `memory`, `scheduling`, `workspace`, `delegation`, `scripts`, `python`, `formatting`, `skill-creator`, `email` — plus any custom skills you write yourself. These are **usage-guidance documents** (`pulse/src/agent/skills/*.skill.md`) injected into the system prompt to teach the model *how* to use tools it already has; they don't grant or revoke tool access. An agent can have a skill's guidance turned off while the underlying tool (gated by `tenant_skills`) is still callable, and vice versa.

## Tool Search — progressive disclosure

Once an agent accumulates enough MCP servers, plugins, custom tools, and server bindings, sending every tool's full schema on every turn bloats the prompt and hurts tool selection. Tool Search (`pulse/src/agent/tools/tool-search.ts`) solves this by hiding "deferrable" tools behind a meta-tool the model can call to search for what it needs.

A tool is deferrable if its `source` is `"plugin"`, `"mcp"`, `"custom"`, or `"server"` — built-in tools and workspace/sandbox tools are never deferred.

| Mode | Behavior |
|---|---|
| `off` | Every tool's full schema is always sent. Simplest, but slower and less accurate once an agent has many integrations. |
| `auto` (default) | All tools are sent normally until the deferrable count exceeds a threshold (default 12), then Tool Search kicks in. |
| `on` | Deferrable tools are always hidden behind search, regardless of count. |

When active, the model gets the core (non-deferrable) tool schemas plus one `tool_search` tool. Calling `tool_search` with a plain-language query (e.g. *"upload a file to OneDrive"*) ranks deferred tools by keyword overlap in name and description (name matches score 3x higher than description matches) and returns up to `maxResults` (default 6) matching tool definitions, which the model can then call directly for the rest of that conversation.

This is configured per-tenant, not per-agent, under **Settings → Plugins**: mode, the auto-mode threshold, and max results per search.

## Related

- [Tool Policy](/docs/agents--tool-policy) — allow/deny/ask rules layered on top of whichever tools actually get loaded.
- [Custom Tools](/docs/tools--custom), [MCP servers](/docs/tools--mcp), [Servers (SSH)](/docs/tools--servers), [Plugins](/docs/tools--plugins) — the extension tool sources.
