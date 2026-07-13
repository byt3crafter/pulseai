Pulse AI runs as four containers — a Postgres database, a Redis instance, the Fastify gateway (`pulse/`), and the Next.js dashboard (`dashboard/`) — behind whatever reverse proxy or firewall you already run. This page lists every environment variable the code actually reads, how to bring the stack up with Docker Compose, how migrations and releases work, and how the very first admin account and workspace get created.

## Environment variables — gateway (`pulse/`)

These come straight from the Zod schema in `pulse/src/config.ts`. The gateway refuses to boot if a required one is missing or malformed.

| Variable | Required | Format / notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (`postgres://user:pass@host:5432/db`). |
| `ENCRYPTION_KEY` | Yes | 64-character hex string (32 bytes) — the AES-256 key used to encrypt secrets at rest. **Must be identical on the gateway and the dashboard**; they decrypt each other's ciphertext. |
| `REDIS_URL` | In production | `redis://[:password@]host:6379`. Optional in development (the queue falls back to running jobs synchronously without it); the schema itself rejects a missing value when `NODE_ENV=production`. |
| `NODE_ENV` | No | `development` \| `production` \| `test`. Default `development`. |
| `PORT` | No | HTTP port the gateway listens on. Default `3000` (the Docker image overrides this to `8080`). |
| `LOG_LEVEL` | No | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`\|`silent`. Default `info`. |
| `ANTHROPIC_API_KEY` | No (but needed for agents to think) | Anthropic API key. See [AI providers](/docs/setup/providers) — tenants can also bring their own key. |
| `OPENAI_API_KEY` | No | OpenAI API key, same pattern as above. |
| `WEBHOOK_BASE_URL` | No | The gateway's own public base URL (e.g. `https://your-domain.example`), used to register Telegram webhooks. Without it, Telegram channels can't receive inbound messages in production. |
| `DASHBOARD_URL` | No | The dashboard's origin, so the gateway's OAuth callback proxy knows where to forward. Default `http://localhost:3001`. |
| `TELEGRAM_WEBHOOK_SECRET` | No | Shared secret Telegram echoes back on every webhook call (`secret_token`), checked before processing. |
| `WORKSPACE_BASE_DIR` | No | Directory each agent's on-disk workspace lives under, as `{WORKSPACE_BASE_DIR}/{tenantId}/{agentId}/`. Default `../data/workspaces`; the Docker image sets it to `/app/data/workspaces` (a named volume). |
| `GATEWAY_WS_ENABLED` | No | `true`/`false`. Turns on the gateway's WebSocket server. Default `false`. |
| `TRUSTED_PROXY_IPS` | No | Comma-separated CIDR list of proxies allowed to set the identity header below. Leave unset unless you're terminating TLS at a proxy that forwards a pre-authenticated identity. |
| `TRUSTED_PROXY_USER_HEADER` | No | Header name read for the trusted-proxy identity. Default `X-Forwarded-User`. |
| `BONJOUR_ENABLED` | No | `true`/`false`. mDNS advertisement used for local network discovery (desktop client pairing). Default `false`. |
| `PYTHON_SANDBOX_IMAGE` | No | Docker image tag used for the agent's ephemeral code-sandbox containers. Default `pulse-python-sandbox:latest` — built from `pulse/docker/python-sandbox/`. |

## Environment variables — dashboard (`dashboard/`)

The dashboard has its own, smaller Zod schema (`dashboard/src/config.ts`), plus a few variables NextAuth and the mailer read directly from `process.env`.

| Variable | Required | Format / notes |
|---|---|---|
| `DATABASE_URL` | Yes | Same database as the gateway. |
| `ENCRYPTION_KEY` | Yes | Same 64-char hex key as the gateway — shared. |
| `ANTHROPIC_API_KEY` | Yes | > The dashboard's config schema marks this **required**, and almost every server action imports it transitively through `dashboard/src/storage/db.ts`. In practice the dashboard container will refuse to start without it — even though the dashboard itself never calls Anthropic directly (only the gateway does). Set it, even if you're running BYOK (bring-your-own-key) tenants. |
| `NEXTAUTH_SECRET` | Strongly recommended | Secret NextAuth uses to encrypt the session JWT. If unset, `dashboard/src/auth.config.ts` falls back to `ENCRYPTION_KEY` — that works, but reusing your data-encryption key as a session secret is not a great habit for a real deployment. |
| `NEXTAUTH_URL` | In production | The dashboard's own public URL (e.g. `https://your-domain.example`). NextAuth needs this to build correct redirect/callback URLs. |
| `AUTH_TRUST_HOST` | Behind a reverse proxy | Set to `true` so NextAuth v5 trusts the `Host` header from your proxy instead of rejecting the request. Used in `docker-compose.prod.yml`. |
| `OPENAI_API_KEY` | No | Optional, same as the gateway. |
| `REDIS_URL` | No | Optional; the dashboard's schema doesn't require it even in production. |
| `WORKSPACE_BASE_DIR` | No | Used when the dashboard reads/writes an agent's knowledge files directly. Should match the gateway's value. |
| `WEBHOOK_BASE_URL` / `TELEGRAM_WEBHOOK_SECRET` | No | The dashboard also registers/rotates Telegram webhooks from Settings → Telegram, so it needs the same two values as the gateway. |

## Infrastructure-only variables (Docker Compose, not read by app code)

| Variable | Required | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | Password for the `pulseadmin` Postgres user. Has no default — Compose fails to start without it. |
| `REDIS_PASSWORD` | Yes | Redis `requirepass`. Same — no default. |
| `DOCKER_GID` | No | Host's `docker` group id (`getent group docker`), so the non-root gateway user can use the mounted Docker socket for the agent code sandbox (Docker-out-of-Docker). Defaults to `987` if unset — check that this actually matches your host before relying on the default. |

## Bringing the stack up with Docker Compose

The base `docker-compose.yml` builds all four services. Postgres and Redis are declared with `expose` (container-network only), **not** `ports` — nothing outside the Docker network can reach them directly, in either environment.

```bash
# Local development — docker-compose.override.yml is auto-loaded and
# additionally publishes Postgres (5432) and Redis (6379) to localhost
# so you can psql / redis-cli in from the host.
docker compose up -d --build
```

```bash
# Production — layer the prod override explicitly. It publishes the
# gateway on 8082 and the dashboard on 3003 (chosen to avoid clashing
# with other services on the same VPS), sets NEXTAUTH_URL to your real
# domain, and adds AUTH_TRUST_HOST=true. Postgres/Redis stay internal-only.
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

> Both compose files require a `.env` file next to them with `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, and `ANTHROPIC_API_KEY` — there are no built-in defaults for any of these.

## Database migrations

There are two separate migration mechanisms in this codebase — know which one you need:

1. **Schema migrations (Drizzle)** — for changes to `pulse/src/storage/schema.ts` (tables, columns, indexes). Generate SQL from the schema diff, then apply it:
   ```bash
   cd pulse
   npm run db:generate   # drizzle-kit generate
   npm run db:migrate    # drizzle-kit migrate
   ```
   `dashboard/src/storage/schema.ts` is a **copy**, not a symlink, of the same file — update both when you add a column, or the dashboard and gateway will disagree about the shape of a table.

2. **Versioned ad-hoc SQL (`scripts/migrations/*.sql`)** — one-off data/DDL migrations (seeding rows, backfills, index tweaks) that don't come from a schema diff. Tracked in `scripts/migrations/.applied` so each file runs exactly once per environment:
   ```bash
   ./scripts/db-migrate.sh              # run pending migrations on local AND vps
   ./scripts/db-migrate.sh --local      # local only
   ./scripts/db-migrate.sh --vps        # vps only
   ./scripts/db-migrate.sh path/to/file.sql   # force-run one file
   ```
   `scripts/deploy.sh` calls this automatically as part of a deploy (skip with `--no-migrate`).

## Release, deploy, rollback

Full write-up: `docs/VERSIONING.md`. In short:

```bash
./scripts/push.sh "feat: my change"        # typecheck + commit + push a feature branch
# ...merge to main...
./scripts/release.sh patch                 # bump VERSION, changelog, git tag vX.Y.Z
./scripts/deploy.sh --tag=vX.Y.Z           # rsync → npm ci → migrate → rebuild containers
./scripts/rollback.sh                      # revert to the previous tag (instant if the
                                            # Docker image is still cached on the VPS,
                                            # otherwise a full redeploy from that tag)
```

`deploy.sh` also prunes dangling Docker images/build cache before rebuilding — image builds were observed to fail silently when the VPS disk filled up mid-build while the old container kept serving traffic, which is worse than a loud failure.

## First boot: how the first admin account and workspace exist

There is no automatic seeding on container startup — nothing runs on first boot. Two manual steps, done once:

### 1. The first ADMIN account

`dashboard/src/seed-users.ts` inserts exactly one row into `users` with `role: "ADMIN"`. It is not wired to any `npm run` script or Docker entrypoint — run it by hand once the dashboard container can reach the database:

```bash
DATABASE_URL=postgres://... ENCRYPTION_KEY=... npx tsx dashboard/src/seed-users.ts
```

> **The seeded admin uses a fixed default email and password that are checked into the source.** Read them at the top of `dashboard/src/seed-users.ts` before you run it. Treat that account as compromised the moment your dashboard is reachable from the internet: **log in and change the password immediately**, or delete the row and create your own admin. The script exits early with "Root admin already exists" if the email is already taken, so it is safe to re-run.

`pulse/scripts/seed.ts` is a different, optional script that seeds a **demo tenant** ("Demo Business") for local testing — not an admin account, and only useful if you also set `TEST_TELEGRAM_BOT_TOKEN` / `TEST_YOUR_TELEGRAM_ID` in your env. Skip it for a real deployment.

### 2. The first workspace (tenant)

Once you can log in as the platform ADMIN, go to **Admin → Tenants → New Tenant**. Creating a tenant (`createTenantAction` in `dashboard/src/app/admin/tenants/actions.ts`):

- creates the `tenants` row and a zero-balance `tenant_balances` row,
- creates a default OAuth client (for CLI/API access),
- creates the first `TENANT`-role user for that workspace with a randomly generated 16-character temporary password and `mustChangePassword: true`,
- best-effort sends an invite email with a 7-day password-reset link — this depends on SMTP being configured under **Admin → Settings → Email**; if SMTP isn't set up yet, the email send fails silently (logged, not surfaced) and creation still succeeds,
- and returns the temporary password directly in the action's response so you can hand it to the customer yourself if the invite email never arrives.

Every tenant-create/delete/suspend action is written to the platform audit log — see [Security](/docs/security).
