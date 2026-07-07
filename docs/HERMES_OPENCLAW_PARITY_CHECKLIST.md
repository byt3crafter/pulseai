# Hermes Agent / OpenClaw Parity Checklist

Last updated: 2026-07-07

This checklist tracks what Pulse AI is missing against fresh upstream clones of Hermes Agent and OpenClaw. It is a working cross-check document, not a marketing roadmap.

## Reference Evidence

Fresh upstream snapshots used by Codex:

| Project | Repo | Commit | Date |
|---|---|---:|---|
| Hermes Agent | `https://github.com/NousResearch/hermes-agent.git` | `009b42d` | 2026-07-07 |
| OpenClaw | `https://github.com/openclaw/openclaw.git` | `d633a2df` | 2026-07-07 |

Scale observed:

- OpenClaw has 143 top-level extension directories under `extensions/`.
- Hermes Agent has about 90 second-level plugin/provider/platform directories under `plugins/`.
- Pulse currently has one concrete local plugin, `pulse/plugins/erpnext`, plus a core plugin manager/SDK.

## Non-Negotiable Product Constraints

- No hardcoded credentials, tokens, endpoints, tenant ids, channel ids, model ids, or business-system assumptions.
- Every configurable feature must have a setup UI in dashboard/admin/app, not only a source-code path.
- Multi-tenant isolation must be preserved for every feature.
- Server actions must use existing auth guards from `CLAUDE.md`.
- New external-action tools must declare permissions and be auditable.
- New production behavior must have tests written before implementation.

## Parity Status

| Area | Pulse Status | Gap | Priority | Done When |
|---|---|---|---|---|
| Telegram | Implemented | Needs ongoing hardening only | P0 | Existing tests pass and setup UI remains tenant-safe |
| Email | Partial | Service/tool exists, but not a full first-class gateway channel like Hermes platforms | P1 | Tenant can configure inbound/outbound email channel in UI and route messages to agents |
| WhatsApp | Draft setup UI only | Credentials can be saved as draft; runtime adapter missing | P0 | Tenant UI supports WhatsApp setup, webhook/polling adapter runs, tests cover auth/routing |
| Slack | Draft setup UI only | Credentials can be saved as draft; runtime adapter missing | P0 | Tenant UI supports Slack app credentials/events, adapter routes messages, tests cover signing/auth |
| Discord | Draft setup UI only | Credentials can be saved as draft; runtime adapter missing | P1 | Tenant UI supports bot token/guild setup, adapter routes DMs/groups |
| WebChat | Draft setup UI only | Widget/runtime path still missing | P1 | Tenant can create webchat widget config and embed script without code edits |
| Signal/Teams/Matrix/Google Chat/LINE/etc. | Missing | OpenClaw/Hermes have broad platform catalogs | P2 | Channel adapter SDK supports these as plugins without core edits |
| Plugin catalog | Thin | ERPNext only | P0 | Catalog UI shows installed/available plugins and can configure at least ERPNext, QuickBooks/Xero, browser/search |
| Plugin permissions | Partial | Hash approval exists; runtime enforcement and signing need hardening | P0 | Admin approves signed manifests, permissions enforced at runtime, drift disables plugin |
| Provider catalog | Partial | Static provider registry, not catalog/plugin driven | P1 | Providers can be added/configured without source edits and appear in admin/tenant UI |
| Browser automation | Missing | No browser/computer-use tool in registry | P0 | Admin enables browser backend, tenant/agent policy controls it, tool can browse/scrape/forms with tests |
| Web search/readability | Missing | No Tavily/Brave/Firecrawl/Exa/search plugin | P1 | Search provider setup UI plus tenant-scoped search tool |
| Voice/STT/TTS | Missing | No voice memo transcription, talk mode, or TTS | P2 | Admin configures STT/TTS providers; tenant enables voice channel/tool |
| Media/image/video generation | Missing | No image/video plugin catalog | P2 | Provider-backed image/video tools with UI setup and permission controls |
| Canvas/live visual workspace | Missing | No OpenClaw-style live canvas | P2 | Agent can render/update a tenant-visible canvas with access controls |
| Desktop app | Partial | Electron client exists, but not equivalent to OpenClaw companion hub/nodes | P2 | Desktop has status, server selection, chat, notifications, update/install flow |
| Mobile app | Missing | Product copy mentions mobile, code not present | P3 | Mobile app or PWA supports secure chat and notifications |
| Gateway control plane | Partial | WebSocket only auth/ping/broadcast today | P1 | WS exposes typed events for messages, agent status, jobs, tool progress, channel health |
| Onboarding/doctor | Partial | Dashboard onboarding exists; CLI doctor exists but narrower than references | P1 | Admin/tenant diagnostics detect bad channel config, risky DM policy, sandbox/provider issues |
| Deterministic auto-memory | Implemented | Automatic extraction exists after completed turns; review queue and consolidation still missing | P0 | Backend stores durable facts without model-discretion tool calls and tenant UI controls it |
| Self-improving learning loop | Missing/partial | Memory, auto-memory, and skill creator exist, but no autonomous skill improvement loop | P1 | Scheduled review suggests/creates skill changes with approval and audit trail |
| Reflection/consolidation | Missing | Automatic memory writes are not periodically summarized or promoted yet | P1 | Background job consolidates memories/session summaries with audit trail and tenant controls |
| Session search/summarization | Partial | Conversation history exists; no Hermes-style FTS session recall UX | P1 | Tenant can search and summarize past sessions, agent can retrieve session summaries |
| User modeling | Missing | No Honcho-style user model or governed profile builder | P2 | User model is opt-in, auditable, tenant-isolated, and visible/editable in UI |
| Runtime backends | Partial | Docker/Python sandbox plus text-only CLI fallback | P2 | Backend config supports local, Docker, SSH, and future remote providers without hardcoding |
| Subagents/parallel pipelines | Partial | Delegation exists; no Hermes-style Python tool RPC pipelines | P1 | Agent can spawn bounded parallel tasks with audit, depth, and cost controls |
| Trajectory/research tools | Missing | Hermes has batch trajectory/compression focus | P3 | Optional research mode can export anonymized trajectories with tenant consent |
| Observability plugins | Partial | Logs exist, no Prometheus/Langfuse/OTel catalog | P1 | Admin can configure metrics/tracing exporters in UI |
| Channel/plugin SDK docs | Partial | Internal plugin SDK exists; channel registry and config-driven boot now exist, adapter SDK docs still missing | P0 | Docs and tests define channel adapter contract for new channels |

## Recommended Build Order

1. Tenant channel setup UI and UI-ready channel configuration model.
2. WhatsApp and Slack adapters with tenant setup UI.
3. Browser/search tool plugins with admin/tenant setup UI.
4. Provider/plugin catalog expansion and signed manifest enforcement.
5. Gateway WebSocket event expansion for app/widget/desktop.
6. Self-improvement loop with approval UI.
7. Voice/media/canvas after the business-critical channels and browser/search are stable.

## Cross-Check Commands

Run these after each slice:

```bash
git status --short
cd pulse && npm test
cd pulse && npm run build
cd dashboard && npm run lint
cd dashboard && npm run build
```

If a command cannot run because local services or secrets are missing, record the exact reason in `docs/CODEX_CLAUDE_HANDOFF.md`.
