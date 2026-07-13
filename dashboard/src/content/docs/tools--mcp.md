MCP (Model Context Protocol) is an open standard for exposing a set of tools over a URL. Pulse can act as **both sides** of that connection: it can call out to someone else's MCP server, and it can let a coding tool like Claude Code, Cursor, or Codex call into your Pulse workspace. These are two separate, unrelated features that happen to share the same standard — this page covers both so you don't confuse them.

## Attaching an external MCP server

This is the **Tools & Infrastructure → MCP Servers** page. Add a server once, then bind it to whichever agents should use it.

| Field | Notes |
|---|---|
| **Server Name** | A label, e.g. "ERPNext Production". |
| **Server URL** | The MCP server's endpoint. |
| **Auth Headers** | Optional JSON object sent with every request, e.g. `{"Authorization": "Bearer sk-..."}`. |

> Pulse connects using the SSE (Server-Sent Events) style of the MCP protocol, not the newer Streamable HTTP variant. The server you're pointing at needs to support MCP over SSE for the connection to succeed.

Once a server is added, bind it to one or more agents from the same card — an agent only sees a server's tools if it's explicitly bound to it. Unbinding a server (or deleting it) removes access immediately.

### What the agent sees

Every tool the remote server exposes becomes available to the agent, with the server's name added to it to avoid clashing with built-in or other tools. Only the remote tool's text output is passed back to the agent — anything that isn't text (images, files, etc.) is dropped.

> **Auth header storage:** unlike Custom Tools headers or the credentials you store for Servers (SSH), the auth headers you enter here are **not encrypted at rest** today. Avoid pasting long-lived, high-privilege secrets into an MCP server's auth headers — use a scoped, low-privilege token instead, limited to only what that server needs.

## Letting an external AI coding tool use your workspace

The other direction: a tool like **Claude Code, Cursor CLI, or Codex** can connect to *your* Pulse workspace and send it messages, the same way a person would over Telegram or chat. This is a separate feature, configured under **Settings → API & Developer → Third-Party CLI Access** — not the MCP Servers page above.

Once you turn it on and sign in from the connecting tool, it gets three capabilities:

| Capability | Does |
|---|---|
| Send a message | Sends a message to your agent and returns its reply, optionally continuing an existing conversation. |
| List conversations | Lists recent conversations in your workspace. |
| Read a conversation | Fetches the messages in one conversation — it will refuse a conversation that isn't yours. |

If the connecting tool addresses one specific agent rather than your default, that agent's own tools become available on the session too — and anything set to require approval in that agent's [Tool Policy](/dashboard/docs/agents/tool-policy) still asks for approval exactly as it would on any other channel. Nothing about this connection skips that gate.

## Good to know

- The two features don't interact: binding an external MCP server to an agent has no effect on whether that agent can be reached through Third-Party CLI Access, and vice versa.
- There's no automatic retry or health check for an external MCP server — if a server you've bound goes down, calls to its tools fail when an agent tries to use them.
