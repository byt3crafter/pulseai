This is the flagship Pulse workflow: an agent that reads its own inbox, looks up real data, drafts a reply, and then **stops and waits for a person to approve it** before anything goes out. Follow the steps in order — step 3 has a real gotcha that will otherwise leave your agent unable to send mail with no obvious explanation why.

## 1. Create the agent

Create an agent and give it a finance persona — name, description, and personality live on the agent's profile. See [Profile, Soul & Identity](/dashboard/docs/agents/profile) for what each field controls, and [AI providers](/dashboard/docs/setup/providers) to give it a model.

For this walkthrough we'll call it **"your finance agent."**

## 2. Connect its email

Go to **Settings → Email** and fill in the outgoing (SMTP) and incoming (IMAP) details for the mailbox it should use — see [Email (SMTP & IMAP)](/dashboard/docs/setup/email) for the exact fields. Passwords are encrypted before they're stored (see [Security & your data](/dashboard/docs/security)).

Use a real mailbox your agent is allowed to act on, e.g. `finance@acme.example`. This step only stores the connection — it does **not** yet give the agent permission to actually use email. That's the next step, and it isn't automatic.

## 3. Get the email tools turned on — and the gotcha

The tools your agent needs are the ones that read unread mail, search a thread, reply within a thread, and send a new message.

> **There is currently no self-serve toggle for this in the dashboard.** Connecting SMTP/IMAP in Settings → Email stores the connection, but it does not by itself switch on the email tools for your workspace — that provisioning step happens on the Pulse side. If your agent still can't send or reply after connecting email, ask your Pulse administrator or support to enable the email tools for your workspace. Skipping this is the most common reason this recipe silently doesn't work: the agent tries to send a reply, is unable to, and may describe what it *would* have sent as if it already had. See [Tools & Skills](/dashboard/docs/agents/tools) for how built-in tools fit together generally.

## 4. Connect the business system it reads from

For the agent to answer a real question with real data — an invoice balance, an order status — connect the [ERPNext plugin](/dashboard/docs/tools/plugins) under Settings → Plugins with your ERPNext URL, API key, and API secret. The plugin needs to have been approved for the platform and enabled for your workspace first — if it's missing from your plugin list, that's the first thing to check with your Pulse administrator. Once configured, the agent can look up records and run reports, and is instructed to actually check the data rather than guess.

## 5. Set a Tool Policy so nothing goes out unapproved

Open the agent's **Tool Policy** tab and add the tools that send or reply to email to **"Ask First — Require Approval."** A glob pattern works too, so you can cover both with one entry rather than listing each tool by name — see [Tool Policy](/dashboard/docs/agents/tool-policy) for the exact syntax. From this point on, every time the agent tries to send or reply to an email, it pauses and routes the request through approval instead of running it — the action never happens until a person says yes.

## 6. Add an approver

Go to **People**. A person shows up in this list once they've messaged your agent's Telegram bot at least once — see [People & approvers](/dashboard/docs/people) — so have the intended approver send the bot any message first if they're not listed yet. Then turn on **"Approver"** for that person. Approval cards can currently only be delivered to someone with a known Telegram identity — there's no email or SMS delivery path for them today.

## 7. Schedule an inbox check

Under the agent's **Schedules** tab, create a recurring schedule — e.g. every 15 minutes during business hours. Set the timezone to your own (schedules default to UTC, so don't leave it there if that's not where you are). The schedule's message is the instruction the agent receives on each run, e.g. *"Check your inbox for unread emails and handle anything that needs a reply."* See [Schedules & cron](/dashboard/docs/automation/schedules).

## 8. What actually happens when it runs

1. The schedule fires and the agent runs with the instruction above.
2. It checks for unread mail, finds a question, and looks it up — searching the thread and, if needed, checking the connected business system for the real answer.
3. It drafts a reply and calls the send or reply action.
4. That action is intercepted **before it runs**, because of the Tool Policy you set in step 5. The agent's turn ends there — nothing is held open waiting for a person, so the agent (and the rest of your workspace) isn't blocked while the approval is pending.
5. Every approver gets a Telegram message with an interactive card. For a send or reply, the card shows the **actual drafted message** — recipient, subject, and the full body — not merely "the agent wants to send an email." You're reviewing the real message, not a description of it.
6. The approver taps one of three options:
   - **Allow** — the message is sent, and the card updates to show it went out (or, rarely, that it failed and why).
   - **Deny** — the message is never sent; the card updates to "Denied."
   - **Allow always** — approves this one, *and* stops asking for that action going forward.
     > **"Allow always" is workspace-wide, not only for this recipient or this conversation.** Tapping it grants a standing allowance for that action across your entire workspace, for every agent that has it, not only the finance agent and not only for this one email. From then on it runs immediately with no approval card at all, until someone with admin access revokes the allowance from People → Standing Allowances. Treat it as "I trust this pattern completely," not as "approve this one email" — use it once you've watched the recipe work correctly a few times, not on the first card you see.
7. **If nobody responds in time, the approval expires and the email is not sent.** Every approver then gets a new message — not a quiet edit to the old card — telling them it was not sent and still needs to be handled manually, with the drafted content included again, so a reply can't quietly disappear because everyone happened to be away from their phone.

> You may notice the countdown text on the card itself says something shorter than what actually happens — for a send/reply approval set up through Tool Policy like this one, the real window before it expires is a few hours, not minutes. If the card's wording looks off, trust the longer, more forgiving behavior described above.

For how the approval card, approver check, and standing allowances work in general, see [Approval gates](/dashboard/docs/approvals).
