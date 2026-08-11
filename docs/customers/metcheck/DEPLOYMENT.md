# Metcheck — deployment runbook (bare metal → live)

Stand up a dedicated Pulse AI instance for Metcheck. Run top to bottom on the
client's VPS. Everything secret lives in the box's `.env` — never commit it.

> Prereqs: a VPS (2 vCPU / 4 GB+ recommended, Docker installable), a domain or
> subdomain pointed at the VPS IP, root/sudo SSH access.

## 1. Base box

```bash
# On the VPS
apt update && apt install -y docker.io docker-compose-plugin git ufw
systemctl enable --now docker
# Firewall: SSH + HTTP/HTTPS only. Postgres/Redis stay internal (never exposed).
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
getent group docker | cut -d: -f3   # note the DOCKER_GID for .env
```

## 2. Get the code (this branch)

```bash
git clone <repo-url> /opt/pulse-metcheck
cd /opt/pulse-metcheck
git checkout customer/metcheck
```

## 3. Secrets (`.env` in /opt/pulse-metcheck)

Generate strong, unique values — do NOT reuse Runstate's.

```bash
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)          # 64 hex chars = AES-256, shared by both services
ADMIN_API_KEY=$(openssl rand -hex 32)           # dashboard↔gateway (approvals)
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 16)
DOCKER_GID=<from step 1>
WEBHOOK_BASE_URL=https://<metcheck-domain>
NEXTAUTH_URL=https://<metcheck-domain>
ANTHROPIC_API_KEY=<client key or a placeholder; real keys are entered in the dashboard per tenant>
EOF
chmod 600 .env
```

> `ENCRYPTION_KEY` MUST stay constant forever — it decrypts every stored secret.
> Back it up somewhere safe and separate. Losing it = losing all stored creds.

## 4. HTTPS reverse proxy (Caddy — auto-certs)

The stack exposes dashboard :3000 and gateway :8080 internally. Front them with
Caddy for automatic TLS:

```
# /etc/caddy/Caddyfile
<metcheck-domain> {
    handle /api/gateway/* {
        uri strip_prefix /api/gateway
        reverse_proxy pulse-gateway:8080
    }
    handle /webhooks/*  { reverse_proxy pulse-gateway:8080 }
    handle /oauth/*     { reverse_proxy pulse-gateway:8080 }
    handle              { reverse_proxy pulse-dashboard:3000 }
}
```
(Run Caddy in the same docker network, or on the host proxying to published ports —
match whatever `docker-compose.prod.yml` publishes. Confirm the gateway public
paths the client needs: `/webhooks/telegram/*`, `/oauth/*`.)

## 5. Bring up the stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps            # all healthy?
```

## 6. Database migrations

```bash
# Apply every scripts/migrations/*.sql against the container's postgres.
for f in scripts/migrations/*.sql; do
  docker exec -i pulse-postgres psql -U pulseadmin -d pulse < "$f"
done
# (or use scripts/db-migrate.sh adapted to this host)
```

## 7. First admin — and immediately secure it

`dashboard/src/seed-users.ts` seeds one ADMIN with a CHECKED-IN default password.
Run it, then change the password on first login before exposing anything.

```bash
docker exec -it pulse-dashboard npx tsx dashboard/src/seed-users.ts
```
- [ ] Log in, change the admin password immediately (or delete + recreate the row).

## 8. Codex login (for Codex/gpt-5.5 agents)

Use **Metcheck's own ChatGPT account**, not the shared Runstate one.

```bash
docker exec -it pulse-gateway codex login
```
Auth persists in the `pulse-codex-home` volume.

## 9. Create the client tenant

Admin → Tenants → New Tenant. This now auto-seeds the default toolset. Then log
in as the tenant admin and connect integrations — see `INTEGRATIONS.md`.

## 10. Backups (do NOT skip for a real client)

```bash
# /etc/cron.d/pulse-backup  — nightly pg_dump, keep 14 days, ideally ship offsite
0 2 * * * root docker exec pulse-postgres pg_dump -U pulseadmin pulse | gzip > /opt/backups/pulse-$(date +\%F).sql.gz && find /opt/backups -name 'pulse-*.sql.gz' -mtime +14 -delete
```
Also back up `.env` (the ENCRYPTION_KEY) and the `pulse-workspace-data` +
`pulse-codex-home` volumes.

## 11. Uptime + self-heal

- `restart: always` is already set on the services.
- Add a watchdog cron that curls `https://<domain>` and the gateway `/health`,
  and `docker compose restart` on failure (mirror the Runstate watchdog).

Continue to `GO-LIVE-CHECKLIST.md` before letting the client rely on it.
