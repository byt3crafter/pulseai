"Tools" are the actions your agent can take beyond writing a reply — sending an email, checking the time, searching its memory, running a scheduled task. This page covers the built-in catalog, and clears up two dashboard controls that are easy to mistake for on/off switches.

## The built-in catalog

| Group | Tools |
|---|---|
| Utility | `get_current_time`, `calculator` |
| Command execution | `exec`, `process`, `python_execute` |
| Sandbox | An isolated code-execution environment — only appears if Sandbox is turned on for this agent |
| Saved scripts | `script_save`, `script_load`, `script_list` |
| Memory | `memory_store`, `memory_search`, `memory_forget` |
| Scheduling | `schedule_job`, `schedule_once`, `list_jobs`, `cancel_job` |
| Multi-agent | `delegate_to_agent`, `list_agents`, `route_to_channel` |
| Credentials | `credential_list` |
| Email | `email_send`, `email_read`, `email_list`, `email_fetch_unread`, `email_reply`, `email_search`, `email_flag`, `email_move`, `email_delete`, `email_folders` |
| Self-editing | `workspace_update` — only appears if **Agent Self-Config** is on (see [Profile, Soul & Identity](/dashboard/docs/agents/profile)) |

An agent can also pick up **connected tools** beyond this list: MCP servers, [plugins](/dashboard/docs/tools/plugins), [custom HTTP tools](/dashboard/docs/tools/custom), and [server access](/dashboard/docs/tools/servers) you've attached to it directly.

> Built-in tool availability is provisioned for your workspace — it isn't something you switch on yourself, and there's no self-serve toggle for the tools in the table above. If an agent seems to be missing a tool you expect it to have, ask your Pulse administrator or contact support.

## Two tabs that don't do what their names suggest

Both of these live on the agent editor and are easy to mistake for access controls. Neither one is.

> **The "Tools Guidance" tab is a notes file, not a switch.** It's where you write operating notes for a tool the agent already has — hostnames, device nicknames, house rules. Writing "the agent may use `email_send`" there does nothing on its own; it does not grant, remove, or change access to any tool.

> **The "Skills" tab toggles instructions, not tools.** Each skill — Memory, Scheduling, Workspace, Delegation, Scripts, Python, Formatting, Skill Creator, Email, plus any custom ones you write — is a short usage-guidance document that teaches the agent *how* to use tools it already has. Turning a skill off removes that guidance from the agent's instructions; it does not take the underlying tool away. Turning a skill on does not give the agent a tool it didn't already have. Access to a tool and guidance on how to use it are controlled separately.

If you want to actually restrict what an agent can call, use [Tool Policy](/dashboard/docs/agents/tool-policy).

## Tool Search

Once an agent has picked up enough connected tools — several MCP servers, plugins, custom tools, servers — sending the full detail of every single one on every message slows the agent down and can make it pick the wrong tool. Tool Search hides the less-common ones behind a quick internal lookup: the agent describes what it needs in plain language, and only the closest matches come back with full detail.

| Mode | Behavior |
|---|---|
| Off | Every connected tool's full detail is always sent. Simplest, but slower and less accurate once an agent has many integrations. |
| Automatic (default) | Tools are sent normally until the number of connected tools passes a threshold, then Tool Search kicks in. |
| On | Connected tools are always behind search, regardless of count. |

This is set for your whole workspace, not per agent, under **Settings → Plugins**: the mode, the automatic threshold, and how many results a search returns.

## Related

- [Tool Policy](/dashboard/docs/agents/tool-policy) — allow, deny, and approval rules layered on top of whichever tools an agent actually has.
- [Custom Tools](/dashboard/docs/tools/custom), [MCP servers](/dashboard/docs/tools/mcp), [Servers (SSH)](/dashboard/docs/tools/servers), [Plugins](/dashboard/docs/tools/plugins) — how to connect more tools.
