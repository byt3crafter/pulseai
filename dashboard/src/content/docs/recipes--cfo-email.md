This is the flagship Pulse workflow: an agent that reads its own inbox, looks up real data, drafts a reply, and then **stops and waits for a human to tap Allow** before anything goes out. It's a proven, working pattern — every step below is something the product actually does today, including the rough edges. Follow it in order; step 3 has a real gotcha that will silently leave your agent unable to send mail if you skip it.

## 1. Create the agent

Create an agent and give it a finance/CFO persona — name, description, and system-prompt "soul" live on the agent's profile. See [Profile, Soul & Identity](/docs/agents/profile) for what each field actually controls, and [AI providers](/docs/setup/providers) to give it a model (Anthropic, OpenAI, or another supported backend).

For this recipe we'll call it **"Finance Agent"**.

## 2. Connect its email

Go to **Settings → Email** and fill in SMTP (to send) and IMAP (to read) — see [Email (SMTP & IMAP)](/docs/setup/email) for the exact fields. Both passwords are encrypted before they're stored (`config.smtp.encryptedPassword` / `config.imap.encryptedPassword`, AES-256-GCM — see [Security](/docs/security)).

Use a real mailbox your agent is allowed to act on, e.g. `finance@acme.example`. This step only stores the connection — it does **not** yet give the agent permission to use any email tool. That's the next step, and it's not automatic.

## 3. Turn on the email tools — and the gotcha

The tools you need are:

- `email_fetch_unread` — pull unread messages
- `email_search` — look up a specific thread
- `email_reply` — reply within a thread
- `email_send` — send a new message

> **Gotcha: there is currently no dashboard toggle for this.** Built-in tools like the email set are gated per-tenant by a `tenant_skills` database row (`skill_name` = the tool name, `enabled` = true) — see `pulse/src/agent/tools/registry.ts`. Connecting SMTP/IMAP in Settings → Email does not insert these rows. If nobody enables them, the agent will call the tool, get gated off silently from its own perspective, and either fail or (worse) claim it "sent" something it didn't. If you have direct database access, enable them yourself:
> ```sql
> INSERT INTO tenant_skills (tenant_id, skill_name, enabled) VALUES
>   ('<your-tenant-id>', 'email_fetch_unread', true),
>   ('<your-tenant-id>', 'email_search', true),
>   ('<your-tenant-id>', 'email_reply', true),
>   ('<your-tenant-id>', 'email_send', true)
> ON CONFLICT (tenant_id, skill_name) DO UPDATE SET enabled = true;
> ```
> Find `<your-tenant-id>` in **Admin → Tenants** (shown under each workspace's name). If you don't have database access, ask whoever operates your Pulse deployment to run this for you. See [Tools & Skills](/docs/agents/tools) for how built-in tools fit together generally.

## 4. Connect the business system it reads from

For the agent to answer a real customer question with real data (an invoice balance, an order status), connect the [ERPNext plugin](/docs/tools/plugins) under Settings → Plugins with your ERPNext URL, API key, and API secret. An admin must have approved/enabled the plugin at the platform level first — if it's missing from your plugin list, that's the step to check. Once configured, the agent gets tools like `erpnext_list` and `erpnext_report` and is instructed to actually call them rather than guess.

## 5. Set a Tool Policy so nothing goes out unapproved

Open the agent's **Tool Policy** tab and add to **"Ask First — Require Approval"**:

```
email_send, email_reply
```

(Glob patterns work here too — e.g. `email_*` — see [Tool Policy](/docs/agents/tool-policy).) From this point on, every time the agent tries to send or reply to an email, it pauses and routes the call through the approval workflow instead of running it — the tool never executes until a human says yes.

## 6. Add an approver

Go to **People**. A person shows up in this list once they've messaged your agent's Telegram bot at least once (see [People & approvers](/docs/people)) — so have the intended approver send the bot any message first if they're not already listed. Then toggle **"Approver"** on for that person. Approval cards can only be delivered to someone with a known Telegram identity — there's no email or SMS delivery path for approval cards today.

## 7. Schedule an inbox check

Under the agent's **Schedules** tab, create a cron schedule — e.g. every 15 minutes during business hours:

```
*/15 9-17 * * 1-5
```

Set the timezone to your own (each schedule has its own `timezone` field, default UTC — don't leave it on UTC if you're not in it). The schedule's message is the instruction the agent receives on each tick, e.g. *"Check your inbox for unread emails and handle anything that needs a reply."* See [Schedules & cron](/docs/automation/schedules).

## 8. What actually happens at runtime

1. The cron tick fires; the agent runs with the instruction above.
2. It calls `email_fetch_unread`, finds a customer question, and calls `email_search` or the ERPNext tools to get the real answer.
3. It drafts a reply and calls `email_reply` (or `email_send` for a fresh message).
4. The Tool Policy gate intercepts the call **before it executes** (`pulse/src/agent/tools/approval-gate.ts`). The agent's turn ends immediately — this is **non-blocking**: nothing is held open waiting for a human.
5. Every designated approver gets a Telegram DM with an inline-keyboard card. For `email_send`/`email_reply` the card renders the **actual drafted content** — To, Subject, and the full body (clipped past ~1,400 characters) — not just "the agent wants to send an email." You're reviewing the real message, not a description of it.
6. You tap one of three buttons:
   - **✅ Allow** — the tool runs now, out-of-band, and the card is edited to show it ran (or, rarely, that it failed to run and why).
   - **🚫 Deny** — the tool never runs; the card is edited to "Denied."
   - **♾️ Allow always** — approves this one, *and* grants a standing allowance for that tool name across your whole tenant. From then on, that specific tool (e.g. `email_send`) never asks again for **any** agent, until an admin revokes the allowance under People → Standing Allowances. This is a broad grant — use it once you trust the pattern, not on the first message you see.
7. **If nobody responds within 2 hours**, the approval expires automatically. The email is **not sent**. Every approver gets a fresh Telegram message — not a silent edit to the old card — reading "⏱ No response in time — this was NOT sent and still needs you to handle it manually," including the drafted content again, so a customer reply can't quietly vanish just because everyone was away from their phone.

> The card itself displays "Expires in 2 minutes if nobody responds" — that's leftover copy from a shorter default used elsewhere in the approval system. For a Tool Policy `email_send`/`email_reply` gate specifically, the real enforced window is **2 hours** (`APPROVAL_TTL_MS` in `pulse/src/agent/tools/approval-gate.ts`), not 2 minutes. Don't panic if the card text looks wrong — the actual behavior is the more generous one.

For the mechanics behind the card, the approver check, and standing allowances, see [Approval gates](/docs/approvals).
