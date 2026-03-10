# Changelog

All notable changes to Pulse AI will be documented in this file.
This changelog is auto-generated from conventional commits.

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
