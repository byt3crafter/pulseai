# Codex / Claude Handoff

Last updated: 2026-07-07

This document is the shared coordination log for the Hermes Agent and OpenClaw parity work. Claude should read this file before changing related code, and Codex should update it after each implementation slice.

Claude should also read `docs/CLAUDE_PORTING_BRIEF_HERMES_OPENCLAW.md` before porting any Hermes Agent or OpenClaw-inspired capability. It contains the local reference repo paths, pinned commits, priority order, and Pulse-specific porting rules.

## Current Request

The user asked to implement the missing pieces from fresh Hermes Agent and OpenClaw comparisons, with these hard constraints:

- Do not hardcode integration credentials, endpoints, channels, providers, or tenant behavior.
- Every setup surface must have a UI path in the dashboard or app, not only environment variables or source edits.
- Keep a Codex document of what changed so Claude knows what Codex did.
- Keep a missing-feature document that can be cross-checked.
- Treat this as coordinated work because Claude may be editing the project at the same time.

## Fresh Reference Clones

Codex cloned fresh upstream repositories into `/tmp/pulse-ai-refs`:

- Hermes Agent: `https://github.com/NousResearch/hermes-agent.git`
  - Commit: `009b42d`
  - Commit date: `2026-07-07 06:25:23 -0700`
  - Subject: `fix(discord): mirror all interactive prompt payloads into message content`
- OpenClaw: `https://github.com/openclaw/openclaw.git`
  - Commit: `d633a2df`
  - Commit date: `2026-07-07 16:06:13 +0100`
  - Subject: `fix(http-error-body): keep emoji / surrogate pairs intact during error body truncation (#101728)`

Do not use `openclaw_ref` as authoritative upstream evidence unless its remote is fixed. It currently pointed at `git@github-personal:byt3crafter/pulseai.git`, not upstream OpenClaw.

## Pulse Baseline Observed By Codex

Pulse already has these relevant foundations:

- Telegram adapter is wired at boot in `pulse/src/index.ts`.
- Email exists as a tool/service, not as a fully symmetric gateway channel.
- Plugin system exists in `pulse/src/plugins/*`.
- ERPNext plugin exists in `pulse/plugins/erpnext/*`.
- Agent delegation and routing exist in `pulse/src/agent/orchestration/*`.
- Memory exists in `pulse/src/memory/*`.
- Scheduling exists in `pulse/src/cron/*`.
- WebSocket control plane exists in `pulse/src/gateway/ws/*`.
- Desktop app exists in `desktop/*`.
- Dashboard has admin and tenant UI for many existing settings.

## Coordination Rules

When implementing parity work:

1. Check `git status --short` before editing.
2. Keep every durable artifact in Git-tracked repo paths. Do not rely on chat history or `/tmp` for project state.
3. Do not overwrite unrelated Claude or user changes.
4. Prefer additive, isolated files for new integrations.
5. For behavior changes, write a failing test first and commit only after it passes.
6. Add UI setup for each configurable feature in the same implementation slice or mark the feature incomplete.
7. If Codex does not know something and cannot verify it locally, leave a clear `Question for Claude` entry in this file before proceeding with risky assumptions.
8. Update `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md` when a slice changes status.
9. Update this handoff with:
   - files changed,
   - tests run,
   - known limitations,
   - what Claude should avoid duplicating.

## Work Log

### 2026-07-07 - Codex - Claim: Business Integration Catalog

Codex is working in isolated worktree `/home/d0v1k/Projects/pulse-codex` on branch `codex/integration-catalog`.

Planned slice:

- Add a Pulse-native business integration catalog instead of hardcoding or copy-pasting OpenClaw/Hermes code.
- Make ERPNext first-class in the catalog using the existing `pulse/plugins/erpnext` plugin.
- Add QuickBooks, Xero, Pastel, and Generic REST as setup-visible catalog entries, with runtime marked unavailable until plugins/adapters exist.
- Add tenant enable/disable/setup UI so every integration can be controlled from dashboard.
- Preserve encrypted credential storage and tenant isolation.

Files Codex expects to touch:

- `dashboard/src/app/dashboard/settings/plugins/page.tsx`
- `dashboard/src/app/dashboard/settings/plugins/TenantPluginsClient.tsx`
- new dashboard utility/catalog files as needed
- docs/checklist/plan updates

Claude should avoid editing these files until this claim is resolved, or coordinate here first.

### 2026-07-07 - Codex

Created coordination docs and parity planning docs.

Files added:

- `docs/CODEX_CLAUDE_HANDOFF.md`
- `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md`
- `docs/superpowers/plans/2026-07-07-hermes-openclaw-parity.md`

Files modified:

- `CLAUDE.md` will point Claude at this document.

Tests run:

- Documentation-only pass; no tests required yet.

Current implementation status:

- No production feature code added in this pass.
- Next recommended implementation slice: configurable channel adapter framework plus WhatsApp/Slack UI scaffolding, because Pulse currently only boots Telegram as a real inbound adapter.
- Pulse Vitest config currently includes `pulse/src/__tests__/**/*.test.ts`; new backend tests should go there unless the test config is intentionally changed.

Claude should avoid:

- Re-creating a separate parity checklist.
- Adding hardcoded provider/channel credentials in source.
- Adding integrations without a tenant/admin setup UI.

Question for Claude:

- If Claude is already implementing channel adapter bootstrapping, coordinate before touching `pulse/src/index.ts`, `pulse/src/channels/*`, or `dashboard/src/app/dashboard/channels/*`.

### 2026-07-07 - Codex - Channel Adapter Registry

Implemented the first TDD slice for config-driven channel work.

Files added:

- `pulse/src/__tests__/channel-registry.test.ts`
- `pulse/src/channels/registry.ts`

Files modified:

- `docs/CODEX_CLAUDE_HANDOFF.md`
- `docs/superpowers/plans/2026-07-07-hermes-openclaw-parity.md`

Tests run:

- RED: `cd pulse && npm test -- src/__tests__/channel-registry.test.ts`
  - Failed as expected because `../channels/registry.js` did not exist.
- GREEN: `cd pulse && npm test -- src/__tests__/channel-registry.test.ts`
  - Passed: 3 tests.

What changed:

- Added `registerChannelAdapter(type, factory)`.
- Added `getChannelAdapterFactory(type)`.
- Added `listRegisteredChannelTypes()`.
- Added `clearChannelAdapterRegistryForTests()`.
- Channel types are normalized to lowercase.
- Duplicate adapter registrations are rejected.

Known limitations:

- `pulse/src/index.ts` still initializes Telegram directly. The next slice should add `pulse/src/channels/bootstrap.ts` and wire Telegram through the registry.
- No WhatsApp/Slack runtime behavior yet.
- No setup UI changed in this slice because this is internal adapter infrastructure.

Question for Claude:

- If Claude has already refactored channel startup, compare against `pulse/src/channels/registry.ts` and avoid creating a second registry abstraction.

### 2026-07-07 - Codex - Config-Driven Channel Boot

Implemented registry-based channel bootstrap.

Files added:

- `pulse/src/__tests__/channel-bootstrap.test.ts`
- `pulse/src/channels/bootstrap.ts`

Files modified:

- `pulse/src/index.ts`
- `docs/CODEX_CLAUDE_HANDOFF.md`
- `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md`

Tests run:

- RED: `cd pulse && npm test -- src/__tests__/channel-bootstrap.test.ts`
  - Failed as expected because `../channels/bootstrap.js` did not exist.
- GREEN: `cd pulse && npm test -- src/__tests__/channel-bootstrap.test.ts src/__tests__/channel-registry.test.ts`
  - Passed: 5 tests.
- Build: `cd pulse && npm run build`
  - Passed.

What changed:

- Added `initializeChannelAdapters(connections, options)` in `pulse/src/channels/bootstrap.ts`.
- Startup now registers Telegram through `registerChannelAdapter("telegram", ...)`.
- Startup initializes all active channel connections through the registry instead of hard-filtering only Telegram.
- The existing worker `channelAdapters` map is populated by the bootstrap helper, so queued message sending keeps using the current path.
- Telegram webhook decoration remains available as `server.telegramAdapter`.
- `server.channelAdapters` is also decorated for future generic webhook routing.

Known limitations:

- Only Telegram is registered today.
- Unknown active channel types are skipped with a warning until their adapters exist.
- Dashboard channel setup UI is not updated yet.

Question for Claude:

- If Claude is working on WhatsApp or Slack, register those adapters through `pulse/src/channels/registry.ts` and do not add another direct boot block to `pulse/src/index.ts`.

### 2026-07-07 - Codex - Draft Channel Setup UI

Added a dashboard setup path for future channel adapters without activating unsupported runtimes.

Files added:

- `dashboard/src/utils/channel-catalog.ts`

Files modified:

- `dashboard/src/app/dashboard/settings/actions.ts`
- `dashboard/src/app/dashboard/settings/page.tsx`
- `dashboard/src/app/dashboard/settings/SettingsClient.tsx`
- `docs/CODEX_CLAUDE_HANDOFF.md`
- `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md`
- `docs/superpowers/plans/2026-07-07-hermes-openclaw-parity.md`

Tests and checks run:

- `cd dashboard && npm run build`
  - Passed.
- `cd dashboard && npx eslint src/app/dashboard/settings/plugins/page.tsx src/app/dashboard/settings/plugins/TenantPluginsClient.tsx src/utils/business-integrations.ts`
  - Passed.
- `cd pulse && npm test -- src/__tests__/channel-bootstrap.test.ts src/__tests__/channel-registry.test.ts`
  - Passed: 5 tests.
- `cd pulse && npm run build`
  - Passed.
- `cd dashboard && npm run lint`
  - Failed on existing repo-wide lint debt: 217 errors and 38 warnings. Touched-file lint still reports pre-existing issues in large settings files, including old `any` casts and React effect lint errors. The new draft-channel casts were changed to `Record<string, string | undefined>` and `Record<string, unknown>`.

What changed:

- Added `CHANNEL_SETUP_CATALOG` as the shared source of channel setup fields.
- Added `saveDraftChannelConfigAction(formData)` for WhatsApp, Slack, Discord, and WebChat setup data.
- Secret fields are encrypted before storage.
- Draft channel rows are saved with `status: "draft"` so the gateway does not boot missing adapters.
- Settings > Integrations now shows draft setup forms for WhatsApp, Slack, Discord, and WebChat.
- Fixed `saveTelegramTokenAction` so it looks up the existing Telegram row by both tenant and `channelType = "telegram"` instead of overwriting the first tenant channel row.

Known limitations:

- WhatsApp, Slack, Discord, and WebChat adapters are still not implemented.
- Draft channel setup does not test live credentials yet.
- Dashboard lint remains blocked by pre-existing lint debt in settings/admin files; dashboard production build passes.

Question for Claude:

- If Claude implements an adapter, it should switch that channel from `draft` to `active` only after runtime validation exists and should use `CHANNEL_SETUP_CATALOG` rather than adding separate field definitions.

### 2026-07-07 - Codex - Deterministic Automatic Memory

Implemented the memory reliability slice requested by the user: memory extraction is now a backend subsystem after completed turns, not something the chat model must remember to do with a tool call.

Files added:

- `pulse/src/__tests__/auto-memory-service.test.ts`
- `pulse/src/memory/auto-memory-service.ts`

Files modified:

- `pulse/src/agent/runtime.ts`
- `dashboard/src/app/dashboard/settings/actions.ts`
- `dashboard/src/app/dashboard/settings/page.tsx`
- `dashboard/src/app/dashboard/settings/SettingsClient.tsx`
- `docs/CODEX_CLAUDE_HANDOFF.md`
- `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md`
- `docs/superpowers/plans/2026-07-07-hermes-openclaw-parity.md`

Tests and checks run:

- `cd pulse && npm test -- src/__tests__/auto-memory-service.test.ts src/__tests__/channel-bootstrap.test.ts src/__tests__/channel-registry.test.ts`
  - Passed: 10 tests.
- `cd pulse && npm run build`
  - Passed.
- `cd dashboard && npm run build`
  - Passed.
- `cd dashboard && npx eslint src/app/dashboard/settings/SettingsClient.tsx src/app/dashboard/settings/actions.ts src/app/dashboard/settings/page.tsx src/utils/channel-catalog.ts`
  - Failed on existing settings-file lint debt: old explicit `any` types, an old `react-hooks/set-state-in-effect` issue, an unescaped apostrophe, and existing unused variable warnings. No TypeScript/build failure remains.

What changed:

- Added `AutoMemoryService.captureTurn()` with injectable extractor/store/search functions for testability.
- The extractor asks for strict JSON and only accepts bounded memory objects with known categories.
- Automatic writes are capped per turn, duplicate extracted facts are skipped, and exact normalized duplicates already in memory are skipped.
- Store failures are logged and contained so a memory write outage does not fail an already completed chat reply.
- Memory writes use the existing `memoryService.store()` path and metadata `{ source: "auto_memory" }`.
- Runtime now runs automatic memory after normal assistant replies, skips silent replies and heartbeat traffic, and rolls extraction token usage into the existing usage record.
- The extractor uses the active responding model passed into runtime, so no provider or model id is hardcoded.
- Tenant settings now include `auto_memory.enabled` and `auto_memory.maxMemories`.
- Settings > Memory now has an Automatic Memory setup card with a toggle and per-turn cap.

Known limitations:

- This is deterministic extraction and persistence, not a full reflection/consolidation loop yet.
- Duplicate detection is intentionally conservative: exact normalized memory content plus the existing memory search path.
- There is no separate review queue UI for proposed memory writes yet; writes happen automatically when enabled.
- The extraction model is the active response model for now. A future cheap-model selector should be tenant-configurable and reflected in billing/pricing, not hardcoded.

Claude should avoid:

- Reintroducing model-discretion memory writes as the only path.
- Adding hardcoded extraction model/provider ids.
- Creating a second memory service instead of extending `pulse/src/memory/auto-memory-service.ts`.

Question for Claude:

- Please review `pulse/src/agent/runtime.ts` around the post-response hook and confirm whether the project wants a later tenant-selectable cheap extraction model or should keep using the active agent model for billing simplicity.

### 2026-07-07 - Codex - Business Integration Catalog Foundation

Implemented in isolated worktree `/home/d0v1k/Projects/pulse-codex` on branch `codex/integration-catalog`.

This slice does not port OpenClaw/Hermes source code. It uses their extensibility pattern as a reference and implements a Pulse-native catalog on top of the existing plugin system.

Files added:

- `dashboard/src/utils/business-integrations.ts`
- `docs/superpowers/plans/2026-07-07-business-integration-catalog.md`
- `pulse/src/__tests__/plugin-tenant-access.test.ts`
- `pulse/src/plugins/tenant-access.ts`

Files modified:

- `dashboard/src/app/dashboard/settings/plugins/page.tsx`
- `dashboard/src/app/dashboard/settings/plugins/TenantPluginsClient.tsx`
- `docs/CODEX_CLAUDE_HANDOFF.md`
- `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md`
- `pulse/plugins/erpnext/index.ts`
- `pulse/src/agent/tools/registry.ts`
- `pulse/src/plugins/manager.ts`

Tests and checks run:

- `cd pulse && DATABASE_URL=postgres://user:pass@localhost:5432/pulse_test ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 npm test -- src/__tests__/plugin-tenant-access.test.ts src/__tests__/plugin-loading.test.ts`
  - Passed: 9 tests.
- `cd pulse && npm run build`
  - Passed.
- `cd dashboard && npm run build`
  - Passed.

What changed:

- Added `BUSINESS_INTEGRATION_CATALOG` with ERPNext, QuickBooks Online, Xero, Sage Pastel, and Generic REST API.
- Settings > Plugins now presents this as Business Integrations with runtime status, setup notes, credential forms, and tenant enable/disable controls.
- ERPNext maps to the existing real `erpnext` plugin.
- QuickBooks, Xero, Pastel, and Generic REST can have credentials saved now but are clearly marked setup-only until runtime plugins are implemented.
- Plugin tools are now filtered per tenant through `pluginManager.getPluginToolsForTenant(tenantId)`.
- ERPNext prompt context is also gated by tenant plugin enablement.
- Tenant disablement is now real runtime behavior, not only dashboard filtering.

Known limitations:

- QuickBooks, Xero, Pastel, and Generic REST runtime tools are not implemented in this slice.
- QuickBooks/Xero OAuth connect flows are not implemented yet; the catalog allows manual credential storage only.
- Plugin routes are still globally registered for active plugins; this slice gates tools and ERPNext prompt context per tenant, but route handlers should also enforce tenant/plugin access before accepting tenant-scoped webhook actions.
- Existing dashboard lint debt remains outside this slice; dashboard production build passes.

Claude should avoid:

- Replacing this with copied OpenClaw/Hermes code.
- Adding QuickBooks credentials as environment variables only; runtime work must use tenant-scoped encrypted credentials and UI.
- Treating setup-only integrations as live runtime support before plugins exist.

Next recommended slice:

- Implement QuickBooks Online runtime plugin with OAuth/connect UI, tenant credential refresh handling, and tools for customers, invoices, bills, payments, accounts, and reports.

---

## Update (Claude) — 2026-07-09: integration-catalog slice landed on main

The Codex `codex/integration-catalog` slice was **committed and merged to `main`** (merge `f104337`).

- Codex's staged work was committed as `ee1a43a` (branch `codex/integration-catalog`).
- `main` (v0.14.5, with Server Inventory / people / approvals / interlocutor, etc.) was merged **into** the branch first; the only overlap was `pulse/src/agent/tools/registry.ts` — auto-merged cleanly, keeping BOTH tool injections (per-tenant `getPluginToolsForTenant` **and** `getTenantServerTools`).
- Validated on the merged branch: pulse `tsc` clean, **332 tests pass** (needs `DATABASE_URL`/`ENCRYPTION_KEY` env — the worktree has no `.env`), dashboard `tsc` clean.
- **Not yet deployed to prod** — it's setup-only + a safe opt-out runtime gate (`resolveTenantPluginEnabled` defaults enabled), so it will ship with the first runtime plugin (QuickBooks P0), not on its own.

**Codex action needed:** your working branch `codex/integration-catalog` now contains a merge of main; for future work, reset/rebase it onto the new `main` (`f104337`) so it doesn't carry a stale base. The slice itself is fully on `main`.

Next: QuickBooks Online runtime plugin (P0). Open question for the owner: use Intuit OAuth (needs an Intuit developer app: client id/secret + registered redirect URI) vs. manual-token setup first (brief-allowed, no Intuit portal dependency, immediately usable).
