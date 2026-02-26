#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Push code to VPS and rebuild containers
#
# Usage:
#   ./scripts/deploy.sh              # Full deploy: sync + migrate + rebuild all
#   ./scripts/deploy.sh --dashboard  # Rebuild dashboard only
#   ./scripts/deploy.sh --gateway    # Rebuild gateway only
#   ./scripts/deploy.sh --sync-only  # Just rsync files, no rebuild
#   ./scripts/deploy.sh --no-migrate # Skip DB migration
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Config
VPS_HOST="pulse-vps"
VPS_PROJECT="/opt/pulse-ai"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Parse args ───────────────────────────────────────────────────────────────

REBUILD_TARGET="all"  # all | dashboard | gateway | none
DO_MIGRATE=true

for arg in "$@"; do
    case "$arg" in
        --dashboard)  REBUILD_TARGET="dashboard" ;;
        --gateway)    REBUILD_TARGET="gateway" ;;
        --sync-only)  REBUILD_TARGET="none" ;;
        --no-migrate) DO_MIGRATE=false ;;
        -h|--help)
            echo "Usage: $0 [--dashboard|--gateway|--sync-only] [--no-migrate]"
            exit 0
            ;;
        *) echo -e "${RED}Unknown argument: $arg${NC}"; exit 1 ;;
    esac
done

# ─── Pre-flight checks ───────────────────────────────────────────────────────

echo -e "${BOLD}${CYAN}━━━ Pulse AI Deploy ━━━${NC}"
echo ""

# Type check before deploying
echo -e "${YELLOW}[1/5] Running type check...${NC}"
cd "$ROOT_DIR/dashboard" && npx tsc --noEmit 2>&1
echo -e "${GREEN}  Type check passed.${NC}"

# ─── Sync files ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}[2/5] Syncing files to VPS...${NC}"
rsync -avz --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.env' \
    --exclude 'data/' \
    --exclude 'dist/' \
    --exclude 'scripts/migrations/.applied' \
    "$ROOT_DIR/" "$VPS_HOST:$VPS_PROJECT/" 2>&1 | tail -3
echo -e "${GREEN}  Files synced.${NC}"

# ─── Install dependencies on VPS ─────────────────────────────────────────────

echo -e "${YELLOW}[3/5] Installing dependencies on VPS...${NC}"
ssh "$VPS_HOST" "cd $VPS_PROJECT/pulse && npm ci --production 2>&1 | tail -2" 2>&1
echo -e "${GREEN}  Dependencies installed.${NC}"

# ─── Run DB migrations ───────────────────────────────────────────────────────

if [[ "$DO_MIGRATE" == true ]]; then
    echo -e "${YELLOW}[4/5] Running DB migrations on VPS...${NC}"
    bash "$SCRIPT_DIR/db-migrate.sh" --vps 2>&1
    echo -e "${GREEN}  Migrations done.${NC}"
else
    echo -e "${YELLOW}[4/5] Skipping DB migrations (--no-migrate)${NC}"
fi

# ─── Rebuild containers ──────────────────────────────────────────────────────

echo -e "${YELLOW}[5/5] Rebuilding containers...${NC}"

case "$REBUILD_TARGET" in
    all)
        ssh "$VPS_HOST" "cd $VPS_PROJECT && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build pulse-gateway pulse-dashboard" 2>&1
        ;;
    dashboard)
        ssh "$VPS_HOST" "cd $VPS_PROJECT && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build pulse-dashboard" 2>&1
        ;;
    gateway)
        ssh "$VPS_HOST" "cd $VPS_PROJECT && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build pulse-gateway" 2>&1
        ;;
    none)
        echo -e "  Skipped (--sync-only)"
        ;;
esac

echo -e "${GREEN}  Containers rebuilt.${NC}"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}Deploy complete!${NC}"
echo -e "  Dashboard: https://pulse.runstate.mu"
echo -e "  Gateway:   https://pulse.runstate.mu:8082"

# Quick health check
echo ""
echo -e "${CYAN}Container status:${NC}"
ssh "$VPS_HOST" "docker ps --filter name=pulse --format 'table {{.Names}}\t{{.Status}}'" 2>&1
