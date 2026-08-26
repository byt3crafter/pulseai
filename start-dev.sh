#!/bin/bash
set -e

# Load environment variables if .env exists in pulse directory
if [ -f "pulse/.env" ]; then
    export $(cat pulse/.env | grep -v '^#' | xargs)
fi

# Set default ports or use from .env
API_PORT=${PORT:-3000}
DASHBOARD_PORT=${DASHBOARD_PORT:-3001}
OFFICE_PORT=${OFFICE_PORT:-3004}

# The office (the 3D floor) is a full Next app with heavy 3D deps, so it only
# joins the boot once its node_modules exist. Run `cd office && npm install`
# to switch it on; skip it and the rest of Pulse still boots exactly as before.
RUN_OFFICE=false
if [ -d "office/node_modules" ]; then RUN_OFFICE=true; fi

echo "========================================================"
echo "🚀 Booting Pulse Environment"
echo "========================================================"
echo "API Gateway Port:   $API_PORT"
echo "Admin Dashboard:    $DASHBOARD_PORT"
if [ "$RUN_OFFICE" = true ]; then
  echo "Office (3D floor):  $OFFICE_PORT"
else
  echo "Office (3D floor):  off — run 'cd office && npm install' to enable"
fi
echo "========================================================"

# Function to violently kill anything on a port
kill_port() {
  local port=$1
  echo "🧹 Force-killing any process hiding on port $port..."
  fuser -k -9 $port/tcp 2>/dev/null || true
  npx kill-port $port > /dev/null 2>&1 || true
}

# 1. Kill old processes on both chosen ports FIRST
kill_port $API_PORT
kill_port $DASHBOARD_PORT
[ "$RUN_OFFICE" = true ] && kill_port $OFFICE_PORT

# 2. Cleanup Next.js build cache and lockfiles
echo "🧹 Cleaning Next.js build cache..."
rm -rf dashboard/.next

# 3. Wipe out Next.js / tsx zombies that got stuck
echo "🧹 Reaping zombie processes..."
pkill -9 -f "next dev" || true
pkill -9 -f "tsx watch" || true

# 4. Start database and redis
echo "📦 Starting PostgreSQL & Redis Containers..."
docker compose up -d postgres redis

# 5. Type-check both projects before launching
echo "🔍 Type-checking Pulse API..."
(cd pulse && npx tsc --noEmit) || { echo "❌ Pulse type-check failed"; exit 1; }
echo "✅ Pulse API — clean"

echo "🔍 Building Dashboard..."
(cd dashboard && NODE_ENV=production npx next build) || { echo "❌ Dashboard build failed"; exit 1; }
echo "✅ Dashboard — clean"

if [ "$RUN_OFFICE" = true ]; then
  echo "🔍 Type-checking Office..."
  (cd office && npx tsc --noEmit) || { echo "❌ Office type-check failed"; exit 1; }
  echo "✅ Office — clean"
fi

# 6. Connect the servers using explicitly passed ports
echo "🌐 Launching Servers..."
# The office talks to the local gateway and mints its tokens against the local
# dashboard — the same two env vars the container gets, pointed at localhost.
# HERMES3D_BASE_PATH stays unset: in dev the dashboard rewrites /office itself
# (see dashboard/next.config.ts), so there is no prefix for assets to carry.
if [ "$RUN_OFFICE" = true ]; then
  npx concurrently -n "API,WEB,OFFICE" -c "blue,green,magenta" \
    "cd pulse && npm run dev" \
    "cd dashboard && npx next dev -p $DASHBOARD_PORT" \
    "cd office && PORT=$OFFICE_PORT \
      HERMES3D_GATEWAY_ADAPTER_TYPE=custom \
      HERMES3D_GATEWAY_URL=http://localhost:$API_PORT \
      PULSE_DASHBOARD_URL=http://localhost:$DASHBOARD_PORT \
      npm run dev" \
    --kill-others
else
  npx concurrently -n "API,WEB" -c "blue,green" \
    "cd pulse && npm run dev" \
    "cd dashboard && npx next dev -p $DASHBOARD_PORT" \
    --kill-others
fi
