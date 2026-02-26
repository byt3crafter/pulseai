#!/bin/bash
set -e

# Load environment variables if .env exists in pulse directory
if [ -f "pulse/.env" ]; then
    export $(cat pulse/.env | grep -v '^#' | xargs)
fi

# Set default ports or use from .env
API_PORT=${PORT:-3000}
DASHBOARD_PORT=${DASHBOARD_PORT:-3001}

echo "========================================================"
echo "🚀 Booting Pulse Environment"
echo "========================================================"
echo "API Gateway Port:   $API_PORT"
echo "Admin Dashboard:    $DASHBOARD_PORT"
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

# 6. Connect the servers using explicitly passed ports
echo "🌐 Launching Servers..."
npx concurrently -n "API,WEB" -c "blue,green" \
  "cd pulse && npm run dev" \
  "cd dashboard && npx next dev -p $DASHBOARD_PORT" \
  --kill-others
