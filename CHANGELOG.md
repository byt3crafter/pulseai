# Changelog

All notable changes to Pulse AI will be documented in this file.
This changelog is auto-generated from conventional commits.

## [0.20.15] - 2026-08-27

### Features
- the assistant, structurally, as v4 draws it

## [0.20.14] - 2026-08-27

### Features
- the assistant home, as v4 draws it

## [0.20.13] - 2026-08-27

### Features
- v4 light theme, and dark by default

### Bug Fixes
- nav details the artboard actually specifies

## [0.20.12] - 2026-08-27

### Features
- v4 Studio nav — grouped, collapsible, nothing hidden
- self-host Google Sans, the face the design actually asks for
- v4 Studio palette and type — the token layer

### Bug Fixes
- a job's settings now actually reach the scheduler

## [0.20.11] - 2026-08-27

### Features
- finish the job cost work — editable, scoped, and measurable

## [0.20.10] - 2026-08-27

### Features
- you can actually delete them now

## [0.20.9] - 2026-08-27

### Features
- stop paying a language model to ask "anything new?"

### Bug Fixes
- clean up after the floor removal

## [0.20.8] - 2026-08-27

### Chores
- drop two office build artifacts that were tracked
- remove The Floor

## [0.20.7] - 2026-08-27

### Features
- put The Floor behind a beta switch, off by default

## [0.20.6] - 2026-08-27

### Bug Fixes
- it's Pulse, not Hermes

### Documentation
- record the live work seam

## [0.20.5] - 2026-08-27

### Bug Fixes
- caption tools by their real names

## [0.20.4] - 2026-08-27

### Features
- show work the office didn't start

### Documentation
- describe the integration as it now is

## [0.20.3] - 2026-08-27

### Bug Fixes
- the office is a Pulse client from its first paint

## [0.20.2] - 2026-08-26

### Chores
- treat the office as our code, not a vendored fork

## [0.20.1] - 2026-08-26

### Bug Fixes
- connect to Pulse on its own

## [0.20.0] - 2026-08-26

### Features
- replace the pixel floor with the 3D office

## [0.19.18] - 2026-08-26

### Features
- mint the 3D office a token from the dashboard session

## [0.19.17] - 2026-08-26

### Features
- serve the Hermes3D runtime contract

## [0.19.16] - 2026-08-26

### Features
- light the room; fleet-update reclaims disk

## [0.19.15] - 2026-08-26

### Features
- show hours each agent has actually worked

## [0.19.14] - 2026-08-26

### Features
- About page with third-party credits

## [0.19.13] - 2026-08-26

### Bug Fixes
- walking now means work is being handed over

## [0.19.12] - 2026-08-26

### Bug Fixes
- stop reasoning leaking into the answer; fix floor layout

## [0.19.11] - 2026-08-26

### Features
- quiet routine work, loud failures, per-agent activity

## [0.19.10] - 2026-08-26

### Features
- count work honestly, and put people on their feet

## [0.19.9] - 2026-08-26

### Bug Fixes
- server + sandbox tools were impossible to enable

## [0.19.8] - 2026-08-26

### Features
- link a Telegram account to a workspace member
- resumable chat — re-attach to a run in flight
- reap stale runs, and record which human triggered them

## [0.19.7] - 2026-08-26

### Bug Fixes
- page padding, and show the real humans who give work

## [0.19.6] - 2026-08-26

### Features
- live push over WebSocket + give-work composer
- live pixel office of the AI workforce

## [0.19.5] - 2026-08-23

### Features
- redesigned workspace sign-in

## [0.19.4] - 2026-08-22

### Features
- @-mention autocomplete picker in composer

### Bug Fixes
- fleet-update retries the restart until the target tag is actually running

## [0.19.3] - 2026-08-22

### Features
- agent can read email attachments (invoices/quotes) and extract them

### Bug Fixes
- drop drizzle .references() on api_tokens.user_id (circular inference)

## [0.19.2] - 2026-08-22

### Features
- agent knows WHICH user is talking in browser chat

### Bug Fixes
- fleet-update actually swaps the version (force-recreate + verify)

## [0.19.1] - 2026-08-22

### Features
- point fleet at the private runstate registry (registry.runstate.mu)
- check for updates against a runstate-hosted manifest (no GitHub token)

### Bug Fixes
- safe whitelist model routing + no false disavowal of real data

## [0.19.0] - 2026-08-22

### Features
- in-app update notification banner
- fleet update system — build once (GHCR), pull on every client VPS

## [0.18.3] - 2026-08-22

### Bug Fixes
- calendar_add returns a write receipt (id) and fails loudly

## [0.18.2] - 2026-08-21

### Bug Fixes
- tool receipts + truth-gate catches bare "Saved" lies

## [0.18.1] - 2026-08-21

### Features
- custom fields — agent + user can add labeled fields (VAT/BRN/…)

## [0.18.0] - 2026-08-21

### Features
- native assistant parity — streaming, markdown, tools, attachments

## [0.17.0] - 2026-08-19

### Features
- file attachments in browser chat (drag-drop, paste, picker)

## [0.16.0] - 2026-08-19

### Features
- smart model routing + multi-agent meeting (@mention several agents)

## [0.15.1] - 2026-08-19

### Bug Fixes
- resume an agent's most-recent chat when switching to it

## [0.15.0] - 2026-08-19

### Features
- per-agent conversations, @mention routing, chat-mode setting

## [0.14.112] - 2026-08-18

### Bug Fixes
- parse MiniMax inline tool-call markup + collapse thinking by default

## [0.14.111] - 2026-08-18

### Bug Fixes
- use the model's real max_tokens, not a hardcoded 2048

## [0.14.110] - 2026-08-18

### Bug Fixes
- thinking-panel text no longer leaks past the box

## [0.14.109] - 2026-08-18

### Features
- compute with python, never dump raw arithmetic; present result + chart

## [0.14.108] - 2026-08-18

### Bug Fixes
- retry provider once on malformed/transient response + clearer error

## [0.14.107] - 2026-08-18

### Features
- inline charts, send-while-responding + Esc-restore, charitable typo reading

## [0.14.106] - 2026-08-18

### Features
- collapse tool steps when done + dedupe repeats with a count

## [0.14.105] - 2026-08-18

### Features
- live tool-step rows — stream what the agent is doing

## [0.14.104] - 2026-08-18

### Features
- bump chat reading size for legibility (keep Inter)

## [0.14.103] - 2026-08-18

### Bug Fixes
- account menu clipped off-screen in the slim rail

## [0.14.102] - 2026-08-18

### Features
- neutral user bubble, wider column, session search + date groups, user menu in slim rail

## [0.14.101] - 2026-08-18

### Features
- flat black session rail, remove the grey agent header

## [0.14.100] - 2026-08-18

### Features
- default the nav to the slim labeled rail

## [0.14.99] - 2026-08-18

### Features
- composer as one tall box with controls inside (Creatify-style)

## [0.14.98] - 2026-08-18

### Features
- slim labeled rail + segmented assistant composer

## [0.14.97] - 2026-08-18

### Features
- retune dark theme to sampled flat-black palette + switch UI face to Inter

## [0.14.96] - 2026-08-13

### Features
- RRF hybrid retrieval, L3 persona rollup, bounded context

## [0.14.95] - 2026-08-13

### Performance
- dispatch reply before bookkeeping; tighten Truth Gate

## [0.14.94] - 2026-08-13

### Bug Fixes
- recover answers models bury inside <think>; force real web_search use

## [0.14.93] - 2026-08-13

### Bug Fixes
- correct Firecrawl NuQ postgres init + document RAM needs

## [0.14.92] - 2026-08-13

### Features
- self-hosted SearXNG + Firecrawl, provider-agnostic web_search/web_fetch

## [0.14.91] - 2026-08-12

### Bug Fixes
- assistant-message persistence must not fail the turn

## [0.14.90] - 2026-08-12

### Features
- Claude-style identity toggle, voice setup UI, free-model grouping

## [0.14.89] - 2026-08-12

### Features
- voice input mic — ElevenLabs STT (OpenAI Whisper fallback)

## [0.14.88] - 2026-08-12

### Features
- conversations date filter + hide agent name for single agent

## [0.14.87] - 2026-08-12

### Features
- change the model on the fly (per-chat model picker)

## [0.14.86] - 2026-08-12

### Bug Fixes
- repair malformed markdown tables + formatting prompt

## [0.14.85] - 2026-08-12

### Bug Fixes
- drop icons from Appearance/Briefing tabs to match the others

## [0.14.84] - 2026-08-12

### Features
- white-label appearance — accent, logo, title (tenant + admin)

### Documentation
- living feature catalog

## [0.14.83] - 2026-08-12

### Features
- daily briefing + Settings → Briefing panel

## [0.14.82] - 2026-08-12

### Features
- clicking a notification opens the assistant with that agent

## [0.14.81] - 2026-08-12

### Features
- in-app inbox + bell + notify tool

## [0.14.80] - 2026-08-12

### Features
- commitment tools + relative-date parsing

## [0.14.79] - 2026-08-12

### Features
- per-user Simple view — hide advanced admin sections

## [0.14.78] - 2026-08-12

### Features
- professional session menu — kebab, pin, in-app delete modal

## [0.14.77] - 2026-08-12

### Bug Fixes
- bundled-plugin auto-approve + predictive/recency tool reveal

## [0.14.76] - 2026-08-12

### Features
- login_save, credential_set, erpnext_connect, pulse_help

### Tests
- erpnext plugin now has 8 tools (added erpnext_connect)

## [0.14.75] - 2026-08-12

### Features
- stop the agent claiming actions it didn't do

## [0.14.74] - 2026-08-12

### Features
- email_configure tool — agent sets up its own mailbox

## [0.14.73] - 2026-08-12

### Bug Fixes
- base64 upload (proxy-safe), gateway PDF extraction

## [0.14.72] - 2026-08-12

### Features
- document locker + PDF read & form-fill + receipts

## [0.14.71] - 2026-08-12

### Features
- expenses ledger, hybrid tasks tracker, AI capability awareness

## [0.14.70] - 2026-08-12

### Features
- notepad, to-dos, and bookmarks suite

## [0.14.69] - 2026-08-11

### Bug Fixes
- make session delete/rename usable on mobile

## [0.14.68] - 2026-08-11

### Bug Fixes
- render Current Date & Time header in workspace timezone

## [0.14.67] - 2026-08-11

### Features
- password/login vault — encrypted site logins, login_list + browser_login

## [0.14.66] - 2026-08-11

### Bug Fixes
- composer — mobile-fixed, centered text, typeable after send

## [0.14.65] - 2026-08-11

### Features
- workspace timezone — agent + UI

## [0.14.64] - 2026-08-11

### Features
- native user calendar + agent tools

## [0.14.63] - 2026-08-11

### Bug Fixes
- contact_lookup always also searches the native store

## [0.14.62] - 2026-08-11

### Bug Fixes
- stop empty replies + tool-call looping on multi-step turns

## [0.14.61] - 2026-08-11

### Features
- contacts (flexible mini-CRM) + email_draft

## [0.14.60] - 2026-08-11

### Features
- tenant audit viewer page + usage-aware tool loading

## [0.14.59] - 2026-08-11

### Bug Fixes
- make manifest dynamic so install name follows branding

## [0.14.58] - 2026-08-11

### Features
- tenant audit logging, agent activity_log tool, standalone mode + PWA

## [0.14.57] - 2026-08-11

### Bug Fixes
- session rail overlays on mobile (was squeezing the chat)

## [0.14.56] - 2026-08-11

### Features
- enterprise polish — collapsible icon sidebar, tighter spacing, full desaturation

## [0.14.55] - 2026-08-11

### Bug Fixes
- remove duplicate page heading

## [0.14.54] - 2026-08-11

### Features
- enterprise/Google-AI-Studio restyle + Plugins top-level nav

## [0.14.53] - 2026-08-11

### Bug Fixes
- plugins = dropdown picker + config (no third sidebar)

## [0.14.52] - 2026-08-11

### Features
- plugins as master-detail (picker + detail pane)

## [0.14.51] - 2026-08-11

### Features
- searchable Plugins tab + clear credentials + deep-link

## [0.14.50] - 2026-08-11

### Bug Fixes
- make plugin-managed credentials unambiguous

## [0.14.49] - 2026-08-11

### Features
- live streaming, session rail, working delete

## [0.14.48] - 2026-08-11

### Features
- capture reasoning for the thinking panel across all agents

## [0.14.47] - 2026-08-11

### Features
- redesigned chat — sessions, thinking panel, reasoning control

## [0.14.46] - 2026-08-11

### Bug Fixes
- eliminate onboarding→dashboard redirect loop

## [0.14.45] - 2026-08-11

### Bug Fixes
- correct Codex UX + validate all providers in onboarding/settings
- enable GATEWAY_WS_ENABLED by default

## [0.14.44] - 2026-08-11

### Features
- live streaming web chat in the customer dashboard

## [0.14.43] - 2026-08-11

### Features
- config-driven white-label (Admin → Settings → Branding)

### Bug Fixes
- pass ANTHROPIC_API_KEY to the dashboard in base compose

### Chores
- make NEXTAUTH_URL + AUTH_TRUST_HOST env-driven

## [0.14.42] - 2026-07-28

### Features
- Analytics + ROI dashboard

## [0.14.41] - 2026-07-28

### Features
- live stats on the agent profile ("employee" header)

## [0.14.40] - 2026-07-28

### Features
- Allow/Deny/Allow-always from the dashboard

## [0.14.39] - 2026-07-27

### Features
- Approval Center dashboard

## [0.14.38] - 2026-07-27

### Bug Fixes
- agents list crashed — Date in raw sql fragment

## [0.14.37] - 2026-07-27

### Features
- count Codex tool calls + live agent activity

## [0.14.36] - 2026-07-27

### Features
- executive dashboard + task queue over agent_runs

## [0.14.35] - 2026-07-27

### Features
- make hiring an AI employee actually work

## [0.14.34] - 2026-07-27

### Features
- agent run/task keystone — operational record per invocation

## [0.14.33] - 2026-07-13

### Bug Fixes
- MEDIUM + LOW audit findings
- CRITICAL + HIGH audit findings

## [0.14.32] - 2026-07-13

### Bug Fixes
- render docs with the dashboard design system

## [0.14.31] - 2026-07-13

### Refactoring
- move docs into the customer dashboard, rewrite for customers

## [0.14.30] - 2026-07-13

### Features
- in-app documentation site at /docs

## [0.14.29] - 2026-07-13

### Bug Fixes
- alert approvers when a queued approval expires (no silent drop)

## [0.14.28] - 2026-07-13

### Bug Fixes
- make tool-call approvals non-blocking (queue + run on approve)

## [0.14.27] - 2026-07-12

### Bug Fixes
- deliver approval cards via the triggering agent's own bot

## [0.14.26] - 2026-07-12

### Bug Fixes
- enforce the tool approval gate on the Codex MCP path too

## [0.14.25] - 2026-07-12

### Features
- Himalaya-grade native email tools (reply/search/flag/move/delete/folders)

## [0.14.24] - 2026-07-12

### Features
- unread-with-body intake + draft preview on approval cards

## [0.14.23] - 2026-07-12

### Features
- hard human-in-the-loop gate for tool calls

## [0.14.22] - 2026-07-12

### Features
- Standing Orders — per-agent operating programs

## [0.14.21] - 2026-07-12

### Features
- Tool Search — progressive tool disclosure for large toolsets

## [0.14.20] - 2026-07-12

### Features
- due-delivery job + tenant settings UI for delivery mode

## [0.14.19] - 2026-07-12

### Features
- part 1 — data, tools, config setting

## [0.14.18] - 2026-07-12

### Features
- add ElevenLabs as a TTS provider

## [0.14.17] - 2026-07-12

### Features
- voice — transcription + text-to-speech

## [0.14.16] - 2026-07-12

### Features
- web search (Tavily)

## [0.14.15] - 2026-07-12

### Features
- ChatGPT/Claude-style conversation view + markdown

## [0.14.14] - 2026-07-12

### Features
- tenant-configurable custom whitelisted methods

## [0.14.13] - 2026-07-12

### Features
- support file attachments in email_send

## [0.14.12] - 2026-07-10

### Bug Fixes
- put Connect button on the Plugins tab (where users are)

## [0.14.11] - 2026-07-10

### Features
- one-click OAuth Connect flow

## [0.14.10] - 2026-07-10

### Features
- Microsoft OneDrive plugin (Graph API)

## [0.14.9] - 2026-07-09

### Bug Fixes
- honest integrations — Live vs On request

### Chores
- harden db-backup + nightly cron installer

## [0.14.8] - 2026-07-09

### Bug Fixes
- fold Credentials into the Settings tab shell for uniform layout

## [0.14.7] - 2026-07-09

### Bug Fixes
- uniform skill-row color; muted bg = inherited, not enabled

## [0.14.6] - 2026-07-09

### Features
- business integration catalog + per-tenant plugin gating

### Documentation
- record integration-catalog slice landed on main

### Chores
- remove all setup-only stubs, keep ERPNext
- remove QuickBooks stub from catalog

## [0.14.5] - 2026-07-09

### Bug Fixes
- interlocutor identity overrides stale names in history

## [0.14.4] - 2026-07-09

### Features
- editable display name in Profile

## [0.14.3] - 2026-07-09

### Features
- workspace data reset (Danger Zone)

## [0.14.2] - 2026-07-09

### Bug Fixes
- tell the agent who it's currently talking to
- login screen never left — [hidden] overridden by display:flex (v0.1.3)
- login guard false-flagged valid URL (v0.1.2)
- surface wrong-gateway-URL instead of silent login failure

### Chores
- gitignore local landing-page design reference
- v0.1.1 — correct default gateway URL + migration + login hardening

## [0.10.32] - 2026-07-07

### Features
- add Voyage AI as a standalone embedding provider

## [0.10.31] - 2026-07-07

### Bug Fixes
- stop the model denying workspace_update it actually has

## [0.10.30] - 2026-07-07

### Features
- MiniMax embeddings option (embo-01) alongside OpenAI

## [0.10.29] - 2026-07-07

### Features
- table view with model picker, departments, enable/disable

## [0.10.28] - 2026-07-07

### Features
- pull live provider model lists instead of hardcoding

## [0.10.27] - 2026-07-07

### Bug Fixes
- temporal decay crashed recall on string createdAt

### Chores
- add idempotent pgvector migration + reconcile schema comment

## [0.10.26] - 2026-07-07

### Features
- self-serve OpenAI embeddings key + plain-language settings help

## [0.10.25] - 2026-07-07

### Features
- AI Studio light default + Clerk dark theme; fix reasoning-leak & tab scroll

## [0.10.24] - 2026-07-07

### Features
- Clerk-grade UI polish — settings-as-rows, flat cards, ⌘K Find
- enable + harden agent code execution (Docker-out-of-Docker)
- complete dark mode — settings, usage, conversations, MCP
- dark mode + mobile/tablet responsive shell
- move Custom Tools create/edit from inline form to full pages
- move agent creation from a modal to a dedicated page
- AI-guided agent builder (describe → full config) + self-config default
- instant activation — register webhook on save + lazy-load bot
- add Groq (free, no card, no region lock)
- AI-assisted persona generator in Create Agent
- Connected + Add-a-provider layout for AI Providers
- admin billing-mode toggle + hide credits UI in BYOK mode
- position for individuals, SMEs, and enterprises
- enterprise-grade, story-driven landing page
- admin-gated ChatGPT OAuth connect for customers
- cross-dept routing, hierarchy, tool scoping
- per-tenant custom HTTP tools (connect customer's own API)
- lead auto-routing to teammates + delegation loop guard
- show/hide password toggle on admin + tenant login
- softer AI-studio card polish + document channels in CLAUDE.md
- Phase 3 desktop — departments in the app
- Phase 2 runtime — lead answers & @mention routing
- Phase 1 UI — Departments admin (org CRUD)
- Phase 1 schema — org model (Company→Dept→Group)
- branded Electron client for the agent workforce

### Bug Fixes
- run scripts via execFile (no shell mangling) + strip <think>
- settings mobile layout + strip reasoning from agent generation
- eliminate dark-mode light leaks across remaining surfaces
- clearer persona-generator error (402/insufficient balance)
- classify Gemini 429 as quota/billing, not transient rate-limit
- wire Google/Gemini + accurate error classification
- add standard p-8 page padding to match other pages
- 'AI workforce' copy, drop 'AI assistant' positioning

### Documentation
- guided end-to-end test checklist
- mark Phases 1-3 shipped

### Chores
- commit package-lock for reproducible builds
- packaging metadata + expand test checklist

## [0.10.23] - 2026-07-02

### Features
- App API on the gateway (Step 1 of the branded client app)

## [0.10.22] - 2026-07-02

### Features
- 2FA recovery (backup) codes

## [0.10.21] - 2026-07-02

### Features
- self-service change-password for admins

### Documentation
- interactive HTML test checklist + build summary for stakeholders
- non-technical click-by-click test guide

## [0.10.20] - 2026-07-02

### Features
- signed manifests + capability approval (enterprise Tier 0)

## [0.10.19] - 2026-07-02

### Features
- TOTP two-factor authentication (enterprise Tier 0)

## [0.10.18] - 2026-07-02

### Features
- OIDC single sign-on (enterprise Tier 0)

## [0.10.17] - 2026-07-02

### Features
- finish — tenant-plane enforcement + admin UI gating

## [0.10.16] - 2026-07-02

### Features
- granular roles on both planes (enterprise Tier 0)

## [0.10.15] - 2026-07-02

### Features
- platform audit logging + viewer (enterprise Tier 0)

### Documentation
- enterprise roadmap — what Pulse needs vs OpenClaw/Hermes

## [0.10.14] - 2026-07-02

### Bug Fixes
- align top command bar height with sidebar brand header

## [0.10.13] - 2026-07-01

### Bug Fixes
- icon actions for users; compact skills grid

## [0.10.12] - 2026-07-01

### Bug Fixes
- portal tenant actions dropdown; icons on model-pricing edit/delete

## [0.10.11] - 2026-07-01

### Features
- theme-aware ConfirmDialog (pulse variant)

## [0.10.10] - 2026-07-01

### Bug Fixes
- theme-aware sidebar user menu (pulse variant)

## [0.10.9] - 2026-07-01

### Features
- CSS-variable token system + light mode + theme toggle

## [0.10.8] - 2026-07-01

### Refactoring
- unify all pages on shared UI primitives

## [0.10.7] - 2026-07-01

### Features
- admin theme — violet accent + Geist sans font

## [0.10.6] - 2026-07-01

### Features
- recolor all inner admin pages to the Pulse Terminal palette

## [0.10.5] - 2026-07-01

### Features
- redesign admin as dark "Pulse Terminal" (shell + overview)

## [0.10.4] - 2026-07-01

### Features
- redesign admin dashboard as a real command center

## [0.10.3] - 2026-07-01

### Features
- email account flows + production hardening

## [0.10.2] - 2026-03-10

### Bug Fixes
- MiniMax sync uses known models since API has no /models endpoint

## [0.10.1] - 2026-03-10

### Bug Fixes
- add missing sync buttons for Google and MiniMax in Model Pricing tab

## [0.10.0] - 2026-03-10

### Features
- add MiniMax provider, dynamic admin providers tab, and tenant API mode

## [0.9.2] - 2026-03-10

### Bug Fixes
- model sync calls provider APIs directly and add price labels

## [0.9.1] - 2026-03-10

### Features
- add dynamic model pricing with admin UI and profit tracking

### Documentation
- add deployment howto guide

## [0.9.0] - 2026-03-10

Initial versioned release.

### Features
- Agent runtime with tool loop, streaming, memory, scheduling, delegation
- 15+ built-in tools (exec, python, scripts, memory, schedule, email, credentials)
- Skills system with 9 built-in skills and per-agent overrides
- Email channel (SMTP send + IMAP read)
- Telegram channel (polling + webhooks + groups + allowlists)
- Provider routing (Anthropic + OpenAI + tenant BYOK)
- Plugin system with hook-based architecture
- MCP tool support
- Multi-agent orchestration with delegation
- Workspace system with version-controlled files
- Credit-based billing with immutable ledger
- Full admin + tenant dashboards
- OAuth 2.0 with PKCE + dynamic client registration
- AES-256-GCM encryption for secrets at rest
- Docker deployment stack

### Bug Fixes
- OAuth redirect URI validation on authorization and token exchange
- Transactional billing (usage + balance + ledger in DB transaction)
- Exec policy uses agentProfileId instead of conversationId
- ANTHROPIC_API_KEY made optional for BYOK deployments
- REDIS_URL enforcement in production mode
