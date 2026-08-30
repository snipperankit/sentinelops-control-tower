#!/usr/bin/env bash
set -euo pipefail

# Assemble a clean submission bundle for GitHub under submission-package/output/<timestamp>/
# Excludes local-only artifacts and demo secrets. Does NOT commit or push.

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
OUT_DIR="$ROOT/submission-package/output/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"

echo "Creating submission bundle at: $OUT_DIR"

# Files and directories to include (relative to repo root)
INCLUDE_FILES=(
  package.json
  package-lock.json
  tsconfig.json
  vitest.config.ts
  docker-compose.yml
  Dockerfile
  .gitignore
  eslint.config.js
)

INCLUDE_DIRS=(
  agents
  apps
  harness
  mcp
  policy
  sandbox
  scripts
  tests
)

# Exclude patterns (rsync-style)
EXCLUDES=(
  --exclude ".git"
  --exclude "node_modules"
  --exclude ".scrub_backup"
  --exclude ".certs"
  --exclude ".env"
  --exclude ".demo-state"
  --exclude "test-videos"
  --exclude "test-results"
  --exclude "docs"
  --exclude "*.md"
  --exclude "*.pem"
)

if command -v rsync >/dev/null 2>&1; then
  for f in "${INCLUDE_FILES[@]}"; do
    if [ -e "$ROOT/$f" ]; then
      rsync -a ${EXCLUDES[@]} "$ROOT/$f" "$OUT_DIR/"
    fi
  done

  for d in "${INCLUDE_DIRS[@]}"; do
    if [ -d "$ROOT/$d" ]; then
      rsync -a ${EXCLUDES[@]} "$ROOT/$d" "$OUT_DIR/"
    fi
  done
else
  # Fallback: copy with cp and filter out markdown and excluded patterns
  for f in "${INCLUDE_FILES[@]}"; do
    if [ -e "$ROOT/$f" ]; then
      cp -a "$ROOT/$f" "$OUT_DIR/"
    fi
  done
  for d in "${INCLUDE_DIRS[@]}"; do
    if [ -d "$ROOT/$d" ]; then
      mkdir -p "$OUT_DIR/$d"
      (cd "$ROOT" && tar --exclude='./docs' --exclude='*.md' --exclude='./node_modules' -cf - "$d") | (cd "$OUT_DIR" && tar xf -)
    fi
  done
fi

echo "Bundle assembled. Review $OUT_DIR before zipping or pushing."
