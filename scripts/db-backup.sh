#!/usr/bin/env bash
set -euo pipefail

# Database backup script for Pulse AI
# Usage: ./scripts/db-backup.sh [--remote]

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="pulse_backup_${TIMESTAMP}.sql.gz"
REMOTE=${1:-""}

mkdir -p "$BACKUP_DIR"

if [ "$REMOTE" = "--remote" ]; then
    echo "Creating backup on VPS..."
    ssh pulse-vps "docker exec pulse-postgres pg_dump -U pulseadmin pulse | gzip" > "$BACKUP_DIR/$BACKUP_FILE"
else
    echo "Creating local backup..."
    docker exec pulse-postgres pg_dump -U pulseadmin pulse | gzip > "$BACKUP_DIR/$BACKUP_FILE"
fi

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/pulse_backup_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm

FILESIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
echo "Backup created: $BACKUP_DIR/$BACKUP_FILE ($FILESIZE)"
echo "Total backups: $(ls "$BACKUP_DIR"/pulse_backup_*.sql.gz 2>/dev/null | wc -l)"
