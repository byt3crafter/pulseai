#!/usr/bin/env bash
#
# Pulse AI uptime watchdog
# ------------------------
# Runs from cron every couple of minutes. For each Pulse app container it:
#   1. Restarts it if it is not running (this is the failure mode that took the
#      site down for ~7 weeks — a manual `docker stop` that never came back).
#   2. Restarts it if Docker reports its healthcheck as `unhealthy`.
#   3. Verifies the public URL end-to-end.
# Every action is logged, and (optionally) pushed to Telegram if a token is set.
#
# Alerting is opt-in: create /opt/pulse-ai/.watchdog.env with
#     WATCHDOG_TG_TOKEN=123456:abc...
#     WATCHDOG_TG_CHAT=<your chat id>
# and alerts will be delivered there. Without it, the watchdog still self-heals
# and logs — it just stays silent.
#
# Install (on the VPS):
#   crontab -l | { cat; echo "*/2 * * * * /opt/pulse-ai/scripts/uptime-watchdog.sh >/dev/null 2>&1"; } | crontab -

set -uo pipefail

PROJECT_DIR="${PULSE_DIR:-/opt/pulse-ai}"
COMPOSE=(docker compose -f "$PROJECT_DIR/docker-compose.yml" -f "$PROJECT_DIR/docker-compose.prod.yml")
CONTAINERS=(pulse-gateway pulse-dashboard pulse-postgres pulse-redis)
PUBLIC_URL="${PULSE_PUBLIC_URL:-https://pulse.runstate.mu}"

LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/watchdog.log"
STATE_DIR="$PROJECT_DIR/logs/.watchdog-state"
mkdir -p "$LOG_DIR" "$STATE_DIR"

# Optional alert config
[ -f "$PROJECT_DIR/.watchdog.env" ] && . "$PROJECT_DIR/.watchdog.env"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "$(ts) $*" >> "$LOG_FILE"; }

# Alert, but rate-limit to once per hour per unique message key so cron doesn't spam.
alert() {
    local key="$1"; shift
    local msg="$*"
    log "ALERT[$key] $msg"

    local stamp_file="$STATE_DIR/alert_$key"
    local now last
    now=$(date -u +%s)
    last=$(cat "$stamp_file" 2>/dev/null || echo 0)
    if [ $(( now - last )) -lt 3600 ]; then
        return 0   # already alerted within the last hour
    fi
    echo "$now" > "$stamp_file"

    if [ -n "${WATCHDOG_TG_TOKEN:-}" ] && [ -n "${WATCHDOG_TG_CHAT:-}" ]; then
        curl -s -m 10 -X POST \
            "https://api.telegram.org/bot${WATCHDOG_TG_TOKEN}/sendMessage" \
            -d chat_id="${WATCHDOG_TG_CHAT}" \
            -d text="🚨 Pulse watchdog: ${msg}" >/dev/null 2>&1 || true
    fi
}

heal() {
    local name="$1"
    local state
    state=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo "missing")

    if [ "$state" != "running" ]; then
        alert "${name}_down" "$name was '$state' — restarting."
        (cd "$PROJECT_DIR" && "${COMPOSE[@]}" up -d "$name") >>"$LOG_FILE" 2>&1 \
            || docker start "$name" >>"$LOG_FILE" 2>&1
        return
    fi

    # Only app containers define a healthcheck we act on.
    local health
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo "none")
    if [ "$health" = "unhealthy" ]; then
        alert "${name}_unhealthy" "$name healthcheck is unhealthy — restarting."
        docker restart "$name" >>"$LOG_FILE" 2>&1
    fi
}

for c in "${CONTAINERS[@]}"; do
    heal "$c"
done

# End-to-end public check (catches nginx / TLS / upstream issues the container view misses).
code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "$PUBLIC_URL" 2>/dev/null || echo "000")
if [ "$code" != "200" ] && [ "$code" != "302" ] && [ "$code" != "307" ]; then
    alert "public_down" "$PUBLIC_URL returned HTTP $code."
else
    # Clear the public-down alert stamp on recovery so the next outage alerts immediately.
    rm -f "$STATE_DIR/alert_public_down"
fi

# Heartbeat: overwrite a single line each run so there is always proof the
# watchdog is alive, without growing a log on healthy runs.
echo "$(ts) last-check public=$code $(for c in "${CONTAINERS[@]}"; do printf '%s=%s ' "$c" "$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)"; done)" > "$LOG_DIR/watchdog-last.txt"
