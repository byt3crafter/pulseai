# Pulse AI — Versioning & Release Guide

This is the single source of truth for how we version, release, deploy, and rollback Pulse AI. Follow this exactly every time.

---

## Version Format

We use **Semantic Versioning** (semver): `MAJOR.MINOR.PATCH`

| Bump | When | Example |
|------|------|---------|
| `patch` | Bug fixes, small tweaks, config changes | 0.9.0 → 0.9.1 |
| `minor` | New features, new tabs, new API endpoints | 0.9.1 → 0.10.0 |
| `major` | Breaking changes, architecture rewrites | 0.10.0 → 1.0.0 |

**Source of truth:** `VERSION` file in repo root. Also synced to `pulse/package.json` and `dashboard/package.json`.

---

## Branch Strategy (GitHub Flow)

```
main (protected — no direct commits)
  ├── feat/dynamic-model-pricing   ← new features
  ├── fix/billing-race-condition   ← bug fixes
  ├── chore/update-dependencies    ← maintenance
  └── docs/update-howto            ← documentation
```

### Branch naming rules (enforced by pre-commit hook):
- `feat/description` — new feature
- `fix/description` — bug fix
- `chore/description` — maintenance
- `docs/description` — documentation
- `refactor/description` — code restructuring
- `test/description` — test changes
- `perf/description` — performance improvements

### Commit message format (enforced by commit-msg hook):
```
feat: add dynamic model pricing
fix: resolve billing race condition
chore: update dependencies
docs: add versioning guide
```

---

## Step-by-Step Workflow

### 1. Create a feature branch

```bash
git checkout main
git pull origin main
git checkout -b feat/my-feature
```

### 2. Make changes and commit

```bash
# Stage specific files (never use git add -A blindly)
git add pulse/src/agent/providers/model-pricing-service.ts
git add dashboard/src/app/admin/settings/actions.ts

# Commit with conventional message
git commit -m "feat: add dynamic model pricing"
```

### 3. Push the branch

```bash
./scripts/push.sh "feat: add dynamic model pricing"
```

This runs:
1. Pre-deploy checks (TypeScript type check for both pulse + dashboard)
2. Stages all changes (excludes .env files)
3. Commits with your message
4. Pushes to `origin/feat/my-feature`

### 4. Merge to main

```bash
git checkout main
git pull origin main
git merge --no-ff feat/my-feature
git push origin main
```

The `--no-ff` flag creates a merge commit so the feature branch history is preserved.

### 5. Release (bump version + tag)

```bash
# From main branch, clean working directory
./scripts/release.sh patch    # 0.9.0 → 0.9.1
./scripts/release.sh minor    # 0.9.0 → 0.10.0
./scripts/release.sh major    # 0.9.0 → 1.0.0

# Preview what would happen:
./scripts/release.sh --dry-run patch
```

This automatically:
1. Validates you're on `main` with clean state
2. Runs full pre-deploy checks (tsc for both codebases)
3. Bumps `VERSION`, `pulse/package.json`, `dashboard/package.json`
4. Generates changelog from conventional commits
5. Creates a `release: vX.Y.Z` commit
6. Creates an annotated git tag `vX.Y.Z`
7. Pushes commit + tag to origin

### 6. Deploy to VPS

```bash
# Deploy the tagged version
./scripts/deploy.sh --tag=v0.9.1

# Or deploy whatever is in VERSION file
./scripts/deploy.sh

# Deploy only dashboard
./scripts/deploy.sh --dashboard

# Deploy only gateway
./scripts/deploy.sh --gateway

# Skip DB migration
./scripts/deploy.sh --no-migrate
```

This:
1. Runs pre-deploy checks
2. Rsyncs code to VPS (excludes node_modules, .env, .git)
3. Runs `npm ci --production` on VPS
4. Runs pending SQL migrations (`scripts/migrations/`)
5. Rebuilds Docker containers with version-tagged images

### 7. Clean up feature branch

```bash
git branch -d feat/my-feature
git push origin --delete feat/my-feature
```

---

## Rollback

### Quick rollback (cached Docker images)

If the VPS still has the previous version's Docker image cached, rollback is instant:

```bash
# Roll back to the previous version
./scripts/rollback.sh

# Roll back to a specific version
./scripts/rollback.sh v0.9.0

# See available versions
./scripts/rollback.sh --list
```

### Manual rollback

If no cached image exists, rollback does a full redeploy from the old tag:

```bash
./scripts/deploy.sh --tag=v0.9.0
```

### Database rollback

Migrations are forward-only. If a migration breaks things:

1. Write a new migration to undo the change:
```sql
-- scripts/migrations/0006_revert_model_pricing.sql
DROP TABLE IF EXISTS model_pricing;
ALTER TABLE usage_records DROP COLUMN IF EXISTS base_cost_usd;
```

2. Apply it:
```bash
./scripts/db-migrate.sh --vps
```

### Emergency rollback (code only, skip migration)

```bash
./scripts/deploy.sh --tag=v0.9.0 --no-migrate
```

---

## Complete Example: Feature → Production

```bash
# 1. Start feature
git checkout main && git pull origin main
git checkout -b feat/dynamic-model-pricing

# 2. Code... test... commit...
git add -A && git commit -m "feat: add dynamic model pricing with admin UI"

# 3. Push branch (runs typechecks automatically)
./scripts/push.sh "feat: add dynamic model pricing with admin UI"

# 4. Merge to main
git checkout main && git pull origin main
git merge --no-ff feat/dynamic-model-pricing
git push origin main

# 5. Release
./scripts/release.sh patch

# 6. Deploy
./scripts/deploy.sh --tag=v0.9.1

# 7. Verify
curl -s https://pulse.runstate.mu/health

# 8. Clean up
git branch -d feat/dynamic-model-pricing
git push origin --delete feat/dynamic-model-pricing

# If something breaks:
./scripts/rollback.sh   # instant rollback to previous version
```

---

## Git Hooks (auto-installed)

| Hook | What it does |
|------|-------------|
| `pre-commit` | Blocks direct commits to `main`, validates branch naming, runs `tsc --noEmit` |
| `commit-msg` | Enforces conventional commit format (`feat:`, `fix:`, `chore:`, etc.) |
| `pre-push` | Runs full test suite (`vitest run`) before push |

Install hooks:
```bash
./scripts/install-hooks.sh
```

---

## Key Files

| File | Purpose |
|------|---------|
| `VERSION` | Single source of truth for current version |
| `CHANGELOG.md` | Auto-generated from conventional commits |
| `scripts/release.sh` | Version bump + changelog + tag + push |
| `scripts/deploy.sh` | Sync to VPS + migrate + rebuild containers |
| `scripts/rollback.sh` | Revert VPS to previous version |
| `scripts/push.sh` | Stage + commit + push (with checks) |
| `scripts/pre-deploy-check.sh` | TypeScript checks for both codebases |
| `scripts/install-hooks.sh` | Install git hooks |
| `scripts/hooks/pre-commit` | Branch protection + type check |
| `scripts/hooks/commit-msg` | Conventional commit enforcement |
| `scripts/hooks/pre-push` | Test suite gate |
| `scripts/migrations/*.sql` | Versioned SQL migrations |
| `scripts/db-migrate.sh` | Run migrations locally or on VPS |

---

## Production URLs

| Service | URL |
|---------|-----|
| Dashboard | https://pulse.runstate.mu |
| Gateway | https://pulse.runstate.mu:8082 |
| Health check | https://pulse.runstate.mu:8082/health |

## VPS Access

```bash
ssh pulse-vps              # SSH to VPS
# Project lives at /opt/pulse-ai
# Containers: pulse-gateway, pulse-dashboard, pulse-postgres, pulse-redis
```
