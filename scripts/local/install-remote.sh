#!/usr/bin/env bash
set -euo pipefail
umask 077

REPOSITORY="${COODER_GITHUB_REPOSITORY:-DevtApps/cooder}"
RELEASE_BASE_URL="${COODER_RELEASE_BASE_URL:-https://github.com/$REPOSITORY/releases}"
VERSION="${COODER_VERSION:-latest}"
COODER_HOME="${COODER_HOME:-$HOME/.local/share/cooder}"
COODER_HOME="$(mkdir -p "$COODER_HOME" && cd "$COODER_HOME" && pwd)"

fail() {
  echo "[cooder install] $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail 'curl is required.'
command -v tar >/dev/null 2>&1 || fail 'tar is required.'
command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 ||
  fail 'sha256sum or shasum is required to verify the release.'

if [ "$VERSION" != latest ] && [[ ! "$VERSION" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  fail "Invalid COODER_VERSION: $VERSION"
fi

ARCHIVE='cooder-local.tar.gz'
if [ "$VERSION" = latest ]; then
  RELEASE_URL="$RELEASE_BASE_URL/latest/download"
else
  RELEASE_URL="$RELEASE_BASE_URL/download/$VERSION"
fi

DOWNLOAD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cooder-install.XXXXXX")"
RELEASES_DIR="$COODER_HOME/releases"
STAGING_DIR="$RELEASES_DIR/.staging-$$"
PREVIOUS_DIR="$RELEASES_DIR/.previous-$$"
RELEASE_DIR="$RELEASES_DIR/$VERSION"

cleanup() {
  rm -rf -- "$DOWNLOAD_DIR" "$STAGING_DIR"
  if [ -d "$PREVIOUS_DIR" ]; then
    if [ "${INSTALL_SUCCEEDED:-0}" = 1 ]; then
      rm -rf -- "$PREVIOUS_DIR"
    else
      rm -rf -- "$RELEASE_DIR"
      mv "$PREVIOUS_DIR" "$RELEASE_DIR"
    fi
  fi
}
trap cleanup EXIT

mkdir -p "$RELEASES_DIR"
curl --fail --location --retry 3 "$RELEASE_URL/$ARCHIVE" -o "$DOWNLOAD_DIR/$ARCHIVE"
curl --fail --location --retry 3 "$RELEASE_URL/$ARCHIVE.sha256" -o "$DOWNLOAD_DIR/$ARCHIVE.sha256"
(
  cd "$DOWNLOAD_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check --status "$ARCHIVE.sha256"
  else
    shasum -a 256 --check --status "$ARCHIVE.sha256"
  fi
) || fail 'Release checksum validation failed.'

if tar -tzf "$DOWNLOAD_DIR/$ARCHIVE" | awk '
  /^\// || /(^|\/)\.\.(\/|$)/ { invalid = 1 }
  END { exit invalid ? 0 : 1 }
'; then
  fail 'Release archive contains an unsafe path.'
fi

mkdir -p "$STAGING_DIR"
tar -xzf "$DOWNLOAD_DIR/$ARCHIVE" -C "$STAGING_DIR"
[[ -f "$STAGING_DIR/packages/backend/dist/index.js" &&
   -f "$STAGING_DIR/packages/backend/dist/db/schema.sqlite.sql" &&
   -f "$STAGING_DIR/packages/frontend/dist/index.html" &&
   -f "$STAGING_DIR/scripts/local/install.sh" ]] ||
  fail 'The downloaded release is missing required application files.'

if [ -e "$RELEASE_DIR" ]; then
  mv "$RELEASE_DIR" "$PREVIOUS_DIR"
fi
mv "$STAGING_DIR" "$RELEASE_DIR"

echo "[cooder install] Installing Cooder $VERSION from $REPOSITORY…"
COODER_SOURCE_ROOT="$RELEASE_DIR" bash "$RELEASE_DIR/scripts/local/install.sh" "$@"
INSTALL_SUCCEEDED=1
