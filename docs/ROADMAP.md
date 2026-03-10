# Pulse AI — Roadmap & Status

**Last Updated:** March 10, 2026
**Current Status:** ~70% Production-Ready
**Phase:** Late Phase 1 — security fixes applied, features complete, hardening remaining

---

## What's Done

### Core Platform
- [x] Agent runtime with tool loop, streaming edits, memory, scheduling, delegation
- [x] 15+ built-in tools (exec, python, scripts, memory, schedule, email, credential vault, etc.)
- [x] Skills system — 9 built-in .skill.md files, admin defaults, per-agent overrides
- [x] Provider routing — Anthropic (primary) + OpenAI (fallback) + tenant BYOK
- [x] Plugin system — manifest-based with tool/hook/route injection (ERPNext plugin included)
- [x] MCP tool support (protocol-compliant bridging)
- [x] Multi-agent orchestration — delegation with conversation handoff
- [x] Workspace system — agents version-control their own workspace files
- [x] Agent routing rules — contact, keyword, group, default

### Channels
- [x] Telegram — polling (dev) + webhooks (prod) + group handling + allowlists + pairing
- [x] Email — SMTP send + IMAP read with tenant/agent config resolution
- [ ] WhatsApp — stubs only
- [ ] WebChat — stubs only

### Billing & Usage
- [x] Credit-based billing with pre-flight balance checks
- [x] Immutable ledger with double-entry transactions
- [x] Per-model cost calculation with token metering
- [x] Transactional billing (usage + balance + ledger in DB transaction)
- [x] Usage dashboard (admin + tenant)

### Security & Auth
- [x] NextAuth v5 with JWT + role-based access (ADMIN / TENANT)
- [x] OAuth 2.0 authorization code flow with PKCE + dynamic client registration
- [x] Redirect URI validation on authorization and token exchange
- [x] API token authentication
- [x] AES-256-GCM encryption for all secrets at rest
- [x] Exec safety engine — obfuscation detection, dangerous patterns, policy rules
- [x] Rate limiting (10 login attempts/min/IP)
- [x] Tenant isolation — every query filtered by tenantId

### Dashboard
- [x] Admin: tenants, users, plugins, usage, conversations, global settings, exec safety
- [x] Tenant: agents, routing, skills, scripts, memory, schedules, safety, credentials, email, usage, billing, channels, settings
- [x] Agent workspace: system prompt, workspace files, skills editor, email config, heartbeat, sandbox, tool policy, delegation, knowledge
- [x] OAuth consent screen + token generation
- [x] Onboarding wizard

### Infrastructure
- [x] BullMQ + Redis message queue with retry/backoff
- [x] Docker deployment (gateway, dashboard, postgres, redis, python-sandbox)
- [x] Deployment scripts (push.sh, deploy.sh, db-migrate.sh)
- [x] Pino structured logging
- [x] Zod config validation
- [x] REDIS_URL enforced in production mode
- [x] ANTHROPIC_API_KEY optional (supports BYOK-only deployments)

### Testing
- [x] 6 test files, 52 tests (Vitest)
- [x] Tool schema validation, Telegram commands, provider fallback, workspace prompts, plugin loading

---

## What's Remaining

### Priority 1 — Before Production Traffic

| Item | Effort | Notes |
|------|--------|-------|
| CI/CD pipeline (GitHub Actions) | 4-6h | Typecheck + lint + test gating on PR/push |
| Test coverage to ~30-40% | 8-12h | Runtime, billing, OAuth, provider fallback, dashboard actions |
| Monitoring & metrics | 8-12h | Prometheus export, Grafana dashboards, error alerting |
| Postgres backup runbook | 2-3h | Automated daily backups, restore procedure |

### Priority 2 — Post-MVP Enhancements

| Item | Effort | Notes |
|------|--------|-------|
| WhatsApp channel | 2-3d | Baileys or Business API adapter |
| WebChat widget | 2-3d | Embeddable JS widget + WebSocket |
| Load testing baseline | 6-8h | Webhook throughput, queue perf, provider latency |
| Per-tenant rate limiting | 4-6h | Current rate limiter is IP-based only |
| Concurrency control | 4-6h | Conversation-level locking for rapid-fire messages |
| Redis session store | 2-3h | Replace in-memory rate limiter with distributed |

### Priority 3 — Enterprise Features

| Item | Notes |
|------|-------|
| 2FA / TOTP | Dashboard login hardening |
| Audit log viewer | UI for existing exec_audit_log table |
| Data retention policies | Auto-prune old conversations/messages |
| White-label branding | Custom domain + logo per tenant |
| Multi-region deployment | Regional instances with data residency |
| Conversation analytics | Volume trends, sentiment, resolution rates |
| API documentation | OpenAPI/Swagger for gateway endpoints |

---

## Architecture

```
User -> Telegram / Email / API / WebChat (future)
         |
  pulse/src/gateway/server.ts     (Fastify HTTP + WS)
         |
  pulse/src/queue/                (BullMQ + Redis, sync fallback)
         |
  pulse/src/agent/runtime.ts      (Agent loop: LLM + tools + memory)
         |
  pulse/src/agent/providers/      (Anthropic, OpenAI, tenant BYOK)
         |
  pulse/src/agent/tools/          (15+ built-in + MCP + plugins)

Dashboard -> Next.js 16 App Router
         |
  Server Components -> DB queries via Drizzle
  Server Actions -> Auth-guarded mutations
  Client Components -> Interactive UI
```

---

## Key Metrics

| Metric | Current | Target (Production) |
|--------|---------|---------------------|
| Test coverage | ~5% | 30-40% |
| Build time | ~15s | <20s |
| Active tools | 15+ | 15+ |
| Active channels | 2 (Telegram, Email) | 4 (+ WhatsApp, WebChat) |
| DB tables | 29 | 29 |
| Security issues | 0 (5 fixed) | 0 |
