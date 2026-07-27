# Changelog

All notable changes to Pulse AI will be documented in this file.
This changelog is auto-generated from conventional commits.

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
