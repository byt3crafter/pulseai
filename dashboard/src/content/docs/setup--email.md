Email works the same way Telegram does: a company-wide mailbox configured once in Settings, and an optional per-agent override for an agent that needs its own address. Once configured, agents get a full mailbox toolset — not just "send an email."

## SMTP and IMAP setup

Go to **Settings → Email**. There are two independent cards:

**SMTP (Outgoing Email)** — required for an agent to send anything.

| Field | Notes |
|---|---|
| Host | e.g. `smtp.gmail.com` |
| Port | `587` (STARTTLS) or `465` (implicit TLS) — Pulse detects which based on the port, not the TLS toggle |
| Username | mailbox login |
| Password | most providers require an **app password**, not your normal login password (Gmail, Microsoft 365 both do) |
| From Address | what recipients see as the sender |
| Use TLS | on by default |

**IMAP (Incoming Email)** — the dashboard describes this as *"Optional — needed for email_read and email_list tools"*. That undersells it: **every read-oriented tool needs IMAP**, not just those two — see the full list below. If you only fill in SMTP, the agent can send mail but cannot read, search, reply to, flag, move, delete, or list anything in the inbox.

| Field | Notes |
|---|---|
| Host | e.g. `imap.gmail.com` |
| Port | `993` (default, implicit TLS) |
| Username / Password | same mailbox, or a different one if you want send/receive split across accounts |
| Use TLS | on by default |

Use **Test Connection** after saving — it opens a real SMTP/IMAP connection and reports which one succeeded, so a typo'd host or a rejected app password shows up immediately instead of on the agent's first real send.

## Company-wide vs per-agent email

Same two-tier model as Telegram:

- **Settings → Email** sets the **tenant-wide default mailbox** — every agent without its own config sends and reads through this one.
- **Agent Profiles → an agent → Email section** lets that one agent use **"Use Company Email"** (default — inherits the tenant mailbox) or switch to **"Use Custom Email"** and set its own SMTP/IMAP, sender display name, and a default CC list applied to everything it sends.

Resolution, exactly as implemented (`pulse/src/channels/email/email-service.ts`, `resolveEmailConfig`): if the agent has its own SMTP host configured, **the agent's config wins outright** — the tenant mailbox is not consulted at all. Otherwise, the tenant mailbox is used.

The **signature** resolves independently of which mailbox wins, and the rule is subtle: if the agent has *any* signature saved — even one it has toggled off — that agent-level signature (or lack of one) always overrides the company default. Only an agent with **no signature configuration at all** inherits the company default, and only if the company default is enabled. This lets an agent send through the shared company mailbox while still signing with its own name, or vice versa.

The signature editor itself has two modes, toggled at the top of the card: **Builder** (name/title/company/links filled into a template, optional logo) and **Raw HTML** (paste your own markup). Either way, the agent is told not to write its own sign-off — the signature is appended automatically on send.

## The full email toolset

Connecting SMTP/IMAP doesn't hand an agent tools by itself — see the gotcha below — but once tools are enabled, this is the complete native toolset (`pulse/src/agent/tools/built-in/email.ts`). There is no dependency on any external CLI; it's nodemailer (SMTP) and imapflow (IMAP) directly.

| Tool | Needs | What it does |
|---|---|---|
| `email_send` | SMTP | Sends an email — to/cc/bcc, subject, plain + optional HTML body, file attachments up to 15 MB total. Signature is appended automatically if configured. |
| `email_list` | IMAP | Lists recent inbox messages — subject, sender, date only. Lighter than `email_read`. |
| `email_read` | IMAP | Reads recent inbox messages with a short snippet. |
| `email_fetch_unread` | IMAP | Fetches unread messages **with full body text** — the tool an agent uses to actually process new mail. Marks them read by default so a repeated call doesn't reprocess the same message; pass `mark_read:false` to peek without consuming. |
| `email_reply` | IMAP + SMTP | Replies to a specific message by UID, threaded (`In-Reply-To`/`References` headers), so the recipient sees a reply, not a new email. Recipient and subject are taken from the original automatically. |
| `email_search` | IMAP | Searches by sender, subject, unread status, or recency. Returns envelopes only, no bodies. |
| `email_flag` | IMAP | Marks a message read/unread or flagged/unflagged by UID. |
| `email_move` | IMAP | Moves a message to another folder. |
| `email_delete` | IMAP | Deletes a message (moves it to Trash where the mailbox has one). Destructive — see the approval note below. |
| `email_folders` | IMAP | Lists the mailbox's folders, so the agent knows valid targets for `email_move`. |

## The invisible-tool gotcha

This is the single most common "why can't my agent send an email" support issue, and it isn't what it looks like.

Every one of the ten tools above is gated per-tenant by a database table, `tenant_skills`, keyed by the **exact tool name** (`email_send`, `email_reply`, etc.). If there's no enabled row for a tool, that tool is simply never handed to the LLM — not disabled, not greyed out, just absent, and the agent has no way to know it exists. **There is no dashboard or admin UI for this table at all** — new tools aren't back-filled for existing tenants automatically, so a tenant that had `email_send` enabled long before `email_reply`/`email_search`/etc. shipped may still be missing them today.

The trap: the **Skills** tab in the agent editor (Agent Profiles → an agent → Capabilities → Skills) looks like the obvious place to fix this, and isn't — it controls something else entirely. See [Tools & Skills](/docs/agents--tools) for the full explanation of the registered-vs-enabled gate and why the Skills tab doesn't touch it. The short version: that tab toggles `.skill.md` *instruction* documents (a general "email" skill that just teaches SMTP/IMAP usage) — it has no effect on whether `email_send` etc. are actually present in the agent's tool list.

If your agent has SMTP/IMAP configured but still can't send or read mail, ask whoever runs your Pulse deployment to check the `tenant_skills` table for your tenant — historically this has been fixed with a hand-written SQL migration (see `scripts/migrations/0026_email_tools_skills.sql` for the pattern used to back-fill the newer email tools).

## Gate sending behind approval

`email_send` (and `email_delete`, `email_reply`) are good candidates for a human-in-the-loop check before an agent's words go out under your company's name. Add them to the agent's `ask` list in [Tool Policy](/docs/agents--tool-policy) — the agent drafts the email, a designated approver sees the exact recipient/subject/body and approves or denies it, and only an approved send actually calls SMTP. See [Approval gates](/docs/approvals) for how the approval card itself is delivered and decided. The [CFO email loop](/docs/recipes--cfo-email) recipe walks through this exact pattern end to end.

## Related

- [Tools & Skills](/docs/agents--tools) — the registered-vs-enabled `tenant_skills` gate in full, and why the Skills tab doesn't fix it.
- [Tool Policy](/docs/agents--tool-policy) — gate `email_send`/`email_reply`/`email_delete` behind an approval.
- [Approval gates](/docs/approvals) — how an approval card is delivered and decided.
- [People & approvers](/docs/people) — who's allowed to approve a gated send.
