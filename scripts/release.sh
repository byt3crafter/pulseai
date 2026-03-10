#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# release.sh — Bump version, update changelog, tag, and push
#
# Usage:
#   ./scripts/release.sh patch    # 0.9.0 → 0.9.1
#   ./scripts/release.sh minor    # 0.9.0 → 0.10.0
#   ./scripts/release.sh major    # 0.9.0 → 1.0.0
#   ./scripts/release.sh --dry-run patch  # Show what would happen
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

# ─── Parse args ──────────────────────────────────────────────────────────────

BUMP_TYPE=""
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        patch|minor|major) BUMP_TYPE="$arg" ;;
        --dry-run) DRY_RUN=true ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] <patch|minor|major>"
            exit 0
            ;;
        *) echo -e "${RED}Unknown argument: $arg${NC}"; exit 1 ;;
    esac
done

if [[ -z "$BUMP_TYPE" ]]; then
    echo -e "${RED}Version bump type required: patch, minor, or major${NC}"
    echo "Usage: $0 [--dry-run] <patch|minor|major>"
    exit 1
fi

# ─── Ensure clean state on main ─────────────────────────────────────────────

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
if [[ "$BRANCH" != "main" ]]; then
    echo -e "${RED}Releases must be created from 'main' branch.${NC}"
    echo -e "Current branch: $BRANCH"
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo -e "${RED}Working directory is not clean. Commit or stash changes first.${NC}"
    git status --short
    exit 1
fi

# Pull latest
git pull --ff-only origin main || {
    echo -e "${RED}Failed to pull latest main. Resolve manually.${NC}"
    exit 1
}

# ─── Run full validation ────────────────────────────────────────────────────

echo -e "${YELLOW}Running pre-release checks...${NC}"
if ! bash "$SCRIPT_DIR/pre-deploy-check.sh"; then
    echo -e "${RED}Pre-release checks failed. Fix issues before releasing.${NC}"
    exit 1
fi
echo -e "${GREEN}  All checks passed.${NC}"
echo ""

# ─── Calculate new version ───────────────────────────────────────────────────

CURRENT_VERSION=$(cat VERSION 2>/dev/null || echo "0.0.0")
IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
    major) NEW_VERSION="$((V_MAJOR + 1)).0.0" ;;
    minor) NEW_VERSION="${V_MAJOR}.$((V_MINOR + 1)).0" ;;
    patch) NEW_VERSION="${V_MAJOR}.${V_MINOR}.$((V_PATCH + 1))" ;;
esac

TAG="v${NEW_VERSION}"
TODAY=$(date +%Y-%m-%d)

echo -e "${BOLD}${CYAN}━━━ Pulse AI Release ━━━${NC}"
echo -e "  Current version: ${YELLOW}${CURRENT_VERSION}${NC}"
echo -e "  New version:     ${GREEN}${NEW_VERSION}${NC}"
echo -e "  Tag:             ${GREEN}${TAG}${NC}"
echo ""

# ─── Generate changelog section ─────────────────────────────────────────────

# Find the last tag (if any)
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -n "$LAST_TAG" ]]; then
    RANGE="${LAST_TAG}..HEAD"
else
    RANGE="HEAD"
fi

CHANGELOG_SECTION="## [${NEW_VERSION}] - ${TODAY}"

# Collect commits by type
declare -A TYPE_LABELS=(
    [feat]="Features"
    [fix]="Bug Fixes"
    [refactor]="Refactoring"
    [perf]="Performance"
    [docs]="Documentation"
    [test]="Tests"
    [chore]="Chores"
)

HAS_ENTRIES=false
for type in feat fix refactor perf docs test chore; do
    COMMITS=$(git log "$RANGE" --oneline --format="%s" 2>/dev/null \
        | grep -E "^${type}(\(.+\))?: " \
        | sed -E "s/^${type}(\(.+\))?: //" \
        || true)

    if [[ -n "$COMMITS" ]]; then
        HAS_ENTRIES=true
        CHANGELOG_SECTION+=$'\n\n'"### ${TYPE_LABELS[$type]}"
        while IFS= read -r line; do
            CHANGELOG_SECTION+=$'\n'"- ${line}"
        done <<< "$COMMITS"
    fi
done

if [[ "$HAS_ENTRIES" == false ]]; then
    CHANGELOG_SECTION+=$'\n\n'"No notable changes."
fi

CHANGELOG_SECTION+=$'\n'

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}[DRY RUN] Would generate this changelog:${NC}"
    echo ""
    echo "$CHANGELOG_SECTION"
    echo ""
    echo -e "${YELLOW}[DRY RUN] No changes made.${NC}"
    exit 0
fi

# ─── Update VERSION file ────────────────────────────────────────────────────

echo -n "$NEW_VERSION" > VERSION
echo -e "${GREEN}  Updated VERSION → ${NEW_VERSION}${NC}"

# ─── Update package.json versions ────────────────────────────────────────────

node -e "
const fs = require('fs');
for (const p of ['pulse/package.json', 'dashboard/package.json']) {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    pkg.version = '${NEW_VERSION}';
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
}
"
echo -e "${GREEN}  Updated pulse/package.json → ${NEW_VERSION}${NC}"
echo -e "${GREEN}  Updated dashboard/package.json → ${NEW_VERSION}${NC}"

# ─── Update CHANGELOG.md ────────────────────────────────────────────────────

if [[ -f CHANGELOG.md ]]; then
    TEMP_CL=$(mktemp)
    INSERTED=false

    while IFS= read -r line; do
        if [[ "$INSERTED" == false && "$line" =~ ^##\ \[ ]]; then
            echo "$CHANGELOG_SECTION" >> "$TEMP_CL"
            INSERTED=true
        fi
        echo "$line" >> "$TEMP_CL"
    done < CHANGELOG.md

    if [[ "$INSERTED" == false ]]; then
        echo "" >> "$TEMP_CL"
        echo "$CHANGELOG_SECTION" >> "$TEMP_CL"
    fi

    mv "$TEMP_CL" CHANGELOG.md
else
    cat > CHANGELOG.md << CHEOF
# Changelog

All notable changes to Pulse AI will be documented in this file.
This changelog is auto-generated from conventional commits.

${CHANGELOG_SECTION}
CHEOF
fi

echo -e "${GREEN}  Updated CHANGELOG.md${NC}"

# ─── Commit and tag ──────────────────────────────────────────────────────────

git add VERSION CHANGELOG.md pulse/package.json dashboard/package.json
git commit --no-verify -m "release: v${NEW_VERSION}"
git tag -a "$TAG" -m "Release ${TAG}"

echo -e "${GREEN}  Created commit and tag ${TAG}${NC}"

# ─── Push ────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}Pushing to origin...${NC}"
git push origin main --follow-tags

echo ""
echo -e "${BOLD}${GREEN}Release ${TAG} complete!${NC}"
echo -e "  Tag: ${TAG}"
echo -e "  Deploy: ./scripts/deploy.sh --tag=${TAG}"
