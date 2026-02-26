#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# db-migrate.sh — Run SQL migration files against local and/or VPS databases
#
# Usage:
#   ./scripts/db-migrate.sh                    # Run pending migrations on both local + VPS
#   ./scripts/db-migrate.sh --local            # Local only
#   ./scripts/db-migrate.sh --vps              # VPS only
#   ./scripts/db-migrate.sh path/to/file.sql   # Run a specific file
#
# Migration files go in: scripts/migrations/
# Naming convention:     NNNN_description.sql  (e.g. 0001_add_onboarding.sql)
# Already-applied files are tracked in: scripts/migrations/.applied
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"
APPLIED_FILE="$MIGRATIONS_DIR/.applied"

# Config
LOCAL_CONTAINER="pulse-postgres"
LOCAL_DB="pulse"
LOCAL_USER="pulseadmin"

VPS_HOST="pulse-vps"
VPS_CONTAINER="pulse-postgres"
VPS_DB="pulse"
VPS_USER="pulseadmin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$MIGRATIONS_DIR"
touch "$APPLIED_FILE"

# ─── Helpers ──────────────────────────────────────────────────────────────────

run_local() {
    local sql_file="$1"
    echo -e "${CYAN}[LOCAL]${NC} Running $(basename "$sql_file")..."
    docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" < "$sql_file" 2>&1
    echo -e "${GREEN}[LOCAL]${NC} Done."
}

run_vps() {
    local sql_file="$1"
    echo -e "${CYAN}[VPS]${NC} Running $(basename "$sql_file")..."
    ssh "$VPS_HOST" "docker exec -i $VPS_CONTAINER psql -U $VPS_USER -d $VPS_DB" < "$sql_file" 2>&1
    echo -e "${GREEN}[VPS]${NC} Done."
}

mark_applied() {
    local name="$1"
    if ! grep -qxF "$name" "$APPLIED_FILE" 2>/dev/null; then
        echo "$name" >> "$APPLIED_FILE"
    fi
}

is_applied() {
    local name="$1"
    grep -qxF "$name" "$APPLIED_FILE" 2>/dev/null
}

# ─── Parse args ───────────────────────────────────────────────────────────────

TARGET="both"  # both | local | vps
SPECIFIC_FILE=""

for arg in "$@"; do
    case "$arg" in
        --local) TARGET="local" ;;
        --vps)   TARGET="vps" ;;
        *.sql)   SPECIFIC_FILE="$arg" ;;
        -h|--help)
            echo "Usage: $0 [--local|--vps] [file.sql]"
            echo ""
            echo "  --local       Run on local DB only"
            echo "  --vps         Run on VPS DB only"
            echo "  file.sql      Run a specific SQL file (skips pending check)"
            echo ""
            echo "Without args: runs all pending migrations from scripts/migrations/"
            exit 0
            ;;
        *) echo -e "${RED}Unknown argument: $arg${NC}"; exit 1 ;;
    esac
done

# ─── Run specific file ───────────────────────────────────────────────────────

if [[ -n "$SPECIFIC_FILE" ]]; then
    if [[ ! -f "$SPECIFIC_FILE" ]]; then
        echo -e "${RED}File not found: $SPECIFIC_FILE${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Running: $SPECIFIC_FILE${NC}"
    echo ""

    if [[ "$TARGET" == "both" || "$TARGET" == "local" ]]; then
        run_local "$SPECIFIC_FILE"
    fi
    if [[ "$TARGET" == "both" || "$TARGET" == "vps" ]]; then
        run_vps "$SPECIFIC_FILE"
    fi

    echo ""
    echo -e "${GREEN}Migration complete.${NC}"
    exit 0
fi

# ─── Run pending migrations ──────────────────────────────────────────────────

PENDING=()
for f in "$MIGRATIONS_DIR"/*.sql; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f")"
    if ! is_applied "$name"; then
        PENDING+=("$f")
    fi
done

if [[ ${#PENDING[@]} -eq 0 ]]; then
    echo -e "${GREEN}No pending migrations.${NC}"
    exit 0
fi

echo -e "${YELLOW}Found ${#PENDING[@]} pending migration(s):${NC}"
for f in "${PENDING[@]}"; do
    echo "  - $(basename "$f")"
done
echo ""

for f in "${PENDING[@]}"; do
    name="$(basename "$f")"
    echo -e "${YELLOW}━━━ $name ━━━${NC}"

    if [[ "$TARGET" == "both" || "$TARGET" == "local" ]]; then
        run_local "$f"
    fi
    if [[ "$TARGET" == "both" || "$TARGET" == "vps" ]]; then
        run_vps "$f"
    fi

    mark_applied "$name"
    echo ""
done

echo -e "${GREEN}All migrations applied.${NC}"
