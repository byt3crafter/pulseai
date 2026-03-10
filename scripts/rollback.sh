#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rollback.sh — Revert VPS to a previous version
#
# Usage:
#   ./scripts/rollback.sh              # Roll back to previous tag
#   ./scripts/rollback.sh v0.8.0       # Roll back to specific version
#   ./scripts/rollback.sh --list       # Show available versions
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Config
VPS_HOST="pulse-vps"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Parse args ──────────────────────────────────────────────────────────────

TARGET_TAG=""

case "${1:-}" in
    --list|-l)
        echo -e "${CYAN}Available versions (git tags):${NC}"
        git tag -l --sort=-v:refname | head -20
        echo ""
        echo -e "${CYAN}Docker images on VPS:${NC}"
        ssh "$VPS_HOST" "docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}' | grep pulse" 2>&1 || true
        exit 0
        ;;
    --help|-h)
        echo "Usage: $0 [version-tag]"
        echo "  $0              Roll back to previous tag"
        echo "  $0 v0.8.0       Roll back to specific version"
        echo "  $0 --list       Show available versions"
        exit 0
        ;;
    "")
        # Find the second-most-recent tag (previous version)
        CURRENT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
        if [[ -z "$CURRENT_TAG" ]]; then
            echo -e "${RED}No tags found. Cannot determine previous version.${NC}"
            exit 1
        fi
        TARGET_TAG=$(git describe --tags --abbrev=0 "${CURRENT_TAG}^" 2>/dev/null || echo "")
        if [[ -z "$TARGET_TAG" ]]; then
            echo -e "${RED}No previous tag found before ${CURRENT_TAG}.${NC}"
            exit 1
        fi
        ;;
    *)
        TARGET_TAG="$1"
        ;;
esac

# Validate tag exists
if ! git rev-parse "$TARGET_TAG" >/dev/null 2>&1; then
    echo -e "${RED}Tag '$TARGET_TAG' not found.${NC}"
    echo "Available tags:"
    git tag -l --sort=-v:refname | head -10
    exit 1
fi

TARGET_VERSION="${TARGET_TAG#v}"

echo -e "${BOLD}${CYAN}━━━ Pulse AI Rollback ━━━${NC}"
echo -e "  Rolling back to: ${YELLOW}${TARGET_TAG}${NC}"
echo ""

# ─── Try Docker image rollback first (fastest) ──────────────────────────────

echo -e "${YELLOW}[1/2] Checking for cached Docker images...${NC}"

GATEWAY_IMAGE_EXISTS=$(ssh "$VPS_HOST" "docker images -q pulse-ai-pulse-gateway:${TARGET_VERSION} 2>/dev/null" || echo "")
DASHBOARD_IMAGE_EXISTS=$(ssh "$VPS_HOST" "docker images -q pulse-ai-pulse-dashboard:${TARGET_VERSION} 2>/dev/null" || echo "")

if [[ -n "$GATEWAY_IMAGE_EXISTS" && -n "$DASHBOARD_IMAGE_EXISTS" ]]; then
    echo -e "${GREEN}  Found cached images for ${TARGET_VERSION}. Fast rollback!${NC}"

    echo -e "${YELLOW}[2/2] Swapping to cached images...${NC}"
    ssh "$VPS_HOST" "cd /opt/pulse-ai && \
        docker tag pulse-ai-pulse-gateway:${TARGET_VERSION} pulse-ai-pulse-gateway:latest && \
        docker tag pulse-ai-pulse-dashboard:${TARGET_VERSION} pulse-ai-pulse-dashboard:latest && \
        docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d pulse-gateway pulse-dashboard" 2>&1
else
    echo -e "${YELLOW}  No cached images. Full redeploy from tag...${NC}"

    echo -e "${YELLOW}[2/2] Deploying tag ${TARGET_TAG}...${NC}"
    bash "$SCRIPT_DIR/deploy.sh" --tag="$TARGET_TAG"
fi

echo ""
echo -e "${BOLD}${GREEN}Rollback to ${TARGET_TAG} complete!${NC}"
echo ""
echo -e "${CYAN}Container status:${NC}"
ssh "$VPS_HOST" "docker ps --filter name=pulse --format 'table {{.Names}}\t{{.Status}}'" 2>&1
