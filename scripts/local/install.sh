#!/usr/bin/env bash
# Install Cooder's primary product: a local backend, local SQLite data, and its web UI.
set -euo pipefail
umask 077

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$SCRIPT_ROOT"
REAL_HOME="${HOME}"
COODER_HOME="${COODER_HOME:-$REAL_HOME/.local/share/cooder}"
SOURCE_ROOT="${COODER_SOURCE_ROOT:-$SCRIPT_ROOT}"
SKIP_CLIS=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --cooder-home) COODER_HOME="$2"; shift 2 ;;
    --skip-clis) SKIP_CLIS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      echo 'Usage: cooder install [--cooder-home DIR] [--skip-clis] [--dry-run]'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

COODER_HOME="$(mkdir -p "$COODER_HOME" && cd "$COODER_HOME" && pwd)"
CLI_PREFIX="$COODER_HOME/cli"
USER_HOME="$COODER_HOME/home"
DATA_DIR="$COODER_HOME/data"
ENV_FILE="$REAL_HOME/.cooder/config.toml"

fail() { echo "[cooder install] $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Missing prerequisite: $1"; }

need git
need openssl
need curl

SOURCE_ROOT="$(cd "$SOURCE_ROOT" 2>/dev/null && pwd)" || fail "Cooder source checkout was not found. Run this installer from the project checkout."
[[ -f "$SOURCE_ROOT/package.json" && -f "$SOURCE_ROOT/packages/backend/dist/index.js" && -f "$SOURCE_ROOT/packages/backend/dist/db/schema.sqlite.sql" && -f "$SOURCE_ROOT/packages/frontend/dist/index.html" ]] || fail "Compiled Cooder release is missing. Build and package the project first; the installer does not compile it."

if [ "$DRY_RUN" -eq 1 ]; then
  printf 'Cooder local install plan\n  source: %s\n  home: %s\n  Node.js: isolated v%s\n  database: %s/data/cooder.db\n  first admin: prompted during install\n' \
    "$SOURCE_ROOT" "$COODER_HOME" "${COODER_NODE_VERSION:-24.13.0}" "$COODER_HOME"
  exit 0
fi

mkdir -p "$COODER_HOME/runtime" "$CLI_PREFIX/bin" "$USER_HOME" "$DATA_DIR" "$REAL_HOME/.local/bin"
chmod 700 "$COODER_HOME" "$USER_HOME" "$DATA_DIR"

APP_DIR="$COODER_HOME/app"
RUN_PID_FILE="$COODER_HOME/run/cooder.pid"
WAS_RUNNING=0
if [ -f "$RUN_PID_FILE" ]; then
  old_pid="$(cat "$RUN_PID_FILE")"
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    old_command="$(ps -p "$old_pid" -o args= 2>/dev/null || true)"
    if [[ "$old_command" == *"$APP_DIR/packages/backend/dist/index.js"* ]]; then
      WAS_RUNNING=1
    fi
  fi
fi

NODE_VERSION="${COODER_NODE_VERSION:-24.13.0}"
NODE_ARCH="$(uname -m)"
case "$NODE_ARCH" in
  x86_64|amd64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) fail "Unsupported CPU architecture for bundled Node.js: $NODE_ARCH" ;;
esac
case "$(uname -s)" in
  Linux) NODE_OS=linux ;;
  Darwin) NODE_OS=darwin ;;
  *) fail "Unsupported operating system: $(uname -s)" ;;
esac
NODE_DIR="$COODER_HOME/runtime/node"
NODE_BIN="$NODE_DIR/bin/node"
if [ ! -x "$NODE_BIN" ] || [ "$("$NODE_BIN" --version 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
  rm -rf "$NODE_DIR"
  ARCHIVE="node-v$NODE_VERSION-$NODE_OS-$NODE_ARCH.tar.xz"
  DOWNLOAD="$COODER_HOME/runtime/$ARCHIVE"
  echo "[cooder install] Downloading isolated Node.js v$NODE_VERSION ($NODE_OS-$NODE_ARCH)…"
  curl -fL --retry 3 "https://nodejs.org/dist/v$NODE_VERSION/$ARCHIVE" -o "$DOWNLOAD"
  mkdir -p "$COODER_HOME/runtime/extract"
  tar -xJf "$DOWNLOAD" -C "$COODER_HOME/runtime/extract"
  mv "$COODER_HOME/runtime/extract/node-v$NODE_VERSION-$NODE_OS-$NODE_ARCH" "$NODE_DIR"
  rmdir "$COODER_HOME/runtime/extract"
  rm -f "$DOWNLOAD"
fi
[ -x "$NODE_BIN" ] || fail "Node.js runtime installation failed: $NODE_BIN"
export PATH="$NODE_DIR/bin:$PATH"
export COODER_NODE_BIN="$NODE_BIN"
"$NODE_BIN" -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 24) { console.error(`Cooder requires Node.js 24 or newer (found ${process.version}).`); process.exit(1); }'
COREPACK="$NODE_DIR/bin/corepack"
[ -x "$COREPACK" ] || fail "Corepack was not found in the bundled Node.js runtime: $COREPACK"
PNPM_WRAPPER="$COODER_HOME/runtime/bin/pnpm"
mkdir -p "$COODER_HOME/runtime/bin"
cat > "$PNPM_WRAPPER" <<EOF
#!/usr/bin/env bash
export PATH="$NODE_DIR/bin:$COODER_HOME/runtime/tools/bin:$CLI_PREFIX/bin:\$PATH"
export COREPACK_HOME="$COODER_HOME/runtime/corepack"
export PNPM_HOME="$CLI_PREFIX/bin"
export npm_config_store_dir="$COODER_HOME/runtime/pnpm-store"
exec "$COREPACK" pnpm@9.15.0 "\$@"
EOF
chmod 700 "$PNPM_WRAPPER"
PNPM_BIN="$PNPM_WRAPPER"

set_env() {
  local key="$1" value="$2" tmp="${ENV_FILE}.tmp.$$"
  mkdir -p "$REAL_HOME/.cooder"
  chmod 700 "$REAL_HOME/.cooder"
  touch "$ENV_FILE"
  awk -F= -v key="$key" '$1 !~ "^" key "[[:space:]]*$" { print }' "$ENV_FILE" > "$tmp"
  printf '%s = "%s"\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

get_env() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    awk -F= -v key="$key" '$1 ~ "^" key "[[:space:]]*$" { value=$2; gsub(/^[[:space:]\"]+|[[:space:]\"]+$/, "", value) } END { print value }' "$ENV_FILE"
  fi
}

if [ ! -f "$ENV_FILE" ] && [ -f "$COODER_HOME/.env.local" ]; then
  for key in SESSION_SECRET JWT_SECRET ENCRYPTION_KEY WEBUI_HOOK_SECRET PORT AUTH_ALLOWED_EMAILS; do
    old_value="$(awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=")+1) }' "$COODER_HOME/.env.local")"
    [ -z "$old_value" ] || set_env "$key" "$old_value"
  done
fi

if [ -z "$(get_env SESSION_SECRET)" ]; then set_env SESSION_SECRET "$(openssl rand -hex 32)"; fi
if [ -z "$(get_env JWT_SECRET)" ]; then set_env JWT_SECRET "$(openssl rand -hex 32)"; fi
if [ -z "$(get_env ENCRYPTION_KEY)" ]; then set_env ENCRYPTION_KEY "$(openssl rand -hex 32)"; fi
if [ -z "$(get_env WEBUI_HOOK_SECRET)" ]; then set_env WEBUI_HOOK_SECRET "$(openssl rand -hex 32)"; fi
export SESSION_SECRET="$(get_env SESSION_SECRET)"
export JWT_SECRET="$(get_env JWT_SECRET)"

[ -n "$(get_env PORT)" ] || set_env PORT 3001
if [ -z "$(get_env BACKEND_URL)" ]; then set_env BACKEND_URL "http://127.0.0.1:$(get_env PORT)"; fi

if [ "$WAS_RUNNING" -eq 1 ]; then
  echo '[cooder install] Stopping the running Cooder service…'
  COODER_HOME="$COODER_HOME" COODER_APP_DIR="$APP_DIR" \
    "$NODE_BIN" "$SOURCE_ROOT/scripts/cooder.mjs" stop
fi

echo '[cooder install] Installing the compiled Cooder release…'
mkdir -p "$APP_DIR/packages/backend" "$APP_DIR/packages/frontend" "$APP_DIR/packages/shared"
cp -R "$SOURCE_ROOT/packages/backend/dist" "$APP_DIR/packages/backend/"
cp -R "$SOURCE_ROOT/packages/frontend/dist" "$APP_DIR/packages/frontend/"
cp "$SOURCE_ROOT/packages/shared/package.json" "$APP_DIR/packages/shared/package.json"
cp -R "$SOURCE_ROOT/packages/shared/dist" "$APP_DIR/packages/shared/"
"$NODE_BIN" - "$SOURCE_ROOT/packages/backend/package.json" "$APP_DIR/package.json" <<'NODE'
const fs = require('node:fs');
const backend = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pkg = {
  name: 'cooder-runtime',
  private: true,
  type: 'module',
  dependencies: { ...backend.dependencies, '@plum-code-webui/shared': 'file:./packages/shared' },
};
fs.writeFileSync(process.argv[3], JSON.stringify(pkg, null, 2) + '\n');
NODE
cd "$APP_DIR"
"$PNPM_BIN" install --prod --no-frozen-lockfile

if [ "$SKIP_CLIS" -eq 0 ]; then
  CODEX_VERSION="$(sed -n 's/^ARG CODEX_VERSION=//p' "$SOURCE_ROOT/Dockerfile" | head -n1)"
  [ -n "$CODEX_VERSION" ] || fail 'Could not read CODEX_VERSION from Dockerfile'
  echo "[cooder install] Installing Codex under $CLI_PREFIX (isolated from system CLIs)…"
  "$PNPM_BIN" add --global --global-dir "$CLI_PREFIX/global" "@openai/codex@$CODEX_VERSION"
fi

export COODER_APP_DIR="$APP_DIR"
export COODER_HOME
export COODER_DB_DRIVER=sqlite
export COODER_DATABASE_PATH="$DATA_DIR/cooder.db"
export CODEX_HOME="$USER_HOME/.codex"
export WEBUI_DATA_DIR="$DATA_DIR"
"$NODE_BIN" "$APP_DIR/packages/backend/dist/db/migrate.js"

ACCOUNT_STATE="$(COODER_CHECK_FIRST_USER=1 "$NODE_BIN" "$APP_DIR/packages/backend/dist/db/createLocalUser.js" | tail -n1)"
if [ "$ACCOUNT_STATE" = EMPTY ]; then
  echo
  read -r -p 'Administrator email: ' ADMIN_EMAIL
  [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fail 'Enter a valid email address.'
  read -r -s -p 'Administrator password (at least 10 characters): ' ADMIN_PASSWORD; echo
  [ "${#ADMIN_PASSWORD}" -ge 10 ] || fail 'Password must contain at least 10 characters.'
  read -r -s -p 'Confirm password: ' ADMIN_PASSWORD_CONFIRM; echo
  [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ] || fail 'Passwords do not match.'
  export COODER_INITIAL_EMAIL="$ADMIN_EMAIL"
  export COODER_INITIAL_PASSWORD="$ADMIN_PASSWORD"
  "$NODE_BIN" "$APP_DIR/packages/backend/dist/db/createLocalUser.js"
  unset COODER_INITIAL_EMAIL COODER_INITIAL_PASSWORD ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM
  set_env AUTH_ALLOWED_EMAILS "$ADMIN_EMAIL"
fi

if [ "$SKIP_CLIS" -eq 0 ]; then
  if [ ! -x "$CLI_PREFIX/bin/codex" ]; then
    fail "Codex installation did not create $CLI_PREFIX/bin/codex"
  fi
fi

mkdir -p "$COODER_HOME/bin"
cp "$SOURCE_ROOT/scripts/cooder.mjs" "$COODER_HOME/bin/cooder.mjs"
mkdir -p "$COODER_HOME/scripts/local"
cp "$SOURCE_ROOT/scripts/local/install.sh" "$COODER_HOME/scripts/local/install.sh"
cp "$SOURCE_ROOT/scripts/local/install-remote.sh" "$COODER_HOME/scripts/local/install-remote.sh"
cat > "$COODER_HOME/bin/cooder" <<EOF
#!/usr/bin/env bash
export COODER_HOME="$COODER_HOME"
export COODER_APP_DIR="$APP_DIR"
exec "$NODE_BIN" "$COODER_HOME/bin/cooder.mjs" "\$@"
EOF
chmod 700 "$COODER_HOME/bin/cooder"
ln -sfn "$COODER_HOME/bin/cooder" "$REAL_HOME/.local/bin/cooder"

if [ -n "$REAL_HOME" ] && [ "$REAL_HOME" != "$USER_HOME" ]; then
  if [ -f "$REAL_HOME/.claude/.credentials.json" ] && [ ! -e "$USER_HOME/.claude/.credentials.json" ]; then
    mkdir -p "$USER_HOME/.claude"
    ln -sfn "$REAL_HOME/.claude/.credentials.json" "$USER_HOME/.claude/.credentials.json"
  fi
  if [ -f "$REAL_HOME/.codex/auth.json" ] && [ ! -e "$USER_HOME/.codex/auth.json" ]; then
    mkdir -p "$USER_HOME/.codex"
    ln -sfn "$REAL_HOME/.codex/auth.json" "$USER_HOME/.codex/auth.json"
  fi
fi

if [ "$WAS_RUNNING" -eq 1 ]; then
  echo '[cooder install] Starting the updated Cooder service…'
  "$COODER_HOME/bin/cooder" start
fi

cat <<EOF

 Cooder's local web product is installed.
  Start in background:  cooder start
  Open the web app:     cooder web
  Terminal status:      cooder status
  Follow logs:          cooder logs
  Stop:                 cooder stop
  Database:             $DATA_DIR/cooder.db
  Command:              $COODER_HOME/bin/cooder

If 'cooder' is not found, add ~/.local/bin to PATH, then run 'cooder web'.
EOF
