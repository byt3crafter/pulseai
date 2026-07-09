#!/usr/bin/env bash
set -euo pipefail

# Idempotently install the nightly DB backup cron on the VPS.
# Safe to re-run (replaces any prior Pulse backup cron line).
#
#   Run ON the VPS:  /opt/pulse-ai/scripts/install-backup-cron.sh
#   Or from laptop:  ssh pulse-vps 'bash /opt/pulse-ai/scripts/install-backup-cron.sh'

PROJECT="${PULSE_PROJECT:-/opt/pulse-ai}"
BACKUP_DIR="$PROJECT/backups"
MARKER="# pulse-db-backup"
# 02:30 daily — clear of the 03:00/04:00 notification crons.
CRON_LINE="30 2 * * * BACKUP_DIR=$BACKUP_DIR $PROJECT/scripts/db-backup.sh >> $BACKUP_DIR/backup.log 2>&1 $MARKER"

mkdir -p "$BACKUP_DIR"
chmod +x "$PROJECT/scripts/db-backup.sh"

# Drop any previous pulse-db-backup line, then add the current one.
( crontab -l 2>/dev/null | grep -vF "$MARKER" || true; echo "$CRON_LINE" ) | crontab -

echo "Installed backup cron:"
crontab -l | grep -F "$MARKER"
