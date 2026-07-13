If your workspace has more than one agent, routing decides which agent picks up an inbound message. This page is about single-agent, non-department conversations — DMs and channel-less messages. If the message arrived inside a [department or group](/docs/departments), a different mechanism handles it (see the note at the bottom).

Routing rules live at **Agents → Routing**.

## Turning it on

Multi-agent routing is an **admin-enabled feature per workspace** (`tenants.config.multi_agent_routing_enabled`). If it isn't turned on for your workspace, the Routing page shows "Feature not enabled — contact your administrator" instead of the rule list, and every inbound message falls through to the channel connection's default agent regardless of any rules you might otherwise configure. Ask your Pulse administrator to enable it if you need this.

## How a rule is evaluated

Rules are checked **in priority order — lowest number first** — and the **first match wins**. Rules are cached per workspace for 15 seconds, so a change can take a few seconds to take effect.

| Rule type | Matches when | Match value |
|---|---|---|
| **Contact** | The message is a DM from this person, or (in a group) sent by this person | A Telegram user ID |
| **Group** | The message is in this specific group/chat | A Telegram group/chat ID (negative number) |
| **Keyword** | The message content matches this pattern | A case-insensitive regular expression, e.g. `support\|help\|billing` |
| **Channel Default** | The message arrived on this channel type | `telegram`, `webchat`, `whatsapp`, or `api` |

If no rule matches — or routing isn't enabled — the message goes to whatever agent the receiving channel connection was set up with (its "default agent"), and if that's also unset, to any enabled agent in the workspace as a last resort.

## Creating a rule

Each rule needs a **type**, a **match value**, the **agent** to route to, and a **priority** (lower = evaluated first, default 100). An optional description is just for your own reference in the table. Rules can be individually enabled/disabled without deleting them.

## Departments bypass this page entirely

If the inbound message belongs to a [department or group channel](/docs/departments), none of the above runs. The responder is already decided by the channel's lead-agent / @mention logic before the runtime gets anywhere near these rules — the pre-resolved responder is honored directly. Use Departments' agent assignment and lead settings to control routing inside a channel; use this page only for plain DMs and channel-less traffic.

## Good to know

- Regex validation happens at save time — an invalid pattern is rejected with an error rather than silently never matching.
- Rules are workspace-wide, not per-agent — any agent in the workspace can be a routing target regardless of which agent originally "owns" a channel connection.
