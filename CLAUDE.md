# Pulse AI — Agent & Coding Guide

This document is the single source of truth for working on the Pulse AI codebase. Follow these rules exactly. They override all defaults.

---

## Project Overview

Pulse AI is a multi-tenant AI agent platform with two codebases in one repo:

- **`pulse/`** — Backend API gateway (Fastify 5 + TypeScript + Node.js)
- **`dashboard/`** — Admin/tenant dashboard (Next.js 16 + React 19 + Tailwind CSS 4)

Both share the same PostgreSQL database via Drizzle ORM. The schema lives in `pulse/src/storage/schema.ts` and the dashboard symlinks to it.

---

## Quick Start

```bash
# Boot everything (API on :3000, Dashboard on :3001)
./start-dev.sh

# Or manually:
cd pulse && npm run dev          # Fastify API
cd dashboard && npx next dev -p 3001  # Next.js dashboard
```

**Required env vars** (in `pulse/.env`, shared by both):
- `DATABASE_URL` — Postgres connection string
- `ENCRYPTION_KEY` — 64-char hex string (AES-256 key, shared by both services)
- `ANTHROPIC_API_KEY` — Anthropic API key
- `NEXTAUTH_SECRET` — NextAuth session encryption (dashboard only)

---

## Architecture at a Glance

```
User → Telegram/API/WebChat
         ↓
  pulse/src/gateway/server.ts    (Fastify HTTP + WebSocket)
         ↓
  pulse/src/queue/               (BullMQ → Redis, or sync fallback)
         ↓
  pulse/src/agent/runtime.ts     (Core agent loop — LLM + tools)
         ↓
  pulse/src/agent/providers/     (Anthropic, OpenAI, CLI backend)
         ↓
  pulse/src/agent/tools/         (13 built-in tools + MCP + plugins)

Dashboard → Next.js App Router
         ↓
  Server Components → DB queries via Drizzle
  Server Actions → Mutations with auth guards
  Client Components → Interactive UI
```

---

## Critical Security Rules

**Every server action must be authenticated.** No exceptions.

### Tenant-side actions (`dashboard/src/app/dashboard/`)

```typescript
"use server";
import { requireTenant } from "../../../../../utils/tenant-auth";

export async function myAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId; // ALWAYS from session, NEVER from FormData

    // ... your logic using tenantId from session
}
```

**Rules:**
- `tenantId` must ALWAYS come from `requireTenant()`, never from `formData.get("tenantId")`
- For read functions called from server components, still add the check and verify passed `tenantId` matches session
- Return empty data (not errors) on auth failure for read functions: `return []` or `return {}`

### Admin-side actions (`dashboard/src/app/admin/`)

```typescript
"use server";
import { requireAdmin } from "../../../utils/admin-auth";

export async function myAdminAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    // ... admin logic
}
```

### Inline server actions in page.tsx files

Same rules apply. Add the auth check inside the `"use server"` block:

```typescript
async function saveSettings(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;
    // ...
}
```

### What NOT to do

```typescript
// BAD: tenantId from user-controlled input
const tenantId = formData.get("tenantId") as string;

// BAD: no auth check at all
export async function deleteData(formData: FormData) {
    await db.delete(table).where(...);
}

// BAD: leaking error internals to users
return { error: err.message };

// BAD: debug logging with PII
console.log("Login attempt for:", email);
```

---

## Dashboard Patterns

### File Organization (App Router)

```
app/dashboard/agents/[id]/schedules/
├── page.tsx          # Server component — fetches data, renders client component
├── actions.ts        # Server actions — mutations with auth guards
└── SchedulesClient.tsx  # Client component — interactive UI ("use client")
```

- **`page.tsx`** = Server component. Fetches data, passes to client component as props.
- **`actions.ts`** = Server actions. All mutations. Always `"use server"` at top. Always auth-guarded.
- **`*Client.tsx`** = Client component. `"use client"` directive. Handles interactivity, form submissions, state.

### Server Component Pattern

```typescript
// page.tsx
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../../storage/db";
import MyClient from "./MyClient";

export const dynamic = "force-dynamic";

export default async function MyPage() {
    // Build-time guard (prevents DB calls during next build)
    const isNextBuild = process.env.npm_lifecycle_event === "build"
        || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");

    const tenantId = (session.user as any).tenantId;
    const data = await db.query.myTable.findMany({
        where: eq(myTable.tenantId, tenantId),
    });

    return <MyClient data={data} tenantId={tenantId} />;
}
```

### Client Component Pattern

```typescript
// MyClient.tsx
"use client";

import { useTransition } from "react";
import { myAction } from "./actions";

export default function MyClient({ data, tenantId }: Props) {
    const [pending, startTransition] = useTransition();

    return (
        <form action={(formData) => startTransition(() => myAction(formData))}>
            {/* hidden fields for IDs — but NOT tenantId (derived from session) */}
            <input type="hidden" name="agentId" value={agentId} />
            <button type="submit" disabled={pending}>Save</button>
        </form>
    );
}
```

### Revalidation

After any mutation, call `revalidatePath()` to bust the Next.js cache:

```typescript
revalidatePath("/dashboard/agents/" + agentId + "/schedules");
```

---

## Backend Patterns (Pulse)

### Adding a Fastify Route

```typescript
// pulse/src/gateway/routes/my-route.ts
import { FastifyInstance } from "fastify";

export default async function myRoutes(server: FastifyInstance) {
    server.get("/api/my-endpoint", async (request, reply) => {
        // ...
        return { ok: true };
    });
}

// Register in pulse/src/gateway/server.ts:
server.register(myRoutes);
```

### Adding an Agent Tool

```typescript
// pulse/src/agent/tools/my-tool.ts
import { ToolContext } from "./registry.js";

export const myTool = {
    name: "my_tool",
    description: "Does something useful",
    input_schema: {
        type: "object" as const,
        properties: {
            query: { type: "string", description: "The query" },
        },
        required: ["query"],
    },
    async execute(input: { query: string }, context: ToolContext): Promise<string> {
        // Tool logic here
        return JSON.stringify({ result: "done" });
    },
};
```

Register in `pulse/src/agent/tools/registry.ts` by adding to the tools array.

### Adding a Database Table

1. Add the table definition in `pulse/src/storage/schema.ts`:

```typescript
export const myTable = pgTable("my_table", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});
```

2. Add relations if needed in the same file.

3. Generate and run migration:
```bash
cd pulse
npm run db:generate
npm run db:migrate
```

4. The dashboard accesses the same schema via symlink — no separate schema needed.

---

## Database Conventions

### Drizzle Query Patterns

```typescript
// Find one
const record = await db.query.users.findFirst({
    where: eq(users.email, email),
});

// Find many with ordering
const items = await db.query.scheduledJobs.findMany({
    where: eq(scheduledJobs.agentId, agentId),
    orderBy: [desc(scheduledJobs.createdAt)],
});

// Insert with upsert
await db.insert(globalSettings)
    .values({ id: "root", ...data })
    .onConflictDoUpdate({
        target: globalSettings.id,
        set: data,
    });

// Paginated query
const offset = page * pageSize;
const rows = await db.select().from(myTable)
    .where(eq(myTable.tenantId, tenantId))
    .orderBy(desc(myTable.createdAt))
    .limit(pageSize)
    .offset(offset);

const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(myTable)
    .where(eq(myTable.tenantId, tenantId));
const total = Number(countResult[0]?.count || 0);
```

### Tenant Isolation

Every user-facing table has a `tenantId` column. Always filter by it:

```typescript
// CORRECT
.where(eq(table.tenantId, tenantId))

// WRONG — returns data across all tenants
.where(eq(table.agentId, agentId))
```

---

## Encryption

All secrets at rest use AES-256-GCM with the shared `ENCRYPTION_KEY`:

```typescript
import { encrypt } from "../utils/crypto";

const encrypted = encrypt(plaintext);
// Format: "iv_hex:authTag_hex:ciphertext_hex"
```

- Credential values → `credentials.encryptedValue`
- Provider API keys → `tenantProviderKeys.encryptedApiKey`
- OAuth tokens → `tenantProviderKeys.oauthAccessTokenEnc`

Never store plaintext secrets. Never log decrypted values.

---

## Error Handling Rules

1. **Never expose `error.message` to users.** Return generic messages:
   ```typescript
   // GOOD
   return { success: false, message: "Failed to save settings." };

   // BAD
   return { success: false, message: error.message };
   ```

2. **Use `console.error` for server-side logging**, but sanitize:
   ```typescript
   // GOOD
   console.error("Failed to save settings:", error);

   // BAD — leaks PII
   console.log("Login failed for:", userEmail);
   ```

3. **Never use `console.log` in auth code.** It leaks emails, roles, and login outcomes.

4. **Client-side error boundaries** must show generic messages:
   ```typescript
   <p>An unexpected error occurred.</p>  // GOOD
   <p>{error.message}</p>               // BAD
   ```

---

## Styling

- **Framework:** Tailwind CSS 4 (utility-first)
- **Color palette:** Slate (neutral), Indigo (primary), Green (success), Yellow (warning), Red (danger)
- **Component pattern:** No component library — raw Tailwind classes
- **Icons:** `@heroicons/react` (24/outline variant preferred)

Standard card pattern:
```tsx
<div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Title</h2>
    </div>
    <div className="p-6">
        {/* Content */}
    </div>
</div>
```

---

## Auth System

- **Library:** NextAuth v5 (beta 30) with Credentials provider
- **Strategy:** JWT stored in httpOnly cookie
- **Roles:** `ADMIN` (system admin) and `TENANT` (workspace user)
- **Session fields:** `id`, `role`, `tenantId`, `mustChangePassword`
- **Password hashing:** bcryptjs (10 rounds)

### Middleware routing (`dashboard/src/middleware.ts`)

| Route | Access |
|-------|--------|
| `/` `/login` `/admin/login` | Public |
| `/api/auth/*` | Public (rate-limited POST) |
| `/dashboard/*` | TENANT role only |
| `/admin/*` | ADMIN role only |
| `/oauth/*` | Authenticated (any role) |

Rate limiting: 10 login attempts per minute per IP (in-memory sliding window).

---

## Docker & Deployment

```bash
# Production
docker compose up -d

# Required .env file (no defaults — will fail without it):
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
NEXTAUTH_SECRET=...
ENCRYPTION_KEY=...
ANTHROPIC_API_KEY=...
```

- Postgres and Redis are internal-only (`expose`, not `ports`)
- Redis requires password auth
- No hardcoded secrets in docker-compose.yml
- `NEXTAUTH_URL` must be set to the actual production domain
- Dashboard builds as `standalone` output for Docker

---

## Plugin System

Plugins live in `pulse/plugins/` and are discovered automatically:

```typescript
// pulse/plugins/my-plugin/index.ts
import { PluginManifest } from "../../src/plugins/sdk/types.js";

export default {
    name: "my-plugin",
    version: "1.0.0",
    description: "Does something",
    tools: [/* Tool definitions */],
    hooks: {
        "before:message": async (ctx) => { /* ... */ },
    },
} satisfies PluginManifest;
```

Plugin state is stored in `installedPlugins` and `tenantPluginConfigs` tables.

---

## Testing

```bash
cd pulse && npm test           # Run all tests (Vitest)
cd pulse && npm run test:watch # Watch mode
cd dashboard && npx next build # Build check (catches type + SSR errors)
cd dashboard && npx tsc --noEmit  # Type check only
```

---

## Key File Reference

| File | Purpose |
|------|---------|
| `pulse/src/index.ts` | Backend entry point |
| `pulse/src/config.ts` | Env validation (Zod) |
| `pulse/src/gateway/server.ts` | Fastify server setup |
| `pulse/src/agent/runtime.ts` | Core agent processing loop |
| `pulse/src/agent/tools/registry.ts` | Tool registry |
| `pulse/src/agent/providers/provider-manager.ts` | LLM provider routing |
| `pulse/src/storage/schema.ts` | Database schema (shared) |
| `pulse/drizzle.config.ts` | Migration config |
| `dashboard/src/auth.ts` | NextAuth config + Credentials provider |
| `dashboard/src/auth.config.ts` | JWT/session callbacks |
| `dashboard/src/middleware.ts` | Route protection + rate limiting |
| `dashboard/src/utils/admin-auth.ts` | `requireAdmin()` helper |
| `dashboard/src/utils/tenant-auth.ts` | `requireTenant()` helper |
| `dashboard/src/utils/crypto.ts` | AES-256-GCM encrypt/decrypt |
| `dashboard/src/utils/rate-limit.ts` | In-memory rate limiter |
| `dashboard/src/app/dashboard/settings/actions.ts` | Tenant settings mutations |
| `dashboard/src/app/admin/settings/actions.ts` | Admin settings mutations |
| `docker-compose.yml` | Production container orchestration |
| `start-dev.sh` | Development startup script |

---

## Do's and Don'ts

### Do
- Run `npx tsc --noEmit` before considering work done
- Add `requireTenant()` or `requireAdmin()` to every new server action
- Derive `tenantId` from session, never from user input
- Filter all DB queries by `tenantId` for tenant-facing features
- Use `revalidatePath()` after mutations
- Use `export const dynamic = "force-dynamic"` on pages that query the DB
- Add the build-time guard (`isNextBuild`) on dynamic pages
- Encrypt all secrets with `encrypt()` before storing
- Return generic error messages to users

### Don't
- Don't add `console.log` in auth code
- Don't expose `error.message` or stack traces to users
- Don't hardcode secrets in docker-compose or source code
- Don't use `formData.get("tenantId")` for authorization decisions
- Don't skip auth checks "because the page already checks"
- Don't expose Postgres or Redis ports in production
- Don't create new files unless necessary — prefer editing existing ones
- Don't add features, refactoring, or "improvements" beyond what was asked
