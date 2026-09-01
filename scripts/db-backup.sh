#!/usr/bin/env bash
set -euo pipefail

# Database backup for Pulse AI.
#
#   ./scripts/db-backup.sh              # back up the local docker postgres
#   ./scripts/db-backup.sh --remote     # back up the VPS postgres over ssh (from a laptop)
#
# On the VPS this is run unattended by cron (see scripts/install-backup-cron.sh):
#   30 2 * * *  BACKUP_DIR=/opt/pulse-ai/backups /opt/pulse-ai/scripts/db-backup.sh >> /opt/pulse-ai/backups/backup.log 2>&1
#
# Env:
#   BACKUP_DIR  where to write (default ./backups)
#   RETENTION   how many backups to keep (default 30)

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${RETENTION:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/pulse_backup_${TIMESTAMP}.sql.gz"
MODE="${1:-}"

# Dump using the container's OWN POSTGRES_USER/DB so there are no hardcoded
# credentials or db names. Single-quoted so $POSTGRES_* expand INSIDE the
# container, not on the host.
CONTAINER_DUMP='docker exec pulse-postgres sh -c '\''pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'\'' | gzip'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$BACKUP_DIR"

if [ "$MODE" = "--remote" ]; then
    log "Backing up VPS postgres -> $DEST"
    ssh pulse-vps "$CONTAINER_DUMP" > "$DEST"
else
    log "Backing up local docker postgres -> $DEST"
    eval "$CONTAINER_DUMP" > "$DEST"
fi

# Fail-safe: a real gzipped dump is never tiny. If it is, the dump failed —
# delete the bad file and abort WITHOUT pruning, so existing good backups survive.
SIZE=$(wc -c < "$DEST" | tr -d ' ')
if [ "$SIZE" -lt 1024 ]; then
    log "ERROR: backup is only ${SIZE}B — dump failed. Removing and aborting (no prune)."
    rm -f "$DEST"
    exit 1
fi

# Restore-verification: a backup you can't restore is worthless. Size alone is
# not enough — a truncated or corrupt dump can still be large. Verify the gzip
# is intact AND that the SQL actually contains a schema (CREATE TABLE lines).
if ! gunzip -t "$DEST" 2>/dev/null; then
    log "ERROR: $DEST fails gzip integrity check — removing, aborting (no prune)."
    rm -f "$DEST"; exit 1
fi
TABLES=$(gunzip -c "$DEST" | grep -c "CREATE TABLE" || true)
MIN_TABLES="${MIN_TABLES:-20}"
if [ "$TABLES" -lt "$MIN_TABLES" ]; then
    log "ERROR: $DEST has only $TABLES CREATE TABLE stmts (< $MIN_TABLES) — dump looks incomplete. Removing, aborting (no prune)."
    rm -f "$DEST"; exit 1
fi
log "verified: gzip intact, $TABLES tables present"

# Optional off-box copy. Set BACKUP_OFFSITE to an rsync target (host:/path or a
# path on a mounted remote) to push the latest dump off the machine — a backup
# on the same box that dies with it is only half a backup. No hardcoded target.
if [ -n "${BACKUP_OFFSITE:-}" ]; then
    if rsync -a "$DEST" "$BACKUP_OFFSITE"/ 2>/dev/null; then
        log "off-box copy -> $BACKUP_OFFSITE"
    else
        log "WARN: off-box copy to $BACKUP_OFFSITE failed (local backup still kept)"
    fi
fi

# Retention: keep the newest $RETENTION, delete older.
ls -t "$BACKUP_DIR"/pulse_backup_*.sql.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm -f

log "OK: $DEST ($(du -h "$DEST" | cut -f1)) — $(ls "$BACKUP_DIR"/pulse_backup_*.sql.gz 2>/dev/null | wc -l | tr -d ' ') backups retained"
