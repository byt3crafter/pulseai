MCP (Model Context Protocol) is the open standard for exposing a set of tools over a URL. Pulse can act as **both sides** of that connection — it can call out to someone else's MCP server, and it can let a third-party CLI (Claude Code, Cursor, Codex) call into Pulse. These are two separate, unrelated features that happen to share the acronym — this page covers both so you don't confuse them.

## Attaching an external MCP server

This is the **Tools & Infrastructure → MCP Servers** page. Add a server once, then bind it to whichever agents should use it.

| Field | Notes |
|---|---|
| **Server Name** | A label, e.g. "ERPNext Production". |
| **Server URL** | The MCP server's endpoint. |
| **Auth Headers** | Optional JSON object sent with every request, e.g. `{"Authorization": "Bearer sk-..."}`. |

> The connection is made with the MCP SDK's **SSE transport** (`SSEClientTransport`), not Streamable HTTP. The server you're pointing at needs to speak MCP-over-SSE for the connection to succeed.

Once a server is added, bind it to one or more agents from the same card — an agent only sees the server's tools if it's explicitly bound. Unbinding (or deleting the server) removes access immediately.

### What the agent sees

Every tool the remote server exposes becomes available to the agent, renamed `mcp_<serverId>_<toolname>` to avoid clashing with built-in or other tools. Only the remote tool's text output is passed back to the model — non-text content parts are dropped. A connection is opened once per server and reused for the life of the gateway process.

> **Auth header storage:** unlike Custom Tools headers or Server SSH credentials, the auth headers you paste in here are **not encrypted at rest** — they're stored as a plain JSON column. Avoid pasting long-lived, high-privilege secrets until this is hardened; scope the token to the least access the MCP server allows.

## Pulse as an MCP server (Third-Party CLI Access)

The other direction: an external tool like **Claude Code, Cursor CLI, or Codex** can connect to *your* Pulse workspace as an MCP client, over `POST/GET/DELETE /mcp` with a Bearer token. This is a different surface — configured under **Settings → API & Developer → Third-Party CLI Access** (`enable_third_party_cli`), not the MCP Servers page above.

Once enabled and a client has connected through the OAuth flow, it gets three tools:

| Tool | Does |
|---|---|
| `send_message` | Sends a message to your tenant's agent and returns its reply, optionally continuing an existing conversation. |
| `list_conversations` | Lists recent conversations for the tenant. |
| `get_conversation` | Fetches the messages in one conversation (tenant-scoped — it will refuse a conversation ID that isn't yours). |

If the connecting client passes `?agent=<agentProfileId>` (this is how a [Codex-backed agent](/docs/setup/providers) operates rather than just chats), that agent's own enabled tools — `workspace_update`, memory tools, custom tools, sandbox, and so on — are exposed on the session too, and any tool marked "ask" in that agent's [Tool Policy](/docs/agents/tool-policy) still has to go through the same approval gate it would on any other channel. Nothing here bypasses that.

## Good to know

- The two features don't interact: binding an external MCP server to an agent has no effect on whether that agent can be reached *as* an MCP server, and vice versa.
- There's no built-in retry or health check for external MCP servers — if a bound server goes down, calls to its tools will simply fail at request time.
