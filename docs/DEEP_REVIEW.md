# Pulse AI - Deep Codebase Review

Date: March 3, 2026

This review is based on direct code inspection of backend, dashboard, and deployment artifacts. No tests were executed.

---

## Scope Reviewed

- Backend runtime, queue, providers, tools, webhooks, OAuth/API auth, plugins
- Dashboard admin + tenant flows (server actions + pages)
- Database schema, migrations, deployment scripts, Docker/compose

---

## Verified Features (From Code)

### Core Runtime

- Agent runtime with routing, tool execution loop, memory, scheduling, delegation, and streaming edits
- Provider routing with Anthropic primary + OpenAI fallback
- Usage metering, ledger entries, and balance deductions

### Channels

- Telegram adapter with dev polling + production webhooks + secret token validation
- Group policies (mentions/reply gating), allowlists, and pairing flow

### Tools & Plugins

- Built-in tools: time, calculator, exec, python, scripts, memory, schedule, email, credential vault
- Tool policy allow/deny lists per agent
- MCP tool support
- Plugin system that can register tools, hooks, and routes

### API Surface

- OpenAI-compatible `/v1/chat/completions`
- OpenAI Responses-compatible `/v1/responses`
- OAuth 2.0 flow for CLI tools + dynamic registration
- API token auth for HTTP endpoints

### Queue & Rate Limiting

- BullMQ queue + worker with Redis
- Fastify rate-limit middleware

### Dashboard

- Admin: tenant CRUD, users, plugins, usage, conversations
- Tenant: agents, routing rules, skills, scripts, memory, schedules, safety, credentials, usage, channels/settings
- OAuth consent + token generation

### Deployment

- Dockerfiles for gateway + dashboard + Python sandbox
- Root `docker-compose.yml` for full stack
- Deployment scripts + pre-deploy checks (TypeScript + Vitest)

---

## High-Priority Findings (Security / Reliability)

1. **OAuth redirect URI is not validated**
   - Authorization accepts any `redirectUri` without verifying it matches the client’s registered redirect list.
   - Risk: OAuth code/token leakage.

2. **Exec safety agent scoping is broken**
   - Exec tool uses `conversationId` as `agentId`, so agent-specific exec rules never match.
   - Risk: policy bypass / unexpected exec allowance.

3. **Billing updates are not transactional**
   - Usage record insert + balance update + ledger insert happen outside a DB transaction.
   - Risk: race conditions and inconsistent balances under concurrency.

4. **ANTHROPIC_API_KEY required even when not used**
   - Startup requires ANTHROPIC_API_KEY even if OpenAI or tenant keys are used.
   - Risk: valid deployments blocked unnecessarily.

---

## Medium-Priority Findings

1. **REDIS_URL not enforced in production**
   - Redis is optional in config; production can start without queueing or distributed rate limiting.

2. **WebSocket auth doesn’t accept OAuth tokens**
   - WS server only checks API tokens, even though OAuth tokens are supported elsewhere.

3. **Global provider key fields appear to be hashes**
   - `globalSettings.anthropicApiKeyHash` / `openaiApiKeyHash` are used directly as raw keys.
   - If these are actual hashes, provider calls will fail.

4. **Docker/Node version mismatch**
   - Docs mention Node 22+, but Dockerfiles use Node 20.

---

## Docs vs Code Mismatches

- `STATUS_SUMMARY.md` and `ROADMAP.md` say “no tests, no Docker, no tools framework,” but these are implemented.
- `pulse/docs/API.md` does not list OpenAI-compatible or Responses endpoints.

---

## Production Readiness (Based on Code + Ops Scripts)

### Already in place

- Webhook-based Telegram handling
- Queue + worker (BullMQ/Redis)
- Rate limiting
- Tool registry + plugin system
- Docker files and compose
- Pre-deploy checks with Vitest

### Still needed for production hardening

- Fix OAuth redirect URI validation
- Transactional billing (row locks / serializable update)
- Confirm Docker-based tools work in production (gateway needs access to Docker or alternative sandbox)
- Monitoring/metrics beyond logs
- Backups + restore runbook
- CI pipeline for tests/linting

---

## Recommendations (Prioritized)

1. **Security**
   - Validate `redirectUri` against `oauthClients.redirectUris` during approval and token exchange.

2. **Reliability**
   - Wrap usage/balance/ledger writes in a DB transaction and lock the tenant balance row.

3. **Tool safety**
   - Use agent profile ID in exec policy evaluation, not conversation ID.

4. **Ops**
   - Make `ANTHROPIC_API_KEY` optional when other providers/keys exist, or validate at runtime per request.

5. **Config**
   - Require `REDIS_URL` in production and fail fast if absent.

---

## Next Steps (If You Want Changes Applied)

- Fix OAuth redirect validation + add tests
- Make billing transactional with locking
- Update `STATUS_SUMMARY.md`, `ROADMAP.md`, and `pulse/docs/API.md` to match reality
