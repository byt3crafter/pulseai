#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# push.sh — Stage, commit, and push to GitHub + optionally deploy to VPS
#
# Usage:
#   ./scripts/push.sh "commit message"              # Commit + push to GitHub
#   ./scripts/push.sh "commit message" --deploy      # Commit + push + deploy to VPS
#   ./scripts/push.sh "commit message" --deploy --dashboard  # Deploy dashboard only
#   ./scripts/push.sh --status                       # Show what would be committed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Parse args ───────────────────────────────────────────────────────────────

COMMIT_MSG=""
DO_DEPLOY=false
DEPLOY_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --deploy)     DO_DEPLOY=true ;;
        --dashboard)  DEPLOY_ARGS+=("--dashboard") ;;
        --gateway)    DEPLOY_ARGS+=("--gateway") ;;
        --no-migrate) DEPLOY_ARGS+=("--no-migrate") ;;
        --status)
            echo -e "${CYAN}Current status:${NC}"
            git status --short
            echo ""
            echo -e "${CYAN}Staged changes:${NC}"
            git diff --cached --stat 2>/dev/null || echo "  (nothing staged)"
            echo ""
            echo -e "${CYAN}Unstaged changes:${NC}"
            git diff --stat 2>/dev/null || echo "  (nothing unstaged)"
            exit 0
            ;;
        -h|--help)
            echo "Usage: $0 \"commit message\" [--deploy] [--dashboard|--gateway] [--no-migrate]"
            echo ""
            echo "  --deploy      After push, deploy to VPS"
            echo "  --dashboard   Only rebuild dashboard on VPS"
            echo "  --gateway     Only rebuild gateway on VPS"
            echo "  --no-migrate  Skip DB migration on deploy"
            echo "  --status      Show git status and exit"
            exit 0
            ;;
        -*)
            echo -e "${RED}Unknown flag: $arg${NC}"
            exit 1
            ;;
        *)
            if [[ -z "$COMMIT_MSG" ]]; then
                COMMIT_MSG="$arg"
            else
                echo -e "${RED}Unexpected argument: $arg${NC}"
                exit 1
            fi
            ;;
    esac
done

if [[ -z "$COMMIT_MSG" ]]; then
    echo -e "${RED}Commit message required.${NC}"
    echo "Usage: $0 \"your commit message\" [--deploy]"
    exit 1
fi

echo -e "${BOLD}${CYAN}━━━ Pulse AI Push ━━━${NC}"
echo ""

# ─── Pre-flight: type check ──────────────────────────────────────────────────

echo -e "${YELLOW}[1/4] Running type check...${NC}"
cd "$ROOT_DIR/dashboard" && npx tsc --noEmit 2>&1
cd "$ROOT_DIR"
echo -e "${GREEN}  Passed.${NC}"

# ─── Stage + Commit ──────────────────────────────────────────────────────────

echo -e "${YELLOW}[2/4] Staging and committing...${NC}"

# Stage all tracked changes + new files (excluding secrets)
git add -A
git reset -- '*.env' '*/.env' 2>/dev/null || true

CHANGES=$(git diff --cached --stat)
if [[ -z "$CHANGES" ]]; then
    echo -e "${YELLOW}  No changes to commit.${NC}"
else
    echo "$CHANGES" | head -10
    git commit -m "$COMMIT_MSG"
    echo -e "${GREEN}  Committed.${NC}"
fi

# ─── Push to GitHub ──────────────────────────────────────────────────────────

echo -e "${YELLOW}[3/4] Pushing to GitHub...${NC}"

# Ensure we have the branch set up
BRANCH=$(git branch --show-current)
git push -u origin "$BRANCH" 2>&1
echo -e "${GREEN}  Pushed to origin/$BRANCH${NC}"

# ─── Deploy to VPS ───────────────────────────────────────────────────────────

if [[ "$DO_DEPLOY" == true ]]; then
    echo -e "${YELLOW}[4/4] Deploying to VPS...${NC}"
    bash "$SCRIPT_DIR/deploy.sh" "${DEPLOY_ARGS[@]}" 2>&1
else
    echo -e "${YELLOW}[4/4] Skipping deploy (use --deploy to deploy)${NC}"
fi

echo ""
echo -e "${BOLD}${GREEN}Done!${NC}"
