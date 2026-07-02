# Changelog

All notable changes to Pulse AI will be documented in this file.
This changelog is auto-generated from conventional commits.

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
