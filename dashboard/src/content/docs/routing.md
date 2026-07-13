If your workspace has more than one agent, routing decides which agent picks up an inbound message. This page covers single-agent, non-department conversations — direct messages and other channel-less messages. If the message arrived inside a [department or group](/dashboard/docs/departments), a different mechanism handles it — see the note at the bottom.

Routing rules live at **Agents → Routing**.

## Turning it on

Multi-agent routing is enabled per workspace by a Pulse administrator. If it isn't turned on for your workspace, the Routing page tells you it's not enabled instead of showing the rule list, and every inbound message goes to the receiving channel's default agent regardless of any rules you might otherwise want to configure. Contact your administrator if you need this feature turned on.

## How a rule is evaluated

Rules are checked **in priority order — lowest number first** — and the **first match wins**. A change can take a few seconds to take effect.

| Rule type | Matches when | Match value |
|---|---|---|
| **Contact** | The message is a direct message from this person, or, in a group, sent by this person | A Telegram user ID |
| **Group** | The message is in this specific group | A Telegram group ID |
| **Keyword** | The message content matches this pattern | A case-insensitive pattern, e.g. `support\|help\|billing` |
| **Channel Default** | The message arrived on this channel type | `telegram`, `webchat`, `whatsapp`, or `api` |

If no rule matches — or routing isn't enabled — the message goes to whichever agent the receiving channel was set up with as its default, and if that's also unset, to any enabled agent in the workspace as a last resort.

## Creating a rule

Each rule needs a **type**, a **match value**, the **agent** to route to, and a **priority** (lower number = evaluated first; default 100). An optional description is just for your own reference in the table. Rules can be individually enabled or disabled without deleting them.

> **Regex validation happens when you save.** An invalid keyword pattern is rejected with an error rather than silently never matching.

## Departments bypass this page entirely

If the inbound message belongs to a [department or group](/dashboard/docs/departments), none of the above runs. The response is already decided by that department's lead-agent and @mention logic before routing is ever consulted. Use a department's own agent assignment and lead settings to control who answers inside it; use this page only for direct messages and other channel-less traffic.

## Good to know

Rules are workspace-wide, not per-agent — any agent in the workspace can be a routing target, regardless of which agent originally owns a channel connection.
