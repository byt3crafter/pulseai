#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# enable-search.sh — Bring up the self-hosted web-search overlay (SearXNG +
# Firecrawl) and wire its secrets into .env.
#
# Idempotent: safe to re-run. Only generates a secret if it's missing from
# .env; never overwrites an existing value.
#
# Usage:
#   ./scripts/enable-search.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}━━━ Pulse Self-Hosted Web Search ━━━${NC}"
echo ""

# ─── 1. Ensure secrets exist in .env ─────────────────────────────────────────

touch "$ENV_FILE"

ensure_var() {
    local name="$1"
    local bytes="$2"

    if grep -q "^${name}=.\+" "$ENV_FILE" 2>/dev/null; then
        echo -e "  ${name} already set — leaving it alone."
        return
    fi
    # Drop any empty/placeholder line for this var before appending a real one.
    sed -i.bak "/^${name}=/d" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    echo "${name}=$(openssl rand -hex "$bytes")" >> "$ENV_FILE"
    echo -e "  ${GREEN}Generated ${name}.${NC}"
}

echo -e "${YELLOW}[1/3] Checking secrets in .env...${NC}"
ensure_var "SEARXNG_SECRET" 32
ensure_var "FIRECRAWL_BULL_AUTH_KEY" 32
ensure_var "FIRECRAWL_POSTGRES_PASSWORD" 16

# REDIS_PASSWORD must already exist — this overlay reuses the main stack's
# Redis, it doesn't run its own.
if ! grep -q "^REDIS_PASSWORD=.\+" "$ENV_FILE" 2>/dev/null; then
    echo -e "${RED}REDIS_PASSWORD is not set in .env — the base stack needs it before this overlay can start.${NC}"
    exit 1
fi

# ─── 2. Start the overlay ────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[2/3] Starting SearXNG + Firecrawl (internal-only, no ports exposed)...${NC}"
cd "$ROOT_DIR"
docker compose -f docker-compose.yml -f docker-compose.search.yml up -d \
    searxng firecrawl-playwright firecrawl-rabbitmq firecrawl-nuq-postgres firecrawl-api

# ─── 3. Health check ─────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[3/3] Waiting for services to come up...${NC}"
sleep 8

check_container() {
    local container="$1"
    local label="$2"
    if docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
        echo -e "  ${GREEN}${label}: running.${NC}"
    else
        echo -e "  ${RED}${label}: NOT running — check \`docker compose logs ${container}\`.${NC}"
    fi
}

check_container pulse-searxng "SearXNG"
check_container pulse-firecrawl-playwright "Firecrawl Playwright"
check_container pulse-firecrawl-rabbitmq "Firecrawl RabbitMQ"
check_container pulse-firecrawl-postgres "Firecrawl Postgres"
check_container pulse-firecrawl-api "Firecrawl API"

# These are internal-only (no host ports), so a plain curl from the host
# won't reach them — this checks reachability from inside the pulse-gateway
# container instead, which is how Pulse itself will call them.
if docker inspect pulse-gateway >/dev/null 2>&1; then
    echo ""
    echo -e "${YELLOW}Checking reachability from pulse-gateway...${NC}"
    if docker exec pulse-gateway node -e "fetch('http://searxng:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
        echo -e "  ${GREEN}searxng:8080 reachable from pulse-gateway.${NC}"
    else
        echo -e "  ${YELLOW}searxng:8080 not reachable yet from pulse-gateway (may still be starting).${NC}"
    fi
    if docker exec pulse-gateway node -e "fetch('http://firecrawl-api:3002/').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
        echo -e "  ${GREEN}firecrawl-api:3002 reachable from pulse-gateway.${NC}"
    else
        echo -e "  ${YELLOW}firecrawl-api:3002 not reachable yet from pulse-gateway (may still be starting).${NC}"
    fi
fi

echo ""
echo -e "${BOLD}${GREEN}Done.${NC} Next steps:"
echo "  1. In Admin → Web Search, set:"
echo "       SearXNG URL:   http://searxng:8080"
echo "       Firecrawl URL: http://firecrawl-api:3002"
echo "  2. Enable Web Search for the tenants/agents that should use it."
echo "  See docs/WEB_SEARCH_SELFHOST.md for troubleshooting."
