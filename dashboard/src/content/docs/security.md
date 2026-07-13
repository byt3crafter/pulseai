This page covers what Pulse actually does to protect your data: encryption at rest, the auth model, granular permissions, the audit trail, SSO, two-factor auth, tenant isolation, and the SSRF guards on tools that make outbound requests. Every claim below is backed by the code paths named — nothing here is aspirational.

## Encryption at rest

Secrets are encrypted with **AES-256-GCM** (`dashboard/src/utils/crypto.ts` and `pulse/src/utils/crypto.ts` — identical implementations, kept in sync by hand). The stored format is a single string:

```
<iv-hex>:<authTag-hex>:<ciphertext-hex>
```

12-byte random IV, 16-byte GCM auth tag, both hex-encoded and concatenated with the ciphertext. The key is your `ENCRYPTION_KEY` env var — a 64-character hex string decoded to 32 raw bytes. **It must be identical on the gateway and the dashboard**, since either service may need to decrypt something the other encrypted.

What's actually encrypted with it today:

- Tenant BYOK provider keys and OAuth tokens (`tenant_provider_keys.encrypted_api_key`, `oauth_access_token_enc`, `oauth_refresh_token_enc`, `oauth_client_secret_enc`)
- Per-agent/tenant credentials used by custom tools and plugins (`credentials.encrypted_value`, `credentials.oauth_encrypted_refresh_token`)
- SMTP/IMAP passwords for an agent's email connection (`channel_connections.channel_config.smtp.encryptedPassword` / `.imap.encryptedPassword`)
- SSH secrets (private key or password) for [Servers](/docs/tools/servers) (`servers.encrypted_secret`)
- A user's TOTP secret for [2FA](#two-factor-auth-2fa) (`users.two_factor_secret`)
- The SSO client secret, when SSO is configured (`global_settings.config.sso.clientSecretEnc`)

Two-factor backup/recovery codes are **not** encrypted — they're one-way SHA-256 hashed (`hashBackupCode` in `dashboard/src/utils/totp.ts`), the same way a password would be, since they only ever need to be checked, never displayed again.

## Authentication

- **Library:** NextAuth v5 (`next-auth@5.0.0-beta.30`) with a Credentials provider (`dashboard/src/auth.ts`).
- **Session:** JWT, stored in an httpOnly cookie (`session: { strategy: "jwt" }` in `dashboard/src/auth.config.ts`). No server-side session store.
- **Passwords:** hashed with bcrypt, 10 rounds (`bcryptjs`).
- **Planes:** every user has a `role` — `ADMIN` (platform) or `TENANT` (workspace). The login form enforces this: a `TENANT`-role account can't authenticate on the admin login page and vice versa (checked inside `authorize()`, not just in the UI).
- **Login rate limiting:** an in-memory sliding window in `dashboard/src/utils/rate-limit.ts` — 10 attempts per minute per source IP, enforced in `middleware.ts` for `POST /api/auth/*`. It's in-process memory, so it resets on a container restart and doesn't share state across multiple dashboard replicas — fine for a single instance, not a substitute for a proper WAF if you scale out.

### Route protection (`dashboard/src/middleware.ts`)

| Route | Access |
|---|---|
| `/`, `/login`, `/admin/login`, `/forgot`, `/reset*` | Public |
| `/docs`, `/docs/*` | Public (you need to read the setup guide before you have an account) |
| `/api/auth/*`, `/api/sso-status` | Public, rate-limited on POST |
| `/oauth/*` | Requires login (any role); redirects to `/login` with the OAuth URL preserved as the callback |
| `/onboarding` | Requires login; enforced for non-admin users whose `onboardingComplete` is still `false` |
| `/dashboard/*` | `TENANT` role (an `ADMIN` can also reach it) |
| `/admin/*` | `ADMIN` role only — a `TENANT` hitting `/admin/*` is redirected to `/dashboard`, not shown a 403 |

## Granular RBAC (`accessRole`)

`role` picks the plane (platform vs. tenant); a second field, `accessRole`, picks a granular role **within** that plane (`dashboard/src/utils/permissions.ts`). Existing users default to `owner` (full access), so this layer only changes behavior once you explicitly assign someone a narrower role.

| Plane | Roles | Notes |
|---|---|---|
| Platform | `owner`, `admin`, `support`, `auditor` | `admin` = everything except destructive deletes/billing; `support` = read + password resets; `auditor` = strictly read-only |
| Tenant | `owner`, `member`, `viewer` | `member` = configure/use agents, no member management/billing; `viewer` = read-only |

Every server action is expected to call `requireAdmin(permission)` or `requireTenant(permission)` (`dashboard/src/utils/admin-auth.ts` / `tenant-auth.ts`) and check `authorized` before doing anything. These resolve the session first via `auth()`, and fall back to manually decoding the `authjs.session-token` cookie if `auth()` returns null (a documented NextAuth v5 quirk in some server-action contexts) — either way, `tenantId` always comes from the verified session/token, never from a form field. `dashboard/src/utils/access.ts` (`currentAccess()`) exposes the same permission check for UI gating (hiding buttons a user can't use) — but that's presentation only; the server action re-checks independently.

## Audit log

Every sensitive admin action is written to `audit_logs` (`dashboard/src/utils/audit.ts` → `logAudit()`): actor id/email/role, action verb (e.g. `tenant.create`, `user.delete`), target type/id, a human-readable summary, arbitrary metadata, and the requester's IP (from `x-forwarded-for`/`x-real-ip`). Logging is **best-effort** — a failed audit write is caught and logged to stderr, never allowed to fail the action it's recording. Viewable at **Admin → Audit** (`dashboard/src/app/admin/audit/`), gated behind the `platform.audit.read` permission.

This is separate from two other, narrower trails: `exec_audit_log` (every agent code-sandbox execution decision — allowed/denied/sandboxed) and `server_exec_logs` (every `server_exec` attempt against a configured [Server](/docs/tools/servers), blocked or not).

## Single sign-on (OIDC)

Deployment-level SSO is configured under **Admin → Settings** and stored in `global_settings.config.sso` (`dashboard/src/utils/sso.ts`) — **inactive until an admin turns it on**, so plain email/password login is unaffected by default. When enabled:

- An OIDC provider is registered dynamically alongside Credentials (`dashboard/src/auth.ts`), scoped to `openid email profile`.
- An optional email-domain allowlist restricts who can sign in.
- Group claims from the IdP map to a Pulse `accessRole` via an admin-configured `groupRoleMap`, with a `defaultRole` fallback.
- First-time SSO sign-in **just-in-time provisions** a Pulse user (`provisionSsoUser`) — no separate invite step. The user's `passwordHash` is set to the literal string `"!sso"` (can never match a bcrypt comparison, so the credentials path is permanently closed for that account).
- SSO can be scoped to the platform plane (creates `ADMIN` users) or a single tenant (creates `TENANT` users for that tenant) — set per-configuration, not per-login.
- On every SSO login, the user's `accessRole` is re-synced from the IdP's current group membership — the IdP is the source of truth going forward, not whatever was assigned at first provisioning.

## Two-factor auth (2FA)

TOTP (RFC 6238) via `otplib`, managed at `/account/two-factor` and enforced inside the Credentials `authorize()` flow (`dashboard/src/utils/totp.ts`, `dashboard/src/auth.ts`):

- A ±1 time-step window tolerates minor clock drift.
- The secret is AES-encrypted before being stored on the user row; it's only decrypted at the moment of verification.
- 10 one-time backup/recovery codes are generated at enrollment, shown once, and stored as SHA-256 hashes. Using one consumes it (removed from the stored list) — it's a true one-time code, not a reusable PIN.
- If `twoFactorEnabled` is set, login fails without a valid 6-digit TOTP code **or** an unused backup code — there's no bypass path.

## Tenant isolation

Every tenant-facing table carries a `tenant_id` column, and `tenantId` is required to come from the verified session (`requireTenant()`/`requireAdmin()`), never from a form field the browser could tamper with — filtering a query by `agentId` alone instead of `tenantId` is treated as a bug, not a style choice, because it would leak rows across tenants. Reads called from server components follow the same rule and return empty data (`[]`/`{}`) rather than an error on an auth failure, so a failed check never leaks whether a resource exists.

## SSRF guards

Two tool surfaces make outbound HTTP requests to addresses a tenant configures, so both share the same hostname blocklist (`assertSafeUrl()` in `pulse/src/agent/tools/custom-tools.ts`, reused by the Playwright plugin's navigation guard):

- **[Custom Tools](/docs/tools/custom)** — blocks `localhost`/`.localhost`, `0.0.0.0`, `::1`, RFC 1918 private ranges (`10.*`, `192.168.*`, `172.16-31.*`), link-local (`169.254.*`, `fe80:`), unique-local IPv6 (`fc00:`/`fd*`), `.internal`, and the cloud metadata address `169.254.169.254` / `metadata.google.internal`. Only `http(s)` schemes are allowed at all.
- **Browser tools ([Plugins](/docs/tools/plugins) → Playwright)** — the same blocklist, applied to page navigation, with an explicit tenant-level opt-out for private-network access if you deliberately want an agent to reach an internal tool.

[Servers (SSH)](/docs/tools/servers) uses a different model on purpose: the host is an operator-entered, known address (not attacker-controlled input a tool substitutes into a URL), so instead of an SSRF blocklist it's gated by a per-server **safety mode** (`observe`/`safe`/`full`), a default-deny `allowedAgentIds` list (no agent can touch a server until explicitly granted), and an optional `approvalMode` that routes `server_exec` calls through the same [Approval gates](/docs/approvals) workflow as everything else.
