#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COODER_HOME="${COODER_HOME:-$HOME/.local/share/cooder}"
COODER_APP_DIR="${COODER_APP_DIR:-$COODER_HOME/app}"
ENV_FILE="$HOME/.cooder/config.toml"
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# || ! "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key//[[:space:]]/}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    if [ -z "${!key+x}" ]; then export "$key=$value"; fi
  done < "$ENV_FILE"
fi
COODER_HOME="${COODER_HOME:-$HOME/.local/share/cooder}"
COODER_APP_DIR="${COODER_APP_DIR:-$COODER_HOME/app}"
COODER_NODE_BIN="${COODER_NODE_BIN:-$COODER_HOME/runtime/node/bin/node}"
[[ -x "$COODER_NODE_BIN" ]] || { echo "Cooder Node runtime missing. Run: pnpm cooder:install" >&2; exit 1; }
export COODER_HOME COODER_APP_DIR COODER_NODE_BIN
export PATH="$COODER_HOME/runtime/bin:$COODER_HOME/runtime/node/bin:$COODER_HOME/runtime/tools/bin:$COODER_HOME/cli/bin:$PATH"
exec "$COODER_NODE_BIN" "$SOURCE_ROOT/scripts/cooder.mjs" "$@"
