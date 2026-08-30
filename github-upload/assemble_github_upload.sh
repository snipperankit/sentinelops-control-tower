#!/usr/bin/env bash
set -euo pipefail

# Builds a full, sanitized copy of the repository suitable for manual
# drag-and-drop upload to GitHub's web UI (no git commit/push involved).
#
# Includes: all source, scripts, docs, *.md, *.json, config files.
# Excludes: node_modules, .git, local secrets/demo state, corporate certs,
#           local logs/crash dumps, previous backup/output folders.

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
OUT_DIR="$ROOT/github-upload/output/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"

echo "Assembling full sanitized copy at: $OUT_DIR"

EXCLUDES=(
  --exclude=".git"
  --exclude="node_modules"
  --exclude=".scrub_backup"
  --exclude="submission-package/output"
  --exclude="github-upload/output"
  --exclude=".certs"
  --exclude=".env"
  --exclude=".demo-state"
  --exclude="test-videos"
  --exclude="test-results"
  --exclude="playwright-report"
  --exclude="blob-report"
  --exclude="coverage"
  --exclude="dist"
  --exclude="*.log"
  --exclude="*.webm"
  --exclude="*.zip"
  --exclude="bash.exe.stackdump"
)

if command -v rsync >/dev/null 2>&1; then
  rsync -a "${EXCLUDES[@]}" "$ROOT"/ "$OUT_DIR"/
else
  echo "rsync not found; falling back to tar-based copy" >&2
  TAR_EXCLUDES=()
  for e in "${EXCLUDES[@]}"; do
    TAR_EXCLUDES+=(--exclude="${e#--exclude=}")
  done
  (cd "$ROOT" && tar "${TAR_EXCLUDES[@]}" -cf - .) | (cd "$OUT_DIR" && tar xf -)
fi

# Belt-and-suspenders: remove anything that slipped through.
rm -rf "$OUT_DIR/.git" "$OUT_DIR/node_modules" "$OUT_DIR/.scrub_backup" \
       "$OUT_DIR/.certs" "$OUT_DIR/.env" "$OUT_DIR/.demo-state" \
       "$OUT_DIR/bash.exe.stackdump"
find "$OUT_DIR" -name "*.log" -delete 2>/dev/null || true

echo "Done. Verify no secrets remain, then drag-and-drop the CONTENTS of:"
echo "  $OUT_DIR"
echo "into the GitHub web upload page."
