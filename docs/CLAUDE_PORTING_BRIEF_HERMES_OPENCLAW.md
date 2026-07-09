# Claude Porting Brief: Hermes Agent + OpenClaw To Pulse AI

Last updated: 2026-07-07

This file is for Claude Code. The user wants Pulse AI to absorb the useful missing capabilities from Hermes Agent and OpenClaw, but implemented as Pulse-native, tenant-configurable features.

Do not copy large chunks blindly. Use the reference repos to understand patterns, contracts, and feature shape, then implement inside Pulse's architecture with tests, tenant isolation, encrypted credentials, setup UI, and enable/disable controls.

## Current Worktree Rules

Use isolated worktrees. Do not edit the main checkout directly.

```bash
# Codex branch currently used for business integration catalog work:
cd /home/d0v1k/Projects/pulse-codex
git branch --show-current
# codex/integration-catalog

# Claude should use its own worktree/branch:
cd /home/d0v1k/Projects/Pulse_AI
git worktree add ../pulse-claude -b claude/<slice-name>
```

Before touching hot shared files, append a claim to:

- `docs/CODEX_CLAUDE_HANDOFF.md`

Hot files include:

- `pulse/src/agent/runtime.ts`
- `pulse/src/index.ts`
- `pulse/src/agent/tools/registry.ts`
- `pulse/src/plugins/manager.ts`
- `dashboard/src/app/dashboard/settings/SettingsClient.tsx`
- `dashboard/src/app/dashboard/settings/actions.ts`
- `dashboard/src/app/dashboard/settings/plugins/page.tsx`
- `dashboard/src/app/dashboard/settings/plugins/TenantPluginsClient.tsx`

## Reference Repositories

Fresh clones are currently here:

```text
/tmp/pulse-ai-refs/hermes-agent
/tmp/pulse-ai-refs/openclaw
```

Pinned snapshots used by Codex:

```text
Hermes Agent
Repo: https://github.com/NousResearch/hermes-agent.git
Path: /tmp/pulse-ai-refs/hermes-agent
Commit: 009b42d
Date: 2026-07-07T06:25:23-07:00
Subject: fix(discord): mirror all interactive prompt payloads into message content

OpenClaw
Repo: https://github.com/openclaw/openclaw.git
Path: /tmp/pulse-ai-refs/openclaw
Commit: d633a2df
Date: 2026-07-07T16:06:13+01:00
Subject: fix(http-error-body): keep emoji / surrogate pairs intact during error body truncation (#101728)
```

If `/tmp/pulse-ai-refs` is missing, recreate it:

```bash
mkdir -p /tmp/pulse-ai-refs
git clone https://github.com/NousResearch/hermes-agent.git /tmp/pulse-ai-refs/hermes-agent
git clone https://github.com/openclaw/openclaw.git /tmp/pulse-ai-refs/openclaw
git -C /tmp/pulse-ai-refs/hermes-agent checkout 009b42d
git -C /tmp/pulse-ai-refs/openclaw checkout d633a2df
```

Refresh to newest only if the user explicitly wants latest again:

```bash
git -C /tmp/pulse-ai-refs/hermes-agent fetch origin
git -C /tmp/pulse-ai-refs/hermes-agent checkout origin/main
git -C /tmp/pulse-ai-refs/openclaw fetch origin
git -C /tmp/pulse-ai-refs/openclaw checkout origin/main
```

Record any refreshed commit hashes in `docs/CODEX_CLAUDE_HANDOFF.md`.

## Important Reference Areas

Hermes Agent:

```text
/tmp/pulse-ai-refs/hermes-agent/plugins
/tmp/pulse-ai-refs/hermes-agent/providers
/tmp/pulse-ai-refs/hermes-agent/gateway
/tmp/pulse-ai-refs/hermes-agent/tools
/tmp/pulse-ai-refs/hermes-agent/cron
/tmp/pulse-ai-refs/hermes-agent/skills
/tmp/pulse-ai-refs/hermes-agent/apps
/tmp/pulse-ai-refs/hermes-agent/web
```

OpenClaw:

```text
/tmp/pulse-ai-refs/openclaw/extensions
/tmp/pulse-ai-refs/openclaw/src
/tmp/pulse-ai-refs/openclaw/packages
/tmp/pulse-ai-refs/openclaw/apps
/tmp/pulse-ai-refs/openclaw/config
/tmp/pulse-ai-refs/openclaw/docs
/tmp/pulse-ai-refs/openclaw/security
```

Pulse AI target areas:

```text
Business plugins:     pulse/plugins/*
Plugin runtime:       pulse/src/plugins/*
Tool registry:        pulse/src/agent/tools/*
Agent runtime:        pulse/src/agent/runtime.ts
Channel runtime:      pulse/src/channels/* and pulse/src/gateway/*
Tenant settings UI:   dashboard/src/app/dashboard/settings/*
Admin plugin UI:      dashboard/src/app/admin/plugins/*
Business catalog:     dashboard/src/utils/business-integrations.ts
Coordination docs:    docs/CODEX_CLAUDE_HANDOFF.md
Missing checklist:    docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md
```

## Non-Negotiable Product Rules

- Do not hardcode credentials, endpoints, tenant ids, provider ids, model ids, or business-system assumptions.
- Every integration must have dashboard setup UI.
- Every integration must have tenant enable/disable controls.
- Disabled integrations must not expose runtime tools or prompt context.
- Credentials must be tenant-scoped and encrypted.
- Setup-only integrations must be labeled setup-only until runtime works.
- External action tools must declare permissions and be auditable.
- Write tests before runtime behavior changes.
- Keep changes on a branch/worktree, not `main`.

## What Codex Already Built

Already merged on main:

- Channel adapter registry.
- Config-driven channel boot.
- Draft setup UI for WhatsApp, Slack, Discord, and WebChat.
- Deterministic automatic memory with UI controls.

Currently staged in Codex worktree `codex/integration-catalog`:

- `dashboard/src/utils/business-integrations.ts`
- Business integration catalog entries:
  - ERPNext
  - QuickBooks Online
  - Xero
  - Sage Pastel
  - Generic REST API
- Runtime tenant gating for plugin tools:
  - `pulse/src/plugins/tenant-access.ts`
  - `pulse/src/plugins/manager.ts`
  - `pulse/src/agent/tools/registry.ts`
- ERPNext prompt hook gated by tenant enablement:
  - `pulse/plugins/erpnext/index.ts`
- Tenant UI for setup/runtime status/enable-disable:
  - `dashboard/src/app/dashboard/settings/plugins/page.tsx`
  - `dashboard/src/app/dashboard/settings/plugins/TenantPluginsClient.tsx`
- Test:
  - `pulse/src/__tests__/plugin-tenant-access.test.ts`

Verification in Codex worktree:

```bash
cd /home/d0v1k/Projects/pulse-codex/pulse
DATABASE_URL=postgres://user:pass@localhost:5432/pulse_test \
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
npm test -- src/__tests__/plugin-tenant-access.test.ts src/__tests__/plugin-loading.test.ts
npm run build

cd /home/d0v1k/Projects/pulse-codex/dashboard
npx eslint src/app/dashboard/settings/plugins/page.tsx src/app/dashboard/settings/plugins/TenantPluginsClient.tsx src/utils/business-integrations.ts
npm run build
```

All commands above passed in the Codex worktree.

## Porting Priorities

### P0: QuickBooks Online Runtime Plugin

Build this next. The user said ERPNext and QuickBooks are very important.

Reference the plugin/catalog patterns from OpenClaw/Hermes, but implement as a Pulse plugin:

```text
Create: pulse/plugins/quickbooks/index.ts
Create: pulse/plugins/quickbooks/client.ts
Create: pulse/plugins/quickbooks/tools/*
Modify: dashboard/src/utils/business-integrations.ts
Modify: dashboard settings plugin UI only if OAuth/connect needs additional UI
Test: pulse/src/__tests__/quickbooks-plugin.test.ts
```

Required tools:

- `quickbooks_query`
- `quickbooks_get_customer`
- `quickbooks_list_customers`
- `quickbooks_list_invoices`
- `quickbooks_get_invoice`
- `quickbooks_create_invoice`
- `quickbooks_list_bills`
- `quickbooks_list_payments`
- `quickbooks_report`

Required setup:

- Tenant UI for QuickBooks connection.
- OAuth/connect flow preferred.
- Until OAuth is complete, manual credential fields are acceptable only if UI clearly says manual setup.
- Store tokens encrypted, tenant-scoped.
- Refresh tokens automatically.
- No env-only credential setup.

Runtime guard:

- QuickBooks tools only available when:
  - plugin is globally enabled,
  - manifest is approved,
  - tenant enabled it,
  - required credentials exist.

### P0: ERPNext Hardening

ERPNext already exists, but finish production hardening:

- Add connection test action in UI.
- Add visible tool list and permissions.
- Gate plugin routes by tenant/plugin access.
- Add webhook secret verification before ERPNext webhooks can trigger work.
- Add clearer docs for required ERPNext permissions.

Files:

```text
pulse/plugins/erpnext/*
dashboard/src/app/dashboard/settings/plugins/*
dashboard/src/utils/business-integrations.ts
```

### P1: Generic REST Runtime Plugin

This unlocks many business systems without a dedicated connector.

Create:

```text
pulse/plugins/generic-rest/index.ts
pulse/plugins/generic-rest/client.ts
pulse/plugins/generic-rest/tools/request.ts
```

Rules:

- Tenant config controls base URL and auth header.
- Tool can only call configured base URL.
- Admin/plugin permissions must declare outbound host.
- Agent cannot override base URL at tool-call time.

### P1: Xero Runtime Plugin

Implement after QuickBooks.

Required:

- OAuth/connect flow.
- Tenant-scoped encrypted tokens.
- Contacts, invoices, bills, payments, reports.

### P1: Sage Pastel Connector

Implement after Generic REST unless a direct Pastel API requirement is clarified.

Required:

- Base URL/API key setup.
- Company id setup.
- Read-only tools first.
- Mutating tools only after permissions/audit are clear.

### P1: Browser And Search Plugins

Reference OpenClaw/Hermes tool/plugin patterns.

Pulse targets:

```text
pulse/src/agent/tools/built-in/browser.ts or pulse/plugins/browser/*
pulse/src/agent/tools/built-in/web-search.ts or pulse/plugins/web-search/*
dashboard admin setup for backend/provider keys
agent tool-policy controls
```

Rules:

- Admin enables backend/provider.
- Tenant/agent policy controls access.
- No hardcoded search provider.
- Tool use audited.

### P1: Reflection/Consolidation Memory

Auto-memory exists. Remaining work:

- Background consolidation job.
- Review/approval UI for promoted memories or skill changes.
- Context summarization for old conversations.

Pulse targets:

```text
pulse/src/memory/*
pulse/src/cron/*
dashboard/src/app/dashboard/agents/[id]/memory/*
```

## What Not To Do

- Do not replace Pulse's plugin SDK with OpenClaw's wholesale.
- Do not add QuickBooks as a Python script-only workaround.
- Do not add credentials to `.env` as the only setup route.
- Do not expose tools globally after tenant disablement.
- Do not mark a connector "active" in UI until runtime tools and credential checks exist.
- Do not deploy from a dirty tree.

## Done Criteria For Each Ported Capability

Each integration/capability is done only when:

- It has a tenant/admin setup UI.
- It has enable/disable controls.
- Runtime respects enable/disable.
- Credentials are encrypted and tenant-scoped.
- Tools declare permissions.
- Tests cover happy path and disabled/missing credential path.
- `pulse` build passes.
- `dashboard` build passes.
- Handoff and checklist docs are updated.

## Coordination Checklist For Claude

Before starting:

```bash
cd /home/d0v1k/Projects/Pulse_AI
git status --short
git worktree list
git worktree add ../pulse-claude -b claude/<slice-name>
```

Then edit in `/home/d0v1k/Projects/pulse-claude`, not in main.

Before touching hot files, append a claim to:

```text
docs/CODEX_CLAUDE_HANDOFF.md
```

After finishing:

```bash
git status --short
cd pulse && npm test -- <focused tests>
cd pulse && npm run build
cd dashboard && npm run build
```

Then update:

```text
docs/CODEX_CLAUDE_HANDOFF.md
docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md
```
