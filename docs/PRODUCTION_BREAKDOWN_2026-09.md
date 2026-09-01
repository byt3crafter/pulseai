# Pulse AI — Production Breakdown & Pick-List

Last updated: 2026-09-01 · Supersedes the 2026-07-07 parity checklist (most of which is now done).

This is a decision menu, not a plan. Each item is scoped so you can pick it à la carte.
**Legend** — Effort: S (<½ day) · M (1–2 days) · L (3–5 days) · XL (>1 week).
Priority: P0 (blocks a deal / real risk) · P1 (strong value) · P2 (nice) · P3 (someday).

---

## 0. Where production stands today

| | Runstate | Metcheck |
|---|---|---|
| Version | **v0.20.48** | **v0.20.35** (13 behind) |
| Health | 17 containers healthy · 200 | 5 healthy · 200 |
| Role | vendor deployment, real workspace | first customer (Botswana) |

Both live and stable. The only standing production risk is **version drift on Metcheck**
(missing security fixes, per-tenant billing, skills, model groups, login work).

---

## 1. Already shipped (do NOT rebuild — the old checklist is wrong on these)

Browser automation (Playwright) · Web search (SearXNG/Tavily) · Voice/STT (ElevenLabs) ·
Image generation · **Skills system** · **Model groups** (failover/cost, config-driven) ·
**Per-tenant billing + suspension** · Auto-memory + persona rollup · OneDrive · Commitments ·
Departments/channels model · Multi-user privacy (owner/visibility/sharing) · Clerk-style
branded logins · Truth Gate · Approval gates (HITL) · Server inventory (guarded SSH) ·
Codex thread freshness (settings reach live conversations).

---

## 2. Channels — the one commercially load-bearing gap

At runtime **only Telegram actually routes messages.** The rest are setup-UI drafts:
credentials save, but no adapter runs. This is the #1 thing a prospect will test.

| Item | Status | Effort | Priority | Done when |
|---|---|---|---|---|
| **WhatsApp adapter** | draft UI only | L | **P0** | Tenant sets up WhatsApp, webhook adapter routes to agents, tests cover auth/routing |
| **Slack adapter** | draft UI only | L | **P0** | Slack app events/signing verified, adapter routes DMs/channels, tests |
| **Discord adapter** | draft UI only | M | P1 | Bot token/guild setup, adapter routes DMs/groups |
| **WebChat widget** | partial (assistant exists) | M | P1 | Embeddable widget config + script, no code edits |
| Signal / Teams / Matrix / LINE | missing | XL (each) | P2 | Adapter SDK supports as plugins without core edits |

**What to pull from Hermes/OpenClaw:** the adapters themselves. OpenClaw (~143 extensions)
and Hermes (~90 platform plugins) have working WhatsApp/Slack/Discord/Signal. This is the
portable value — everything else below you've already built your own version of.

---

## 3. Integrations catalog

| Item | Status | Effort | Priority | Done when |
|---|---|---|---|---|
| **QuickBooks / Xero runtime plugin** | setup-visible, no runtime | L | P1 | Same pattern as ERPNext: enable/disable, tenant tools |
| **Generic REST integration** | custom-tools exist | — | done-ish | Custom Tools already covers ad-hoc APIs |
| Plugin marketplace / catalog UI | thin (6 plugins) | M | P2 | Catalog shows installed/available, per-tenant enable |
| Signed manifest enforcement | hash approval exists | M | P1 | Admin approves signed manifests, drift disables plugin |

---

## 4. Observability — currently zero

No metrics/tracing. For a multi-tenant vendor this is a real hole: no per-tenant latency,
error rate, or spend visibility except grepping logs.

| Item | Status | Effort | Priority | Done when |
|---|---|---|---|---|
| **`/metrics` (Prometheus)** | missing | M | P1 | Per-tenant request/latency/error/token counters scraped |
| OTel tracing exporter | missing | L | P2 | Admin configures an OTLP endpoint in UI |
| Langfuse/LLM-trace export | missing | M | P2 | Per-agent LLM traces to a configured sink |

---

## 5. Memory & learning

| Item | Status | Effort | Priority | Done when |
|---|---|---|---|---|
| Auto-memory + persona rollup | done | — | — | — |
| **Session search / summarization UX** | history exists, no FTS recall | M | P1 | Tenant searches/summarizes past sessions; agent retrieves summaries |
| Reflection / consolidation job | partial (persona only) | M | P1 | Scheduled consolidation of memories/sessions, audited, tenant-controlled |
| Self-improvement loop | missing | L | P1 | Scheduled review suggests skill changes with approval + audit |
| User modeling (Honcho-style) | missing | L | P2 | Opt-in, auditable, tenant-isolated profile |

---

## 6. Vendor / tenancy (from the Tanelec discussion)

| Item | Status | Effort | Priority | Done when |
|---|---|---|---|---|
| Per-tenant billing + suspension | **done** | — | — | Shipped v0.20.42 |
| **Metadata-only support view** | missing | M | **P0** | Support a tenant from run/error/spend/health data WITHOUT reading their conversations |
| **Credential scoping (2 ERPNexts / workspace)** | blocked by `UNIQUE(tenant_id,name)` | M | P1 | Constraint → `(tenant_id,name,agent_id)`; vault override already written |
| Reusable named connections (Zapier-style) | missing | L | P2 | A workspace holds N named connections per integration |

---

## 7. Production hygiene (surfaced by today's key incident)

| Item | Status | Effort | Priority | Done when |
|---|---|---|---|---|
| **Update Metcheck → current** | 13 behind | S | **P0** | Pull v0.20.48, verify, no source build |
| **Credential health signal** | dead creds show "Configured" | S | P1 | UI flags "needs re-entry" when a stored secret won't decrypt |
| Automated verified DB backups (cron) | manual only | S | P1 | Nightly pg_dump + restore-check, retained, off-box |
| ENCRYPTION_KEY durable backup | **done today** | — | — | `/root/pulse-env-backups/` (root 600) |
| Deploy discipline (no hand-rolled rsync) | **done** | — | — | remote-build.sh syncs with `--exclude .env` |

---

## 8. Platform breadth (someday)

Media/video generation · Canvas/live visual workspace · Mobile app/PWA ·
Subagent parallel pipelines (delegation exists; no bounded Python-RPC fan-out) ·
Trajectory/research export · Desktop companion parity.

---

## Suggested first picks (my opinion, you decide)

1. **Update Metcheck** (S, P0) — removes real risk in 15 min.
2. **WhatsApp + Slack adapters** (L each, P0) — the one parity gap that loses deals.
3. **Metadata-only support view** (M, P0) — sell "we don't read your data"; compounds per client.
4. **Credential health signal** (S, P1) — cheap, prevents repeat of today's confusion.
5. **`/metrics` endpoint** (M, P1) — you can't operate a fleet blind.
