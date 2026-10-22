#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/release-output}"
VERSION="${2:-${GITHUB_REF_NAME:-dev}}"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cooder-release.XXXXXX")"

cleanup() {
  rm -rf -- "$STAGING_DIR"
}
trap cleanup EXIT

[[ -f "$ROOT_DIR/packages/backend/dist/index.js" &&
   -f "$ROOT_DIR/packages/backend/dist/db/schema.sqlite.sql" &&
   -f "$ROOT_DIR/packages/frontend/dist/index.html" &&
   -d "$ROOT_DIR/packages/shared/dist" ]] || {
  echo 'Build shared, backend and frontend before packaging a release.' >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
mkdir -p "$STAGING_DIR/scripts/local" "$STAGING_DIR/packages/backend" \
  "$STAGING_DIR/packages/frontend" "$STAGING_DIR/packages/shared"
cp "$ROOT_DIR/package.json" "$STAGING_DIR/package.json"
cp "$ROOT_DIR/Dockerfile" "$STAGING_DIR/Dockerfile"
cp "$ROOT_DIR/scripts/cooder.mjs" "$STAGING_DIR/scripts/cooder.mjs"
cp "$ROOT_DIR/scripts/local/install.sh" "$STAGING_DIR/scripts/local/install.sh"
cp "$ROOT_DIR/scripts/local/install-remote.sh" "$STAGING_DIR/scripts/local/install-remote.sh"
cp "$ROOT_DIR/packages/backend/package.json" "$STAGING_DIR/packages/backend/package.json"
cp -R "$ROOT_DIR/packages/backend/dist" "$STAGING_DIR/packages/backend/dist"
cp -R "$ROOT_DIR/packages/frontend/dist" "$STAGING_DIR/packages/frontend/dist"
cp "$ROOT_DIR/packages/shared/package.json" "$STAGING_DIR/packages/shared/package.json"
cp -R "$ROOT_DIR/packages/shared/dist" "$STAGING_DIR/packages/shared/dist"

node - "$STAGING_DIR/release.json" "$VERSION" <<'NODE'
const fs = require('node:fs');
const [file, version] = process.argv.slice(2);
fs.writeFileSync(file, JSON.stringify({ name: 'Cooder', version }, null, 2) + '\n');
NODE

SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}" \
  tar --sort=name --mtime="@${SOURCE_DATE_EPOCH:-0}" --owner=0 --group=0 --numeric-owner \
    -czf "$OUTPUT_DIR/cooder-local.tar.gz" -C "$STAGING_DIR" .
(
  cd "$OUTPUT_DIR"
  sha256sum cooder-local.tar.gz > cooder-local.tar.gz.sha256
)

echo "Created $OUTPUT_DIR/cooder-local.tar.gz"
echo "Created $OUTPUT_DIR/cooder-local.tar.gz.sha256"
