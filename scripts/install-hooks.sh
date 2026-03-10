#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install-hooks.sh — Symlink version-controlled hooks into .git/hooks/
#
# Usage: ./scripts/install-hooks.sh
# Run once after cloning, or after adding new hooks.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$ROOT_DIR/.git/hooks"
SOURCE_DIR="$SCRIPT_DIR/hooks"

GREEN='\033[0;32m'
NC='\033[0m'

echo "Installing git hooks..."

for hook in "$SOURCE_DIR"/*; do
    hook_name=$(basename "$hook")
    target="$HOOKS_DIR/$hook_name"

    # Remove existing (sample or old)
    rm -f "$target"
    rm -f "${target}.sample"

    # Symlink
    ln -s "$hook" "$target"
    chmod +x "$hook"
    echo -e "  ${GREEN}Installed:${NC} $hook_name"
done

echo -e "${GREEN}Done. Hooks installed from scripts/hooks/${NC}"
