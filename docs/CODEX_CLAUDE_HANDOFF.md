# Codex / Claude Handoff

Last updated: 2026-07-07

This document is the shared coordination log for the Hermes Agent and OpenClaw parity work. Claude should read this file before changing related code, and Codex should update it after each implementation slice.

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
