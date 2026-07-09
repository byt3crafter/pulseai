# Business Integration Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pulse tenants a setup, enable, and disable surface for business integrations, starting with real ERPNext support and setup-visible QuickBooks/Xero/Pastel/Generic REST entries.

**Architecture:** Use Pulse's existing plugin system as the runtime boundary. Add a dashboard catalog that describes available business integrations, and make tenant plugin enablement affect runtime tool exposure instead of only dashboard display.

**Tech Stack:** TypeScript, Fastify plugin runtime, Drizzle ORM, Next.js 16 App Router, React 19, Vitest.

## Global Constraints

- Do not hardcode credential values, tenant ids, provider ids, or integration endpoints.
- Every integration must have dashboard setup and enable/disable UI.
- Runtime availability must be honest: setup-visible entries without plugins must be marked unavailable.
- Tenant plugin disablement must prevent plugin tools from being injected for that tenant.
- Use Git worktree isolation for Codex/Claude coordination.
- Update `docs/CODEX_CLAUDE_HANDOFF.md` and `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md` after the slice.

---

## File Structure

- Create: `pulse/src/plugins/tenant-access.ts`
  - Pure/default tenant plugin enablement logic plus DB-backed helper.
- Test: `pulse/src/__tests__/plugin-tenant-access.test.ts`
  - Verifies default enablement, explicit disablement, and missing plugin behavior.
- Modify: `pulse/src/plugins/manager.ts`
  - Store plugin tools by plugin name and expose tenant-filtered tools.
- Modify: `pulse/src/agent/tools/registry.ts`
  - Request tenant-filtered plugin tools.
- Modify: `pulse/plugins/erpnext/index.ts`
  - Prevent ERPNext prompt context injection when the tenant disabled the plugin.
- Create: `dashboard/src/utils/business-integrations.ts`
  - Catalog entries for ERPNext, QuickBooks, Xero, Pastel, and Generic REST.
- Modify: `dashboard/src/app/dashboard/settings/plugins/page.tsx`
  - Build catalog-backed integration rows, save credentials, and toggle tenant enablement.
- Modify: `dashboard/src/app/dashboard/settings/plugins/TenantPluginsClient.tsx`
  - Render setup, enable/disable controls, runtime status, and credential forms.
- Modify: `docs/CODEX_CLAUDE_HANDOFF.md`
  - Record files, checks, and remaining limitations.
- Modify: `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md`
  - Mark integration catalog foundation done and QuickBooks runtime still missing.

## Task 1: Tenant Plugin Runtime Gating

**Files:**
- Create: `pulse/src/plugins/tenant-access.ts`
- Test: `pulse/src/__tests__/plugin-tenant-access.test.ts`
- Modify: `pulse/src/plugins/manager.ts`
- Modify: `pulse/src/agent/tools/registry.ts`
- Modify: `pulse/plugins/erpnext/index.ts`

**Interfaces:**
- Produces: `resolveTenantPluginEnabled(plugin, override): boolean`
- Produces: `isPluginEnabledForTenant(pluginName: string, tenantId: string): Promise<boolean>`
- Produces: `PluginManager.getPluginToolsForTenant(tenantId: string): Promise<Tool[]>`

- [x] **Step 1: Write failing unit tests**

Run: `cd pulse && npm test -- src/__tests__/plugin-tenant-access.test.ts`

Expected: fail because `tenant-access.ts` does not exist.

- [x] **Step 2: Implement tenant access helper**

The helper returns true when a globally enabled plugin has no tenant override, false when globally disabled, false when tenant override is disabled, and false for missing plugin.

- [x] **Step 3: Wire plugin tools through tenant filtering**

`ToolRegistry.getEnabledTools()` must call `pluginManager.getPluginToolsForTenant(tenantId)` instead of `getPluginTools()`.

- [x] **Step 4: Guard ERPNext prompt injection**

ERPNext's `before-prompt-build` hook must return null when `isPluginEnabledForTenant("erpnext", ctx.tenantId)` is false.

- [x] **Step 5: Run backend tests/build**

Run:
- `cd pulse && npm test -- src/__tests__/plugin-tenant-access.test.ts src/__tests__/plugin-loading.test.ts`
- `cd pulse && npm run build`

## Task 2: Tenant Integration Catalog UI

**Files:**
- Create: `dashboard/src/utils/business-integrations.ts`
- Modify: `dashboard/src/app/dashboard/settings/plugins/page.tsx`
- Modify: `dashboard/src/app/dashboard/settings/plugins/TenantPluginsClient.tsx`

**Interfaces:**
- Produces: catalog entries with `id`, `pluginName`, `name`, `category`, `runtimeStatus`, `credentialSchema`, and `setupNotes`.
- Produces: tenant action `toggleTenantPluginEnabled(formData: FormData): Promise<void>`.

- [x] **Step 1: Add catalog definitions**

Define ERPNext as `runtimeStatus: "available"` when the plugin is installed, and QuickBooks/Xero/Pastel/Generic REST as setup-visible but runtime unavailable until their plugins exist.

- [x] **Step 2: Add tenant toggle action**

Use `requireTenant("tenant.settings.write")`; write only the authenticated tenant id, never a tenant id from the form.

- [x] **Step 3: Render integration rows**

Each row must show setup status, runtime availability, enable/disable toggle where runtime exists, and credential setup form where credentials are declared.

- [x] **Step 4: Run dashboard build**

Run: `cd dashboard && npm run build`

## Task 3: Documentation And Handoff

**Files:**
- Modify: `docs/CODEX_CLAUDE_HANDOFF.md`
- Modify: `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md`

**Interfaces:**
- Produces: Claude-visible completion record and remaining integration gaps.

- [x] **Step 1: Document what shipped**
- [x] **Step 2: Document what is intentionally setup-only**
- [x] **Step 3: Stage the slice for review**

Run:
- `git status --short`
- `git diff --stat`

## Self-Review

Spec coverage:
- ERPNext setup and enable/disable are covered by Tasks 1 and 2.
- QuickBooks and other important business integrations are setup-visible in Task 2, with runtime marked missing until plugins are implemented.
- No external code is ported wholesale; Pulse-native plugin/catalog boundaries are used.

Placeholder scan:
- No placeholders are used for this slice. Future runtime plugins are explicitly marked unavailable, not hidden.

Type consistency:
- The runtime helper returns booleans; dashboard catalog rows use string runtime statuses and do not affect backend tool injection directly.
