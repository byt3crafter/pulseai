Email works the same way Telegram does: a company-wide mailbox configured once in Settings, and an optional per-agent override for an agent that needs its own address. Once configured, agents get a full mailbox toolset — not just "send an email" — once that toolset is switched on for your workspace (more on that below).

## SMTP and IMAP setup

Go to **Settings → Email**. There are two independent cards:

**SMTP (Outgoing Email)** — required for an agent to send anything.

| Field | Notes |
|---|---|
| Host | e.g. `smtp.gmail.com` |
| Port | `587` (STARTTLS) or `465` (implicit TLS) — Pulse detects which to use based on the port itself |
| Username | mailbox login |
| Password | most providers require an **app password**, not your normal login password (Gmail and Microsoft 365 both do) |
| From Address | what recipients see as the sender |
| Use TLS | on by default |

**IMAP (Incoming Email)** — the dashboard describes this as *"Optional — needed for email_read and email_list tools."* That undersells it: **every read-oriented tool needs IMAP**, not just those two — see the full list below. If you only fill in SMTP, the agent can send mail but cannot read, search, reply to, flag, move, delete, or list anything in the inbox.

| Field | Notes |
|---|---|
| Host | e.g. `imap.gmail.com` |
| Port | `993` (default, implicit TLS) |
| Username / Password | same mailbox, or a different one if you want sending and receiving split across accounts |
| Use TLS | on by default |

Use **Test Connection** after saving — it opens a real connection to both servers and reports which one succeeded, so a mistyped host or a rejected app password shows up immediately instead of on the agent's first real send.

## Company-wide vs. per-agent email

Same two-tier model as Telegram:

- **Settings → Email** sets the **workspace-wide default mailbox** — every agent without its own configuration sends and reads through this one.
- **Agent Profiles → an agent → Email section** lets that one agent use **"Use Company Email"** (default — inherits the workspace mailbox) or switch to **"Use Custom Email"** and set its own SMTP/IMAP, sender display name, and a default CC list applied to everything it sends.

If the agent has its own SMTP host configured, **the agent's own settings win outright** — the company mailbox isn't consulted at all. Otherwise, the company mailbox is used.

The **signature** is decided separately from which mailbox wins, and the rule is worth knowing: if the agent has *any* signature saved — even one you've toggled off — that agent-level signature (or lack of one) always overrides the company default. Only an agent with no signature configuration at all inherits the company default, and only if the company default is enabled. This lets an agent send through the shared company mailbox while still signing with its own name, or vice versa.

The signature editor has two modes, toggled at the top of the card: **Builder** (name, title, company, links filled into a template, with an optional logo) and **Raw HTML** (paste your own markup). Either way, the agent is told not to write its own sign-off — the signature is appended automatically on send.

## The full email toolset

Connecting SMTP/IMAP doesn't hand an agent tools by itself — see the note below — but once the toolset is switched on, this is what an agent can do with it:

| Tool | Needs | What it does |
|---|---|---|
| Send | SMTP | Sends an email — to/cc/bcc, subject, plain and optional HTML body, attachments up to 15 MB total. Signature is appended automatically if configured. |
| List | IMAP | Lists recent inbox messages — subject, sender, date only. Lighter than reading full messages. |
| Read | IMAP | Reads recent inbox messages with a short preview. |
| Fetch unread | IMAP | Fetches unread messages **with full body text** — the tool an agent uses to actually process new mail. Marks them read by default so a repeated check doesn't reprocess the same message; the agent can ask to peek without marking it read. |
| Reply | IMAP + SMTP | Replies to a specific message so it threads properly in the recipient's inbox instead of arriving as a new email. Recipient and subject are taken from the original automatically. |
| Search | IMAP | Searches by sender, subject, unread status, or recency. Returns headers only, no bodies. |
| Flag | IMAP | Marks a message read/unread or flagged/unflagged. |
| Move | IMAP | Moves a message to another folder. |
| Delete | IMAP | Deletes a message (moves it to Trash where the mailbox has one). Destructive — see the approval note below. |
| List folders | IMAP | Lists the mailbox's folders, so the agent knows valid targets when moving mail. |

## Why an agent might still not send or read mail

This is the single most common "why can't my agent send an email" issue, and it isn't a setup mistake on your part.

The email toolset above is switched on for your workspace as part of onboarding, not from a toggle in the dashboard. A workspace that had email sending enabled before some of the newer tools (search, reply, and so on) shipped may still be missing those specific tools today, even with SMTP and IMAP both configured and passing **Test Connection**.

The trap: the **Skills** tab in the agent editor (Agent Profiles → an agent → Capabilities → Skills) looks like the obvious place to fix this, and isn't — it controls something else entirely. See [Tools & Skills](/dashboard/docs/agents/tools) for the full explanation. The short version: that tab toggles an instructional document that just teaches general email conventions — it has no effect on whether the send/read/reply tools are actually present for the agent.

If your agent has SMTP/IMAP configured and connection-tested successfully but still can't send or read mail, contact your Pulse administrator and ask them to check which email tools are enabled for your workspace.

## Gate sending behind approval

Sending and replying to email — and deleting it — are good candidates for a human-in-the-loop check before an agent's words go out under your company's name. Add them to the agent's "ask" list in [Tool Policy](/dashboard/docs/agents/tool-policy) — the agent drafts the email, a designated approver sees the exact recipient, subject, and body, and only an approved send actually goes out. See [Approval gates](/dashboard/docs/approvals) for how the approval card itself is delivered and decided. The [CFO email loop](/dashboard/docs/recipes/cfo-email) recipe walks through this exact pattern end to end.

## Related

- [Tools & Skills](/dashboard/docs/agents/tools) — the full picture of what makes a tool available, and why the Skills tab doesn't fix it.
- [Tool Policy](/dashboard/docs/agents/tool-policy) — gate sending, replying, or deleting behind an approval.
- [Approval gates](/dashboard/docs/approvals) — how an approval card is delivered and decided.
- [People & approvers](/dashboard/docs/people) — who's allowed to approve a gated send.
