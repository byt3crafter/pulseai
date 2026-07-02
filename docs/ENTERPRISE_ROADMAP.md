# Pulse AI — Enterprise Roadmap ("What We Need")

> Written 2026-07-02. Positions Pulse against OpenClaw (v2026.6.9) and Hermes Agent
> (v0.17.0) — both **personal** assistants — for our **enterprise, multi-tenant**
> use case (shared SaaS + dedicated per-client deployments). Enterprises buy on
> security, identity, governance, and auditability *first*, then features.

---

## Where we stand
Pulse already has: multi-tenant isolation, credit billing + ledger, pgvector memory,
multi-agent orchestration, a manifest-based plugin system (ERPNext), exec-safety engine
+ approvals, Telegram + Email channels, multi-provider routing (Anthropic/OpenAI/Google/
OpenRouter/MiniMax), scheduling, email account flows, and a themed admin console.

The gaps below are what stand between us and closing enterprise deals.

---

## Tier 0 — Enterprise table-stakes (blockers for enterprise sales)

| # | Need | Why enterprise requires it | Pulse today |
|---|------|----------------------------|-------------|
| 1 | **SSO — SAML 2.0 / OIDC** + SCIM user provisioning | Corporate IT mandates login via their IdP (Okta/Azure AD/Google). No SSO = no deal. | Only email/password (NextAuth) |
| 2 | **MFA / 2FA (TOTP)** | Baseline for admin accounts; often contractual. | None |
| 3 | **Granular RBAC** (owner / admin / operator / billing / viewer) | "Everyone is ADMIN or TENANT" fails least-privilege reviews. | Only ADMIN / TENANT |
| 4 | **Platform audit log + viewer + export** | SOC2 / ISO27001 need immutable "who did what, when," exportable to SIEM. | `exec_audit_log` exists; no platform-wide capture or UI |
| 5 | **Signed plugin manifests + least-privilege sandbox** (OpenClaw delta) | Plugins run code in a multi-tenant/dedicated env; must declare + enforce FS/network/shell scope. | Plugins declare tools/hooks but aren't scoped/signed |
| 6 | **Data governance** — retention policies, right-to-be-forgotten, PII redaction in logs/memory | GDPR/POPIA; enterprises need to prove data lifecycle control. | Encryption at rest only |

---

## Tier 1 — Differentiators (turn features into enterprise value)

| # | Need | Source of idea | Enterprise framing |
|---|------|----------------|--------------------|
| 7 | **Self-improving memory** — add *skill memory* (agents learn/refine procedures) + *tenant/contact modeling* on top of our vector recall | Hermes | Agents that measurably get better at a client's recurring workflows — but with **tenant isolation, retention, and audit** built in (their version has none). This is our headline differentiator. |
| 8 | **Per-tenant model governance** — model allowlists, per-tenant spend caps/budgets, per-contact model override | OpenClaw + our billing | Enterprises need to cap cost and restrict which models touch their data. |
| 9 | **Guardrails** — prompt-injection defense, output moderation, PII filtering, approval workflows for risky actions | extends our exec-approvals | Compliance + safety review requirement before agents act on real systems. |

---

## Tier 2 — Reach & operations

| # | Need | Notes |
|---|------|-------|
| 10 | **Channels: WhatsApp Business Cloud API** (official Meta), Slack, MS Teams, WebChat | Enterprises live on WhatsApp Business / Slack / Teams — use compliant official APIs, not Baileys. |
| 11 | **Observability** — Prometheus metrics, tracing, alerting, per-tenant SLA dashboards | Only structured logs today; ops can't see health/latency/error rates. (This is what caused the 7-week silent outage.) |
| 12 | **Reliability** — per-tenant rate limiting, conversation concurrency control, HA, automated backup+restore runbook | IP-only rate limit today; backups scripted but not scheduled. |
| 13 | **Ops / GTM** — white-label branding per tenant, one-command dedicated-deployment provisioning, fleet updates | Needed to scale the dedicated-deployment business. |

---

## Recommended sequence
1. **Tier 0 first** — SSO + RBAC + audit log + signed-plugin sandboxing. Without these, enterprise procurement stops the conversation regardless of features.
2. **Tier 1 next** — self-improving memory is the differentiator; ship it with the governance controls (isolation/retention/audit) that make it enterprise-safe.
3. **Tier 2** — observability early (it's an operational risk we've already been bitten by), channels and GTM as demand dictates.

## Notes
- `openclaw_ref/` is pinned at 2026.2.23 (4 months stale). Re-pull latest to diff their
  signed-manifest/eBPF plugin security and richer Telegram delivery against ours.
- Neither OpenClaw nor Hermes is built multi-tenant/enterprise — our tenancy, billing,
  and (once built) SSO/RBAC/audit/governance are the moat, not the assistant features.
