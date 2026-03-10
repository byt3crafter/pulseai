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
DEPLOY_TAG=""
DEPLOY_LATEST=false

for arg in "$@"; do
    case "$arg" in
        --dashboard)  REBUILD_TARGET="dashboard" ;;
        --gateway)    REBUILD_TARGET="gateway" ;;
        --sync-only)  REBUILD_TARGET="none" ;;
        --no-migrate) DO_MIGRATE=false ;;
        --tag=*)      DEPLOY_TAG="${arg#*=}" ;;
        --latest)     DEPLOY_LATEST=true ;;
        -h|--help)
            echo "Usage: $0 [--dashboard|--gateway|--sync-only] [--no-migrate] [--tag=vX.Y.Z] [--latest]"
            echo ""
            echo "  --tag=vX.Y.Z   Deploy a specific tagged version (default: latest tag)"
            echo "  --latest       Deploy HEAD instead of latest tag"
            exit 0
            ;;
        *) echo -e "${RED}Unknown argument: $arg${NC}"; exit 1 ;;
    esac
done

# ─── Resolve deploy version ─────────────────────────────────────────────────

if [[ "$DEPLOY_LATEST" == true ]]; then
    DEPLOY_VERSION="dev-$(git rev-parse --short HEAD)"
    echo -e "${YELLOW}Deploying HEAD (${DEPLOY_VERSION})${NC}"
elif [[ -n "$DEPLOY_TAG" ]]; then
    if ! git rev-parse "$DEPLOY_TAG" >/dev/null 2>&1; then
        echo -e "${RED}Tag '$DEPLOY_TAG' not found.${NC}"
        echo "Available tags:"
        git tag -l --sort=-v:refname | head -10
        exit 1
    fi
    DEPLOY_VERSION="${DEPLOY_TAG#v}"
    echo -e "${YELLOW}Deploying tag: ${DEPLOY_TAG}${NC}"
    # Checkout the tag for rsync
    ORIGINAL_REF=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)
    git stash --include-untracked -q 2>/dev/null || true
    git checkout "$DEPLOY_TAG" --quiet
    trap 'git checkout "$ORIGINAL_REF" --quiet 2>/dev/null; git stash pop -q 2>/dev/null || true' EXIT
else
    # Default: use VERSION file
    DEPLOY_VERSION=$(cat VERSION 2>/dev/null || echo "dev")
    echo -e "${YELLOW}Deploying version: ${DEPLOY_VERSION}${NC}"
fi

# ─── Pre-flight checks ───────────────────────────────────────────────────────

echo -e "${BOLD}${CYAN}━━━ Pulse AI Deploy ━━━${NC}"
echo ""

# Full validation before deploying
echo -e "${YELLOW}[1/5] Running pre-deploy checks...${NC}"
if ! bash "$SCRIPT_DIR/pre-deploy-check.sh"; then
    echo -e "${RED}Pre-deploy checks failed. Aborting deploy.${NC}"
    exit 1
fi
echo -e "${GREEN}  All checks passed.${NC}"

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
        ssh "$VPS_HOST" "cd $VPS_PROJECT && \
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build pulse-gateway pulse-dashboard && \
            docker tag pulse-ai-pulse-gateway:latest pulse-ai-pulse-gateway:${DEPLOY_VERSION} 2>/dev/null || true && \
            docker tag pulse-ai-pulse-dashboard:latest pulse-ai-pulse-dashboard:${DEPLOY_VERSION} 2>/dev/null || true" 2>&1
        ;;
    dashboard)
        ssh "$VPS_HOST" "cd $VPS_PROJECT && \
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build pulse-dashboard && \
            docker tag pulse-ai-pulse-dashboard:latest pulse-ai-pulse-dashboard:${DEPLOY_VERSION} 2>/dev/null || true" 2>&1
        ;;
    gateway)
        ssh "$VPS_HOST" "cd $VPS_PROJECT && \
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build pulse-gateway && \
            docker tag pulse-ai-pulse-gateway:latest pulse-ai-pulse-gateway:${DEPLOY_VERSION} 2>/dev/null || true" 2>&1
        ;;
    none)
        echo -e "  Skipped (--sync-only)"
        ;;
esac

echo -e "${GREEN}  Containers rebuilt.${NC}"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}Deploy complete! (${DEPLOY_VERSION})${NC}"
echo -e "  Dashboard: https://pulse.runstate.mu"
echo -e "  Gateway:   https://pulse.runstate.mu:8082"

# Quick health check
echo ""
echo -e "${CYAN}Container status:${NC}"
ssh "$VPS_HOST" "docker ps --filter name=pulse --format 'table {{.Names}}\t{{.Status}}'" 2>&1
