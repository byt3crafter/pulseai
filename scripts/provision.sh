#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# provision.sh — generate a dedicated Pulse deployment bundle for a new client.
#
# Produces clients/<slug>/ with fresh secrets, an env file, and an nginx vhost,
# ready to rsync to that client's own host (VPS/instance) and bring up. Each
# client = its own isolated stack (own DB, Redis, encryption key, domain) — the
# data-sovereignty model enterprise clients ask for.
#
# This script ONLY generates config. It never touches production or launches
# anything. Deploy steps are printed at the end (and in docs/ONBOARDING_RUNBOOK.md).
#
# Usage:
#   ./scripts/provision.sh <slug> <domain> ["Product Name"]
#   e.g. ./scripts/provision.sh acme pulse.acme.com "Acme Assistant"
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

SLUG="${1:-}"
DOMAIN="${2:-}"
PRODUCT="${3:-Pulse}"

if [[ -z "$SLUG" || -z "$DOMAIN" ]]; then
    echo "Usage: $0 <slug> <domain> [\"Product Name\"]"
    echo "  e.g. $0 acme pulse.acme.com \"Acme Assistant\""
    exit 1
fi
if [[ ! "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
    echo "Slug must be lowercase letters, numbers, hyphens only."
    exit 1
fi

OUT="$ROOT_DIR/clients/$SLUG"
if [[ -e "$OUT" ]]; then
    echo "clients/$SLUG already exists — refusing to overwrite. Delete it first if you're re-provisioning."
    exit 1
fi
mkdir -p "$OUT"

gen() { openssl rand -hex "$1"; }
ENC=$(gen 32)          # 64-hex AES-256 key
NEXTAUTH=$(gen 32)
PG=$(gen 16)
REDIS=$(gen 16)
TG=$(gen 16)

cat > "$OUT/.env" <<EOF
# ── Pulse dedicated deployment — ${PRODUCT} (${SLUG}) ──
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ). Keep this file secret.
POSTGRES_PASSWORD=${PG}
REDIS_PASSWORD=${REDIS}
ENCRYPTION_KEY=${ENC}
NEXTAUTH_SECRET=${NEXTAUTH}
NEXTAUTH_URL=https://${DOMAIN}
WEBHOOK_BASE_URL=https://${DOMAIN}
TELEGRAM_WEBHOOK_SECRET=${TG}

# Fill in ONE of these billing models:
#  • Self-hosted (client uses their own key): set ANTHROPIC_API_KEY and set
#    billing mode = "unlimited" in Admin → Settings after first login.
#  • Platform-billed: leave blank; configure keys + credits in the admin console.
ANTHROPIC_API_KEY=

# Branding (also editable in Admin → Settings → Branding after launch)
PLATFORM_NAME=${PRODUCT}
EOF
chmod 600 "$OUT/.env"

cat > "$OUT/nginx.conf" <<EOF
# nginx vhost for ${DOMAIN} — place in /etc/nginx/sites-available and symlink,
# then run: certbot --nginx -d ${DOMAIN}
server {
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location /api/gateway/ {
        proxy_pass http://127.0.0.1:8082/;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    listen 80;
}
EOF

cat <<EOF

✅ Generated dedicated deployment bundle: clients/${SLUG}/
   • .env          fresh secrets (unique encryption key, DB/Redis passwords, domain)
   • nginx.conf    vhost for ${DOMAIN}

Next steps (see docs/ONBOARDING_RUNBOOK.md for detail):
  1. Provision the client's host (small VPS) and point ${DOMAIN} at it (DNS A record).
  2. Copy the repo + clients/${SLUG}/.env to the host as its .env.
  3. On the host:  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  4. Run migrations:  bash scripts/db-migrate.sh --local
  5. Seed the client's admin user (see runbook), then log in at https://${DOMAIN}/admin/login
  6. In Admin → Settings: set Branding (product name/accent) and Billing mode
     (unlimited if they use their own AI key).
  7. Install nginx.conf + TLS (certbot).

Nothing was deployed. This only created local config.
EOF
