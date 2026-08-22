# Fleet updates — many client VPSs, one command

Each client runs the **same image**, their **own config**. Images are built once in
CI and pushed to GHCR; client boxes **pull** instead of compiling from source. One
command updates the whole fleet, health-checked per client, with auto-rollback.

```
release (tag) ──▶ GitHub Actions builds + pushes ──▶ GHCR
                                                        │  docker compose pull
   scripts/fleet-update.sh v0.19.0 ──ssh──▶ each client ┘  + migrate + up -d + health-check
```

## One-time setup

1. **Registry**: nothing to configure — `.github/workflows/release.yml` pushes
   `ghcr.io/<owner>/pulse-gateway` and `…/pulse-dashboard` on every `vX.Y.Z` tag using
   the built-in `GITHUB_TOKEN`. Images default to **private**.

2. **Each client box** needs read access to the private images. Create a GitHub PAT
   with `read:packages`, then once per box:
   ```
   echo <PAT> | docker login ghcr.io -u <github-user> --password-stdin
   ```
   (Or make the two GHCR packages public and skip this.)

3. **Point each box at registry mode.** In the client's `.env` add:
   ```
   PULSE_IMAGE_OWNER=<github-owner>   # e.g. byt3crafter
   PULSE_VERSION=<current version>    # e.g. 0.18.3
   ```
   The updater manages these afterwards.

4. **Seed migration tracking** on boxes that are already up to date (marks existing
   migrations applied without re-running them) — run once per box:
   ```
   scripts/fleet-update.sh <current-version> --only <client> --seed-migrations
   ```

5. **Inventory**: list every client in [`fleet.hosts`](../fleet.hosts) — keep it private.

## Releasing

```
./scripts/release.sh minor            # bump + tag → CI builds & pushes the images
./scripts/fleet-update.sh v0.19.0 --canary     # your box first, verify
./scripts/fleet-update.sh v0.19.0 --group prod # then the rest
```

`fleet-update.sh` per client: sets `PULSE_VERSION` → `docker compose pull` → applies
pending `scripts/migrations/*.sql` (tracked in a `_fleet_migrations` table) → `up -d`
→ health-checks `https://<domain>/dashboard` → **rolls back to the previous version if
unhealthy**, and **stops the fleet** on the first failure (override with
`--continue-on-error`).

Selectors: `--only <name>`, `--group <group>`, `--canary`, `--all`. Add `--dry-run`
to preview, `--no-migrate` to skip migrations.

## Rollback

Instant — no rebuild. Either re-run with the older tag, or on one box:
```
sed -i 's/^PULSE_VERSION=.*/PULSE_VERSION=0.18.3/' .env
docker compose -f docker-compose.yml -f docker-compose.registry.yml -f docker-compose.<client>.yml up -d
```

## Onboarding client #N

1. Provision the VPS (Docker + compose), clone the compose files, write its `.env`
   (secrets, domain, branding) and a `docker-compose.<client>.yml` override.
2. `docker login ghcr.io` (step 2 above).
3. `PULSE_VERSION=<latest> docker compose -f docker-compose.yml -f docker-compose.registry.yml -f docker-compose.<client>.yml up -d`
   (a fresh box runs **all** migrations automatically — do NOT `--seed`).
4. Add it to `fleet.hosts`.

## Reusing this for Manta and other apps

The pattern is app-agnostic: give each app a `release.yml` (build→GHCR), a registry
compose overlay, and its own `fleet.hosts`. Copy this setup, swap the image names and
inventory. When you outgrow flat scripts (30+ deployments), lift the same inventory
into **Ansible** (`--limit` per app/group) or a **Coolify/Portainer** dashboard — no
rewrite, just a nicer runner over the same convention.
