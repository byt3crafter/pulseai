#!/usr/bin/env bash
# Publish the fleet update manifest on runstate so every client box's admin console
# sees the newly-released version (server-side check, no GitHub token needed).
# Usage: scripts/publish-version.sh [version]   (defaults to ./VERSION)
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VER="${1:-$(cat "$ROOT_DIR/VERSION")}"; VER="${VER#v}"
HUB_HOST="${PULSE_HUB_HOST:-pulse-vps}"
HUB_MANIFEST="${PULSE_HUB_MANIFEST:-/var/www/pulse-version/pulse-version.json}"
ssh "$HUB_HOST" "mkdir -p \$(dirname '$HUB_MANIFEST') && echo '{\"version\":\"$VER\"}' > '$HUB_MANIFEST'"
echo "Published version $VER to $HUB_HOST:$HUB_MANIFEST"
