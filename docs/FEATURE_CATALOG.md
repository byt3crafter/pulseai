<!-- Living feature catalog for Pulse AI. Keep this current as features ship.
     Last updated: 2026-08-12 (v0.14.83). Re-publish the shareable artifact from
     this file after edits to keep the same URL. -->

# Pulse AI — Feature Catalog

Pulse AI is a multi-tenant AI agent platform that gives a business its own "AI workforce" — agents that don't just answer questions but do real work: send email, run integrations, follow schedules, chase replies, and act on your systems. Each workspace shares a common set of tools and data stores with its agents, gated by a three-layer permission model (admin approval → workspace enablement → per-agent policy). Everything runs multi-tenant, encrypted at rest, and with a human-in-the-loop safety layer.

---

## Getting started with agent tools

Every capability below is gated in **Settings → Workspace Tools**, a single switchboard that turns each built-in agent capability on or off for the whole workspace. Tools are grouped into Core, Memory, Scheduling, Collaboration, Oversight, Email, Contacts, Calendar, Passwords, Notepad, To-dos, Bookmarks, Expenses, Tasks & Projects, Notifications, Follow-ups, Documents, PDF tools, and Technical.

- **Enable then narrow** — A tool must be enabled at the workspace level before any agent can use it; each agent's own **Tool Policy** then narrows it further.
- **Sensible defaults, powerful tools opt-in** — New workspaces come pre-seeded with a safe default set (time, calculator, memory, scheduling, email, contacts, calendar, delegation). Powerful tools (shell, Python, scripts, credential access) stay off until deliberately enabled. Use "Enable all / Disable all" per group to bulk-toggle.

---

## Productivity tools

Personal-productivity stores shared by you and your agents. Each has a dashboard page you can edit by hand plus matching agent tools, so you can just ask ("add a note", "what's on my calendar this week").

### Notes (Notepad)
- **Freeform notes** — Meeting notes, ideas, and drafts with an optional title and tags. Search runs across title, body, and tags.
- **Pinning** — Keep chosen notes at the top of the list.

### To-dos
- **Personal checklist** — Optional due dates and low/normal/high priority. Due dates understand natural phrasing like "tomorrow" and read in your workspace timezone.
- **Complete / reopen** — Open items show by default; completed ones can be revealed.

### Tasks & Projects (work board)
- **Shared work board** — Statuses (to-do, doing, done, blocked), priority, and due dates. Agents automatically open a task for any substantial job and keep its status current, giving you a live view of what's in flight.
- **Projects & subtasks** — Any task can have child tasks. Auto-created agent tasks are flagged so you can tell them from ones you added.

### Bookmarks
- **Saved links** — Web pages and YouTube videos with title, notes, and tags. YouTube links are auto-detected and tagged as videos; filter by web vs. video. Full keyword search across title, URL, notes, and tags.

### Contacts (address book)
- **Address book** — Name, email, phone, company, title, and notes. Agents use it to resolve "email <name>" to the right person; saving a contact with an existing email updates it in place instead of duplicating.
- **ERPNext contact sync** — With the ERPNext plugin connected, lookups can pull from your ERPNext contacts too (configurable per workspace: native book, ERPNext, or auto).

### Calendar
- **Personal calendar** — Add, list, search, and delete events with start/end times, all-day option, location, attendees, and notes. Times respect your workspace timezone; the agent resolves relative phrasing like "tomorrow at 3pm."

### Expenses
- **Expense ledger** — Amount, currency, vendor, category, description, and date, with running totals filterable by category and date range.
- **Receipt attachments** — Upload a receipt to any expense; it's stored in the workspace document locker and linked to the record.

---

## Documents & PDF

### Document Locker
- **Upload documents** — Store contracts, quotes, tenders, receipts, or any file (up to 10 MB) in a private, per-workspace locker, with optional title and tags.
- **Browse & search** — A table showing title/filename, type, size, source, and upload date, with an instant search box across title, filename, tags, and type.
- **Download & delete** — Retrieve any file with its original filename, or permanently delete it (with confirmation). Every upload and delete is written to the audit log.
- **Source labels** — Each file is badged by origin: Upload (by hand), Receipt (attached to an expense), or Generated (produced by an agent, e.g. a filled PDF form).
- **Auto-attached receipts** — Receipt images/PDFs attached to an expense land in the same locker (tagged "receipt") and stay linked to that expense.

### Agent document tools
Enable per agent under Settings → Workspace Tools ("Documents" and "PDF tools" groups, all off by default), then ask in chat. Agents only ever see text and metadata, never raw file bytes.
- **Find documents** — List the locker or search by keyword across filename, title, notes, tags, and full text content ("find the Acme contract").
- **Read a document** — Pull the text of any stored PDF or text file; extracted text is cached so future searches match on contents.
- **Delete a document** — Remove a file by referencing it.

### PDF tools
- **Read a PDF** — Extract text to summarize, extract, or answer questions. (Scanned/image-only PDFs with no text layer aren't readable yet.)
- **Inspect a fillable form** — List a form's fields — names, types (text, checkbox, dropdown, radio), and options — before completing it.
- **Fill a PDF form** — Complete a fillable form with values you give it; the finished PDF is saved back to the locker as a new "generated" file to download.

---

## Email

Give any agent a real mailbox to send, read, and manage email. Configure a company-wide default in **Settings → Email** or a per-agent mailbox under **Agents → [agent] → Email**; the agent can also set up its own mailbox on request.

### Setup & configuration
- **Company & per-agent mailboxes** — Connect your own account over standard SMTP (sending) and IMAP (reading); an agent-level mailbox overrides the company one. Passwords are stored encrypted and never shown back.
- **Agent self-setup** — Ask the agent to "set up your mailbox" and it configures SMTP/IMAP itself, pulling the password from a saved vault login by name (no credentials typed into chat), then verifies the connection.
- **Send-only or full** — SMTP alone to send; add IMAP so the agent can also read, search, reply, and file.

### Sending
- **Send email** — To one or many recipients with optional CC/BCC, subject, and body.
- **File attachments** — Attach files the agent produced (CSVs, PDFs, images, spreadsheets), up to 15 MB per message.
- **Save as draft** — Save a message to your mailbox's Drafts folder for you to review and send from your own client.
- **Automatic signature** — A professional signature appended to every outgoing email, built from fields (name, title, company, phone, website, tagline, logo) or your own HTML, set per-agent or company-wide. The agent never writes its own sign-off.
- **Sender identity & always-CC** — Mail goes out under a proper display name, with optional addresses always CC'd.

### Reading, triage & organizing
- **Read the inbox** — List recent messages (sender, subject, date) or read them in fuller detail.
- **Handle unread mail** — Fetch unread messages with full body to act on, and mark them read so they aren't processed twice.
- **Search the mailbox** — By sender, subject, unread status, recency, or folder.
- **Threaded replies** — Reply to a specific message in the same thread (recipient/subject carried over), optionally quoting the original.
- **Flag, move & delete** — Mark read/unread or flagged; move messages into folders; list folders; delete (moved to Trash). Destructive actions are typically placed behind an approval gate.

---

## Vault, credentials & self-configuration

### Password vault (website logins)
- **Saved website logins** — Usernames and passwords for sites your agents sign into (CRM, tender portals, supplier sites). Passwords are encrypted at rest; the dashboard never shows them back. Manage in **Dashboard → Passwords**.
- **Sign-in without exposing passwords** — Agents see the list (label, site, username) but never the password. On sign-in, the decrypted password is filled server-side, never entering the chat or the model.
- **Per-agent or shared logins** — Scope each login to "all agents" or one specific agent.
- **Agent-saved logins** — Tell an agent "save this login to the vault" and it stores it encrypted; re-saving the same label updates it.

### API credentials & integrations
- **Credential vault** — Store API keys, tokens, and basic-auth credentials for any connected service. Values are AES-256-GCM encrypted, normalized to `UPPER_SNAKE_CASE`, and auto-injected into the agent's tools and code sandbox when needed. Managed in **Settings → API Credentials**, or an agent can store one on request.
- **One-command ERPNext connection** — Give the agent your ERPNext site URL, API key, and secret; it stores them encrypted and runs a live test call before confirming.
- **Self-service mailbox setup** — An agent can configure SMTP/IMAP so it can send and read mail, pulling the mailbox password from a saved vault login by label.

### Self-awareness & guidance
- **Workspace capability check** — Ask "what can you do?" or "what do you need from me?" for an honest, live readout of what's connected: email status (send-only vs. send+read), stored credentials, enabled integrations/plugins, and tool count — with the right setup path for anything missing.

---

## Autonomous layer

Pulse agents run on their own schedules, chase outstanding replies, follow permanent operating instructions, and check in proactively. Everything below runs unattended and reports back.

### Scheduler (recurring & one-off jobs)
- **Scheduled jobs** — Run an instruction on a cron expression, an interval, or once at a set date/time, set on the agent's **Schedules** page or by asking in chat ("every weekday at 8am, send me a summary of open tickets").
- **Live edits & run history** — Create, edit, disable, or delete schedules and changes apply within seconds, no restart. Each job shows enabled status, last run, and a record of past runs (success/failure and output).
- **Webhook trigger** — Every job gets a private webhook URL so an external system can fire it immediately on an event, not just on the clock.
- **Admin controls** — Platform admins govern scheduled-job behavior in **Admin → Settings → Scheduling**.

### Follow-ups (commitments)
- **Automatic tracking** — Whenever an agent sends something it expects a reply to (a quote, invoice, email), it records a "commitment" with a chase-by date, so nothing quietly slips.
- **Overdue chasing** — When due, Pulse can auto-send a natural, human-sounding check-in (the agent writes it) or flag it to you; overdue items are marked.
- **Delivery modes** — In Settings, choose **Internal** (agent tracks for its own review — the safe default), **Owner** (a reminder to a designated manager/owner), or **Channel** (check-in sent into the original conversation). A daily cap prevents flooding customers. (Automatic outbound currently delivers over Telegram; internal tracking is channel-independent.)
- **Review & close** — List open commitments and close or drop them, on request or as routine.

### Standing orders (permanent operating programs)
- **Standing orders** — Define a routine once and the agent follows it forever, in every conversation, without being re-asked (e.g. "send the weekly sales summary every Friday at 4pm"). Set per agent via the Standing Orders editor.
- **Built-in guardrails** — For each order you specify, in plain language: what it may do, when it triggers, the steps, what needs your approval, when to escalate, and hard "never" boundaries. Agents work to an execute → verify → report discipline.

### Heartbeat (proactive check-ins)
- **Heartbeat monitoring** — A recurring self-check ("every morning, check overnight errors and post a summary") that runs on an interval and reports only when there's something worth telling you.
- **Active hours** — Restrict check-ins to a time window in your timezone (midnight-spanning windows like 22:00–06:00 supported).
- **No-noise design** — Suppresses "nothing to report" runs and de-duplicates identical alerts within a 24-hour window.

### Briefings
- **Recurring digests** — Use a scheduled job or heartbeat to compile and deliver a morning briefing, end-of-day summary, or overnight report — a configuration of the scheduler/heartbeat rather than a separate switch.

---

## Notifications & delivery

- **In-app notification inbox (the bell)** — A header bell shows a live unread count and opens a feed of recent notifications, newest first.
- **Agent-posted proactive alerts** — Agents push a message whenever something needs attention — a customer reply arrived, a follow-up is overdue, a briefing is ready, a decision is needed — each with a headline, detail, and recommended next step. Just ask ("let me know when MP Mining replies").
- **Priority levels** — High / normal / low, shown as a colored dot, set automatically by time-sensitivity.
- **Notification types** — Tagged by kind: reply, overdue chase, briefing, approval request, scheduled-job update, general info, or system.
- **Click-through to act** — Clicking jumps straight to where you can act, typically the assistant with the raising agent pre-selected.
- **Read / unread tracking** — Unread items are highlighted and counted; opening marks read, with a "Mark all read" button. The badge auto-refreshes every 30 seconds.
- **Extensible delivery** — Each alert is stored as a single inbox record designed to fan out to email, push, and Telegram over time.

---

## Trust & safety

### Truthfulness
- **Truth Gate (no fake "Done!")** — Before any reply reaches you, Pulse checks whether the agent claims it *did* something (created, sent, saved, scheduled, uploaded) without a real successful tool call behind it. If unbacked, the reply is rewritten to say truthfully what did and didn't happen and offer the real next step. Runs only on the risky path; always on.

### Capability awareness
- **Grounded tool awareness** — Agents are told exactly which tools they have and instructed to use them rather than describe what they "could" do, reducing bluffing.
- **"You can turn this on" suggestions** — When a helpful capability is switched off, the agent names the specific tool and points you to Settings → Workspace Tools instead of pretending to use it.
- **Live task tracking** — For substantial, multi-step, or long-running jobs, the agent opens a task and updates it (doing → complete) so you see what's pending; trivial chat is skipped.

### Approvals & tool gating
- **Tool Policy (allow / deny / ask per agent)** — Per-agent allow-list, deny-list, and "ask first" list, all supporting wildcards (`*_send`, `mcp_*_delete`). A denied tool never runs; an "ask" tool is held for sign-off.
- **Human approval gate** — When an agent tries an "ask" tool, the action is queued for a designated approver, who gets a card (Telegram or dashboard) showing exactly what will happen — for email, the real recipient, subject, and body — and taps **Allow / Deny / Allow-always**. Approvers are set per person in **Dashboard → People**.
- **Standing allowances** — "Allow always" grants a persistent, revocable exemption so a routine tool stops prompting; review and revoke in **Dashboard → Approvals**.
- **Pending approvals dashboard** — Every action awaiting sign-off and every active allowance in one place, with a 2-hour window for background requests.
- **Fail-closed safety** — If Pulse can't queue an approval or look up an allowance, it refuses the action rather than running it unchecked.

---

## Integrations & plugins

Every integration is an installable plugin, enabled through the three-layer model: admin approves the plugin, the tenant enables and connects it in **Settings → Plugins**, and each agent's Tool Policy grants or denies its tools. Once on, agents get the tools automatically — you just ask in plain language.

### Business systems
- **ERPNext (accounting & operations)** — Look up invoices, customers, orders, stock, and HR records; create and update documents; run financial and stock reports; and call server methods (submit, cancel, generate a shareable invoice link). Connect with your ERPNext URL, API key, and secret, then ask things like "pull the unpaid sales invoices for January."

### Files & documents
- **Microsoft OneDrive / Microsoft 365** — List, search, read, upload, and share files, create folders, and remove files. One-click **Connect OneDrive** Microsoft sign-in (or paste an OAuth refresh token). Ask it to "find last quarter's report" or "save this to /Reports/2026" and share a link back.

### Web & research
- **Web search** — A live web lookup so agents answer with current facts. Add a free Tavily API key; the agent searches automatically when a question needs up-to-date info.
- **Browser automation (Playwright)** — A real headless browser to navigate sites, fill and submit forms, click, extract page text and links, and take screenshots delivered into chat. An admin can optionally allow internal/intranet addresses (blocked by default).

### Voice & media
- **Voice (speech-to-text & text-to-speech)** — Transcribe voice/audio messages (Whisper) and reply with spoken audio. Needs only OpenAI connected under Settings → AI Providers; optionally add an ElevenLabs key for premium voices.
- **Image generation** — Create images from a description (MiniMax image-01) and send them into the conversation, in square, landscape, or portrait framing. Uses your existing MiniMax key.

### Productivity & follow-through
- **Follow-up commitments** — Record check-ins to return to later, review open ones, and mark them done. How a due commitment surfaces is a per-tenant setting (original channel, workspace owner, or internal) — see the Autonomous layer above.

---

## Dashboard experience

### Chat & assistant
- **Browser Assistant (web chat)** — A full ChatGPT-style chat with your agents, with live token-by-token streaming and the same tools, memory, and approvals as Telegram. Under Workspace → Assistant.
- **Saved chat sessions** — Every conversation is saved to a collapsible rail; start "New chat" or switch back anytime. Sessions survive reloads and sync across devices.
- **Pin, rename & delete chats** — Per-chat menu with in-app confirmation (no browser popup).
- **Agent picker** — Choose which agent to talk to; opening chat from a notification pre-selects the right agent.
- **Reasoning effort control** — Per-message dial (Auto / Minimal / Low / Medium / High) trading speed for depth.
- **Show thinking** — Optionally watch the agent's live reasoning stream in a collapsible panel; the choice is remembered.
- **Live connection status** — Online / Connecting / Reconnecting with auto-reconnect.

### Navigation & workspace
- **Simple vs. Full view** — A per-user toggle that hides advanced Agents / Tools & Infra / Activity sections so non-technical users see just their workspace. New users start in Simple view.
- **Collapsible sidebar** — Icon-only mode; the state persists.
- **Command palette (Find…)** — ⌘K / Ctrl+K to jump to any page or setting.
- **Notification inbox (bell)** — In-app proactive inbox (see Notifications above).

### Personalization & platform
- **Light / dark theme** — One-click toggle between a light (Google-AI-Studio-style) and dark (near-black + violet) theme, applied before the page paints.
- **Workspace timezone** — Set under Settings → Account so agents schedule jobs, events, and follow-ups in local time (auto-populated from your browser).
- **Installable app (PWA)** — Install to a phone home screen or desktop as a standalone app that opens into the Assistant.
- **White-label branding** — The installed app's name, icon, and description follow the deployment's branding.
- **Responsive & mobile-friendly** — Layouts adapt to phones: the chat rail becomes a slide-over, the settings tab bar scrolls, and the composer/nav reflow.

---

## Security & enterprise

- **Single Sign-On (SSO / OIDC)** — Staff log in with your company IdP (Okta, Microsoft Entra ID / Azure AD, Google Workspace, Auth0); disabling someone in your IdP instantly cuts Pulse access. Users are auto-provisioned on first login (JIT) with role derived from IdP group. Configure in **Admin → Settings → SSO**.
- **Two-factor authentication (2FA / TOTP)** — Authenticator-app codes plus one-time backup recovery codes, enabled per user under **Account → Two-Factor**.
- **Granular role-based access control (RBAC)** — Least-privilege roles beyond the admin/tenant split. Platform: Owner, Admin, Support, Auditor (read-only). Workspace: Owner, Member, Viewer.
- **Audit log** — An immutable trail of every significant action (logins, user/tenant changes, settings edits, deletes) with actor, target, timestamp, and IP, for SOC 2 / ISO 27001 review. At **Admin → Audit** (platform-wide) and **Dashboard → Audit** (workspace), plus a separate high-risk execution/approval trail.
- **Encryption at rest (AES-256-GCM)** — Every stored secret — provider API keys, OAuth tokens, integration credentials, SSO client secrets, 2FA secrets — is encrypted before it touches the database; decrypted values are never logged. On by default.
- **Human-in-the-loop approval gates** — Risky agent actions can be held for a person to approve, with inline approve/deny cards, designated approvers, and reusable standing allowances (see Trust & safety).
- **Departments & org-chart channels with access control** — Model your company as an org chart of AI: **Departments → optional Groups**, each with a lead agent that answers and routes work, direct @mentions to reach a specific agent, and per-person access set to **talk** (participate) or **observe** (read-only). Set up in **Dashboard → Departments**.
- **Signed & approved plugin manifests** — Plugins must declare their tools, hooks, and permissions, and an admin must approve that capability set before they run; if a manifest later changes, its integrity hash no longer matches and it won't activate until re-approved.
- **Per-agent scoped tool & server access** — Default-deny: an agent can only use a tool or reach a server it's been explicitly granted, with SSH access further limited to observe / safe / full tiers.
- **Workspace reset / right-to-be-forgotten** — Wipe a workspace's chat history and/or agent memory on demand (scopes: chat, memory, or all) while preserving configuration and the audit trail, with an automatic backup first. Admins run it from a tenant's Danger Zone; enable self-service reset and the tenant can trigger it from their own Settings.
- **Account & password security** — Email-based password reset and invite flows (single-use, hashed, expiring tokens), forced first-login password change, bcrypt hashing, and login rate limiting (10 attempts/minute/IP).
- **Multi-tenant data isolation** — Every workspace's data is partitioned by tenant so no client can see another's agents, conversations, credentials, or memory; dedicated single-client deployments are also supported.

---

## How it fits together

Pulse gives each business a workspace where AI agents share the same stores, credentials, and mailbox as their human colleagues, then act on them — sending email, running ERPNext or OneDrive, searching the web, and filling PDFs — all through plain-language requests. The autonomous layer lets those agents keep working when no one is watching: running on schedules, chasing follow-ups, and checking in proactively, surfacing anything important through the notification inbox. Wrapping all of it is a trust-and-safety and enterprise-security envelope — the Truth Gate, per-agent tool policies, human approval gates, SSO, RBAC, audit logging, and encrypted multi-tenant isolation — so the workforce stays honest, permissioned, and accountable from the first message to the last audited action.