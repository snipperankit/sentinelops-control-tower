#!/usr/bin/env bash
set -euo pipefail

# Prepare repo for publishing to GitHub by moving local/demo sensitive
# files into a local backup folder. This script DOES NOT commit or push
# anything. Review the backup directory before deleting it.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_DIR="$ROOT_DIR/.scrub_backup/$TS"

echo "Preparing backup at $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

move_if_exists() {
  local path="$1"
  if [ -e "$ROOT_DIR/$path" ]; then
    echo "Moving $path -> .scrub_backup/$TS/"
    mkdir -p "$(dirname "$BACKUP_DIR/$path")"
    mv "$ROOT_DIR/$path" "$BACKUP_DIR/$path"
  fi
}

# Common local/demo artifacts
move_if_exists ".demo-state"
move_if_exists ".env"
move_if_exists "incident_detail.json"
move_if_exists "Usersq1495302Documentssentinelops-control-towerincident_detail.json"
move_if_exists "test-videos"
move_if_exists "test-results"
move_if_exists "apps/cockpit/test-results"

# Remove any lingering .webm or trace zip files in the repo root or known dirs
find "$ROOT_DIR" -maxdepth 3 -type f \( -name '*.webm' -o -name 'trace.zip' -o -name '*.zip' \) -print0 |
  while IFS= read -r -d '' f; do
    rel=${f#"$ROOT_DIR/"}
    echo "Archiving $rel"
    mkdir -p "$(dirname "$BACKUP_DIR/$rel")"
    mv "$f" "$BACKUP_DIR/$rel"
  done

echo "Backup complete. Files moved to: $BACKUP_DIR"
echo "Review contents, then delete the backup when you're ready. No commits were made."

exit 0
