#!/usr/bin/env bash
#
# fleet-update.sh — update Pulse across many client VPSs from pre-built registry
# images. No source builds on the box: it pulls the tagged image, runs pending
# migrations, restarts, health-checks the client's domain, and ROLLS BACK that
# client if the check fails. Processes clients one at a time and STOPS on the
# first failure so a bad release can't propagate across the fleet.
#
# Usage:
#   scripts/fleet-update.sh <version> [selector] [flags]
#
# Selector (default: all):
#   --only <name>         just this client (from fleet.hosts)
#   --group <group>       every client tagged with this group
#   --canary              shorthand for --group canary
#   --all                 every client (explicit)
#
# Flags:
#   --hosts <file>        inventory file (default: fleet.hosts)
#   --no-migrate          skip the migration step
#   --seed-migrations     mark all current migrations as applied WITHOUT running
#                         them (use once when onboarding an already-up-to-date box)
#   --continue-on-error   don't stop the fleet if one client fails
#   --dry-run             print what would happen, change nothing
#
# Examples:
#   scripts/fleet-update.sh v0.19.0 --canary        # your box first
#   scripts/fleet-update.sh v0.19.0 --group prod    # then the rest
#   scripts/fleet-update.sh v0.19.0 --only metcheck
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOSTS_FILE="$ROOT_DIR/fleet.hosts"
IMAGE_OWNER="${PULSE_IMAGE_OWNER:-byt3crafter}"
PG_CONTAINER="pulse-postgres"; PG_USER="pulseadmin"; PG_DB="pulse"
REGISTRY_OVERLAY="docker-compose.registry.yml"

C_G="\033[0;32m"; C_Y="\033[0;33m"; C_R="\033[0;31m"; C_B="\033[0;36m"; C_0="\033[0m"

VERSION=""; SELECT="all"; SELECT_VAL=""; DO_MIGRATE=1; SEED=0; CONTINUE=0; DRY=0
while [ $# -gt 0 ]; do
    case "$1" in
        --only)  SELECT="only";  SELECT_VAL="$2"; shift 2 ;;
        --group) SELECT="group"; SELECT_VAL="$2"; shift 2 ;;
        --canary) SELECT="group"; SELECT_VAL="canary"; shift ;;
        --all)   SELECT="all"; shift ;;
        --hosts) HOSTS_FILE="$2"; shift 2 ;;
        --no-migrate) DO_MIGRATE=0; shift ;;
        --seed-migrations) SEED=1; shift ;;
        --continue-on-error) CONTINUE=1; shift ;;
        --dry-run) DRY=1; shift ;;
        v*|[0-9]*) VERSION="$1"; shift ;;
        *) echo "Unknown arg: $1"; exit 2 ;;
    esac
done
[ -n "$VERSION" ] || { echo "Usage: fleet-update.sh <version> [selector] [flags]"; exit 2; }
[ -f "$HOSTS_FILE" ] || { echo "Inventory not found: $HOSTS_FILE"; exit 2; }
# Normalise to a bare version for the image tag (strip a leading v).
IMG_VER="${VERSION#v}"

# --- select target rows ------------------------------------------------------
mapfile -t ROWS < <(grep -vE '^\s*#|^\s*$' "$HOSTS_FILE")
TARGETS=()
for row in "${ROWS[@]}"; do
    IFS='|' read -r name host path override domain group <<< "$row"
    name="$(echo "$name" | xargs)"; group="$(echo "${group:-}" | xargs)"
    case "$SELECT" in
        only)  [ "$name" = "$SELECT_VAL" ] && TARGETS+=("$row") ;;
        group) [ "$group" = "$SELECT_VAL" ] && TARGETS+=("$row") ;;
        all)   TARGETS+=("$row") ;;
    esac
done
[ ${#TARGETS[@]} -gt 0 ] || { echo "No clients matched selector ($SELECT ${SELECT_VAL})."; exit 1; }

echo -e "${C_B}Fleet update → ${VERSION}${C_0}  (${#TARGETS[@]} client(s), image owner: ${IMAGE_OWNER})"
for row in "${TARGETS[@]}"; do IFS='|' read -r n _ _ _ _ _ <<< "$row"; echo "  • $(echo "$n"|xargs)"; done
echo

# --- per-client update -------------------------------------------------------
FAILED=()
for row in "${TARGETS[@]}"; do
    IFS='|' read -r name host path override domain group <<< "$row"
    name="$(echo "$name"|xargs)"; host="$(echo "$host"|xargs)"; path="$(echo "$path"|xargs)"
    override="$(echo "$override"|xargs)"; domain="$(echo "$domain"|xargs)"
    COMPOSE="docker compose -f docker-compose.yml -f ${REGISTRY_OVERLAY} -f ${override}"
    echo -e "${C_Y}══ ${name} (${host}) ══${C_0}"

    if [ "$DRY" = 1 ]; then
        echo "  would: set PULSE_VERSION=${IMG_VER}; ${COMPOSE} pull && up -d; health-check https://${domain}"
        continue
    fi

    # Remember the current version so we can roll back.
    PREV="$(ssh "$host" "grep -E '^PULSE_VERSION=' ${path}/.env 2>/dev/null | tail -1 | cut -d= -f2" || true)"
    PREV="${PREV:-latest}"
    echo "  current: ${PREV} → ${IMG_VER}"

    # Ship migration files (tiny) so the box can apply pending schema changes.
    if [ "$DO_MIGRATE" = 1 ]; then
        rsync -az "$ROOT_DIR/scripts/migrations/" "$host:${path}/scripts/migrations/" 2>/dev/null || true
    fi

    # Point the box at the new image + owner, pull, (migrate), and restart.
    set +e
    ssh "$host" "bash -s" <<REMOTE
set -e
cd "${path}"
# Upsert PULSE_VERSION + PULSE_IMAGE_OWNER in .env
grep -q '^PULSE_IMAGE_OWNER=' .env 2>/dev/null && sed -i 's|^PULSE_IMAGE_OWNER=.*|PULSE_IMAGE_OWNER=${IMAGE_OWNER}|' .env || echo 'PULSE_IMAGE_OWNER=${IMAGE_OWNER}' >> .env
grep -q '^PULSE_VERSION=' .env 2>/dev/null && sed -i 's|^PULSE_VERSION=.*|PULSE_VERSION=${IMG_VER}|' .env || echo 'PULSE_VERSION=${IMG_VER}' >> .env

echo "  pulling images…"
${COMPOSE} pull pulse-gateway pulse-dashboard

if [ "${DO_MIGRATE}" = 1 ]; then
  docker exec -i ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -c "CREATE TABLE IF NOT EXISTS _fleet_migrations(filename text primary key, applied_at timestamptz default now());" >/dev/null
  for f in scripts/migrations/*.sql; do
    [ -f "\$f" ] || continue
    base=\$(basename "\$f")
    seen=\$(docker exec -i ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -tAc "select 1 from _fleet_migrations where filename='\$base'")
    if [ -z "\$seen" ]; then
      if [ "${SEED}" = 1 ]; then
        echo "  seed (mark applied): \$base"
      else
        echo "  migrate: \$base"
        docker exec -i ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -v ON_ERROR_STOP=1 < "\$f"
      fi
      docker exec -i ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -c "insert into _fleet_migrations(filename) values('\$base') on conflict do nothing;" >/dev/null
    fi
  done
fi

echo "  restarting…"
${COMPOSE} up -d pulse-gateway pulse-dashboard
REMOTE
    rc=$?
    set -e

    # Health check the client's real domain (gateway health via the proxy, then the app).
    ok=0
    if [ $rc -eq 0 ]; then
        for i in $(seq 1 12); do
            code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://${domain}/dashboard" || echo 000)"
            case "$code" in 2*|3*) ok=1; break ;; esac
            sleep 5
        done
    fi

    if [ "$ok" = 1 ]; then
        echo -e "  ${C_G}✓ ${name} healthy on ${IMG_VER}${C_0}\n"
    else
        echo -e "  ${C_R}✗ ${name} unhealthy (rc=$rc) — rolling back to ${PREV}${C_0}"
        ssh "$host" "cd '${path}' && sed -i 's|^PULSE_VERSION=.*|PULSE_VERSION=${PREV}|' .env && ${COMPOSE} up -d pulse-gateway pulse-dashboard" || true
        FAILED+=("$name")
        [ "$CONTINUE" = 1 ] || { echo -e "${C_R}Stopping fleet update — fix the release before continuing.${C_0}"; break; }
    fi
done

echo
if [ ${#FAILED[@]} -eq 0 ]; then
    echo -e "${C_G}Fleet update complete → ${VERSION}${C_0}"
else
    echo -e "${C_R}Failed clients: ${FAILED[*]}${C_0}"; exit 1
fi
