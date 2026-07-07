# Hermes OpenClaw Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Pulse AI toward Hermes Agent and OpenClaw parity without hardcoded setup, while preserving Pulse's multi-tenant SaaS architecture.

**Architecture:** Add missing capabilities as config-driven platform modules, plugins, and tools. Each integration must have a tenant/admin setup UI, scoped credentials, permission declarations, tests, and audit behavior before it is considered complete.

**Tech Stack:** Fastify 5, TypeScript, Drizzle ORM, PostgreSQL, BullMQ/Redis, Next.js 16 App Router, React 19, Tailwind CSS 4, Vitest.

## Global Constraints

- No hardcoded credentials, endpoints, tenant ids, channel ids, provider keys, or business-system assumptions.
- Every new channel, provider, tool, or plugin must be configurable from UI.
- Every server action must use the auth patterns in `CLAUDE.md`.
- Every new external-action surface must preserve tenant isolation and auditability.
- Write a failing test before production behavior changes.
- Update `docs/CODEX_CLAUDE_HANDOFF.md` and `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md` after each implementation slice.

---

## File Structure

- Modify: `pulse/src/channels/channel.interface.ts` to become the common channel adapter contract if the current contract is insufficient.
- Create: `pulse/src/channels/registry.ts` for adapter registration and lookup.
- Create: `pulse/src/channels/whatsapp/adapter.ts` for WhatsApp adapter implementation.
- Create: `pulse/src/channels/slack/adapter.ts` for Slack adapter implementation.
- Modify: `pulse/src/index.ts` to initialize adapters from database rows instead of only Telegram.
- Modify: `pulse/src/gateway/routes/webhooks.ts` to dispatch webhook events by channel type.
- Modify: `pulse/src/storage/schema.ts` only if the existing `channelConnections` table cannot store required config safely.
- Create/modify: `dashboard/src/app/dashboard/channels/*` for tenant channel setup UI.
- Create/modify: `dashboard/src/app/admin/settings/*` for platform-level defaults and safety settings.
- Create: `pulse/src/agent/tools/built-in/browser.ts` for browser tool registration after a backend abstraction exists.
- Create: `pulse/src/agent/tools/built-in/web-search.ts` for provider-backed search after provider config exists.
- Create: `pulse/src/learning/*` for the self-improvement loop after memory/session search is in place.
- Modify: `docs/CODEX_CLAUDE_HANDOFF.md` and `docs/HERMES_OPENCLAW_PARITY_CHECKLIST.md` after each task.

## Task 1: Channel Adapter Registry

**Files:**
- Test: `pulse/src/__tests__/channel-registry.test.ts`
- Create: `pulse/src/channels/registry.ts`
- Modify: `pulse/src/channels/channel.interface.ts`

**Interfaces:**
- Produces: `registerChannelAdapter(type: string, factory: ChannelAdapterFactory): void`
- Produces: `getChannelAdapterFactory(type: string): ChannelAdapterFactory | undefined`
- Produces: `listRegisteredChannelTypes(): string[]`

- [x] **Step 1: Write failing registry tests**

Create `pulse/src/__tests__/channel-registry.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import {
    clearChannelAdapterRegistryForTests,
    getChannelAdapterFactory,
    listRegisteredChannelTypes,
    registerChannelAdapter,
} from "../../src/channels/registry.js";

describe("channel adapter registry", () => {
    beforeEach(() => clearChannelAdapterRegistryForTests());

    it("registers and retrieves an adapter factory by channel type", () => {
        const factory = () => ({ channelType: "test" }) as any;

        registerChannelAdapter("test", factory);

        expect(getChannelAdapterFactory("test")).toBe(factory);
        expect(listRegisteredChannelTypes()).toEqual(["test"]);
    });

    it("normalizes channel types to lowercase", () => {
        const factory = () => ({ channelType: "slack" }) as any;

        registerChannelAdapter("Slack", factory);

        expect(getChannelAdapterFactory("slack")).toBe(factory);
        expect(getChannelAdapterFactory("SLACK")).toBe(factory);
        expect(listRegisteredChannelTypes()).toEqual(["slack"]);
    });

    it("rejects duplicate registrations", () => {
        const factory = () => ({ channelType: "test" }) as any;

        registerChannelAdapter("test", factory);

        expect(() => registerChannelAdapter("test", factory)).toThrow(/already registered/i);
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd pulse && npm test -- src/__tests__/channel-registry.test.ts`

Expected: FAIL because `src/channels/registry.ts` does not exist.

- [x] **Step 3: Implement minimal registry**

Create `pulse/src/channels/registry.ts`:

```typescript
import type { ChannelAdapter } from "./channel.interface.js";

export type ChannelAdapterFactory = () => ChannelAdapter;

const factories = new Map<string, ChannelAdapterFactory>();

function normalizeType(type: string): string {
    const normalized = type.trim().toLowerCase();
    if (!normalized) throw new Error("Channel type is required");
    return normalized;
}

export function registerChannelAdapter(type: string, factory: ChannelAdapterFactory): void {
    const key = normalizeType(type);
    if (factories.has(key)) {
        throw new Error(`Channel adapter already registered: ${key}`);
    }
    factories.set(key, factory);
}

export function getChannelAdapterFactory(type: string): ChannelAdapterFactory | undefined {
    return factories.get(normalizeType(type));
}

export function listRegisteredChannelTypes(): string[] {
    return Array.from(factories.keys()).sort();
}

export function clearChannelAdapterRegistryForTests(): void {
    factories.clear();
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd pulse && npm test -- src/__tests__/channel-registry.test.ts`

Expected: PASS.

## Task 2: Config-Driven Adapter Boot

**Files:**
- Test: `pulse/src/__tests__/channel-bootstrap.test.ts`
- Create: `pulse/src/channels/bootstrap.ts`
- Modify: `pulse/src/index.ts`

**Interfaces:**
- Consumes: `getChannelAdapterFactory(type: string)`
- Produces: `initializeChannelAdapters(connections, deps): Promise<Map<string, ChannelAdapter>>`

- [x] **Step 1: Write failing bootstrap tests**

Create tests that prove active `channelConnections` rows are grouped by `channelType`, unknown types are skipped with a warning, and no channel token is hardcoded.

- [x] **Step 2: Run test to verify it fails**

Run: `cd pulse && npm test -- src/__tests__/channel-bootstrap.test.ts`

Expected: FAIL because `src/channels/bootstrap.ts` does not exist.

- [x] **Step 3: Implement bootstrap helper**

Implement `initializeChannelAdapters` so `pulse/src/index.ts` no longer filters only Telegram inline.

- [x] **Step 4: Wire Telegram through the registry**

Register Telegram with `registerChannelAdapter("telegram", () => new TelegramAdapter())` and keep behavior unchanged.

- [x] **Step 5: Run tests**

Run: `cd pulse && npm test -- src/__tests__/channel-bootstrap.test.ts src/__tests__/telegram-commands.test.ts`

Expected: PASS.

## Task 3: Tenant Channel Setup UI Model

**Files:**
- Test: add focused tests where server actions already have test support, or document manual verification if the dashboard has no action test harness yet.
- Modify: `dashboard/src/app/dashboard/channels/page.tsx`
- Create/modify: `dashboard/src/app/dashboard/channels/actions.ts`

**Interfaces:**
- Consumes: existing `channelConnections` table.
- Produces: server actions to create/update/disable channel connections with `requireTenant()`.

- [ ] **Step 1: Add or update server action tests**

Test tenant auth, no `tenantId` from form data, and safe config persistence.

- [x] **Step 2: Implement tenant UI for channel connections**

Add setup forms for Telegram, WhatsApp, Slack, Discord, and WebChat. For unimplemented adapters, show configuration as disabled or pending instead of claiming runtime support.

- [x] **Step 3: Run dashboard checks**

Run: `cd dashboard && npm run lint`

Actual: `cd dashboard && npm run build` passed. `cd dashboard && npm run lint` is blocked by existing repo-wide lint debt in settings/admin files; record details in `docs/CODEX_CLAUDE_HANDOFF.md`.

## Task 4: WhatsApp Adapter

**Files:**
- Test: `pulse/src/__tests__/whatsapp-adapter.test.ts`
- Create: `pulse/src/channels/whatsapp/adapter.ts`
- Modify: `pulse/src/gateway/routes/webhooks.ts`
- Modify: `dashboard/src/app/dashboard/channels/page.tsx`

**Interfaces:**
- Consumes: channel adapter registry and channel setup UI.
- Produces: `WhatsAppAdapter` implementing `ChannelAdapter`.

- [ ] **Step 1: Write failing tests for webhook validation and inbound conversion**
- [ ] **Step 2: Implement adapter using config from `channelConnections.channelConfig`**
- [ ] **Step 3: Add UI fields for WhatsApp Business API token, phone id, app secret, webhook verify token**
- [ ] **Step 4: Run backend and dashboard checks**

## Task 5: Slack Adapter

**Files:**
- Test: `pulse/src/__tests__/slack-adapter.test.ts`
- Create: `pulse/src/channels/slack/adapter.ts`
- Modify: `pulse/src/gateway/routes/webhooks.ts`
- Modify: `dashboard/src/app/dashboard/channels/page.tsx`

**Interfaces:**
- Consumes: channel adapter registry and channel setup UI.
- Produces: `SlackAdapter` implementing `ChannelAdapter`.

- [ ] **Step 1: Write failing tests for Slack signing-secret validation**
- [ ] **Step 2: Implement adapter using tenant-provided bot token and signing secret**
- [ ] **Step 3: Add UI fields and connection health display**
- [ ] **Step 4: Run backend and dashboard checks**

## Task 6: Browser And Web Search Tools

**Files:**
- Test: `pulse/src/__tests__/browser-tool-config.test.ts`
- Test: `pulse/src/__tests__/web-search-tool.test.ts`
- Create: `pulse/src/agent/tools/built-in/browser.ts`
- Create: `pulse/src/agent/tools/built-in/web-search.ts`
- Modify: `pulse/src/agent/tools/registry.ts`
- Modify: `dashboard/src/app/admin/settings/page.tsx`
- Modify: `dashboard/src/app/dashboard/agents/[id]/ToolPolicyEditor.tsx`

**Interfaces:**
- Produces: admin-configured browser/search backends.
- Produces: tenant/agent policy controls for browser/search tools.

- [ ] **Step 1: Write failing config and tool-policy tests**
- [ ] **Step 2: Implement backend abstractions without provider hardcoding**
- [ ] **Step 3: Add admin setup UI and per-agent enablement**
- [ ] **Step 4: Run tests and builds**

## Task 7: Self-Improvement Loop With Approval

**Files:**
- Test: `pulse/src/__tests__/learning-review.test.ts`
- Create: `pulse/src/learning/review-service.ts`
- Create: `pulse/src/learning/skill-proposals.ts`
- Create/modify: dashboard approval pages for skill proposals.

**Interfaces:**
- Consumes: conversations, messages, memory, skills.
- Produces: auditable skill proposals that require human approval before changing agent skills.

- [ ] **Step 1: Write failing tests for proposal creation from session summaries**
- [ ] **Step 2: Implement read-only proposal generation**
- [ ] **Step 3: Add approval UI**
- [ ] **Step 4: Only after approval, write skill changes**

## Task 8: Gateway Event Expansion

**Files:**
- Test: `pulse/src/__tests__/ws-events.test.ts`
- Modify: `pulse/src/gateway/ws/ws-events.ts`
- Modify: `pulse/src/gateway/ws/ws-server.ts`
- Modify: desktop app if event consumption is added.

**Interfaces:**
- Produces typed WebSocket events for app, widget, and desktop clients.

- [ ] **Step 1: Write failing tests for event shape and tenant scoping**
- [ ] **Step 2: Implement typed event helpers**
- [ ] **Step 3: Emit events from message/job/tool lifecycle points**
- [ ] **Step 4: Run tests**

## Self-Review

Spec coverage:

- Missing channels covered by Tasks 1-5.
- Browser/search covered by Task 6.
- Self-improving loop covered by Task 7.
- Gateway maturity covered by Task 8.
- Provider catalog, voice/media/canvas, mobile, and advanced runtime backends remain follow-up plans because they are large independent subsystems.

Placeholder scan:

- Task 1 is fully executable.
- Later tasks intentionally define slice boundaries and must be expanded into task-specific TDD plans before implementation.

Type consistency:

- The first produced interface is `ChannelAdapterFactory`; later channel tasks consume it.
