#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pre-deploy-check.sh — Gate script: blocks deploy if any check fails
#
# 5 checks, ALL must pass. Reports all failures (doesn't stop at first).
#
# Usage:
#   ./scripts/pre-deploy-check.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

FAILURES=0

echo -e "${BOLD}${CYAN}━━━ Pre-deploy Checks ━━━${NC}"
echo ""

# ─── 1. TypeScript — pulse/ ──────────────────────────────────────────────────

echo -e "${YELLOW}[1/5] TypeScript check — pulse/${NC}"
if (cd "$ROOT_DIR/pulse" && npx tsc --noEmit 2>&1); then
    echo -e "${GREEN}  Passed.${NC}"
else
    echo -e "${RED}  FAILED: pulse/ TypeScript errors.${NC}"
    FAILURES=$((FAILURES + 1))
fi

# ─── 2. TypeScript — dashboard/ ──────────────────────────────────────────────

echo -e "${YELLOW}[2/5] TypeScript check — dashboard/${NC}"
if (cd "$ROOT_DIR/dashboard" && npx tsc --noEmit 2>&1); then
    echo -e "${GREEN}  Passed.${NC}"
else
    echo -e "${RED}  FAILED: dashboard/ TypeScript errors.${NC}"
    FAILURES=$((FAILURES + 1))
fi

# ─── 3. Vitest suite ─────────────────────────────────────────────────────────

echo -e "${YELLOW}[3/5] Vitest test suite${NC}"
if (cd "$ROOT_DIR/pulse" && npx vitest run 2>&1); then
    echo -e "${GREEN}  Passed.${NC}"
else
    echo -e "${RED}  FAILED: Vitest tests failed.${NC}"
    FAILURES=$((FAILURES + 1))
fi

# ─── 4. No .env in staged changes ────────────────────────────────────────────

echo -e "${YELLOW}[4/5] Checking for .env in staged files${NC}"
STAGED_ENV=$(cd "$ROOT_DIR" && git diff --cached --name-only 2>/dev/null | grep -E '\.env$' || true)
if [[ -z "$STAGED_ENV" ]]; then
    echo -e "${GREEN}  Passed.${NC}"
else
    echo -e "${RED}  FAILED: .env file(s) staged for commit:${NC}"
    echo "$STAGED_ENV" | while read -r f; do echo -e "${RED}    - $f${NC}"; done
    FAILURES=$((FAILURES + 1))
fi

# ─── 5. Hardcoded secrets scan ────────────────────────────────────────────────

echo -e "${YELLOW}[5/5] Scanning for hardcoded secrets${NC}"
# Match real API keys (20+ chars after prefix), exclude placeholders and validation patterns
SECRET_HITS=$(cd "$ROOT_DIR" && git grep -rn --cached -E '(sk-ant-[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9]{30,}|AKIA[A-Z0-9]{16})' \
    -- '*.ts' '*.tsx' '*.js' '*.json' \
    ':!package-lock.json' ':!node_modules' ':!openclaw_ref' \
    2>/dev/null | grep -v 'node_modules' | grep -v '\.test\.' \
    | grep -v 'placeholder' | grep -v 'startsWith' | grep -v '\.\.\.["'"'"']' || true)
if [[ -z "$SECRET_HITS" ]]; then
    echo -e "${GREEN}  Passed.${NC}"
else
    echo -e "${RED}  FAILED: Possible hardcoded secrets found:${NC}"
    echo "$SECRET_HITS" | head -10 | while read -r line; do echo -e "${RED}    $line${NC}"; done
    FAILURES=$((FAILURES + 1))
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
if [[ $FAILURES -eq 0 ]]; then
    echo -e "${BOLD}${GREEN}All 5 checks passed. Safe to deploy.${NC}"
    exit 0
else
    echo -e "${BOLD}${RED}${FAILURES} check(s) failed. Deploy blocked.${NC}"
    exit 1
fi
