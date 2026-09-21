#!/bin/sh
# Spawn boundary for hosts that start MCP with a stripped PATH.
# Cursor launched from the Dock has /usr/bin:/bin only, so `node` is ENOENT
# even when Homebrew, nvm, or fnm installed it. /bin/sh is always there.
# This script finds Node >= 18, puts that bin (and the usual prefix bins)
# on PATH so later git/gh lookups work, then execs review-state.mjs.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

prepend_path() {
  dir=$1
  [ -d "$dir" ] || return 0
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) PATH="$dir${PATH:+:$PATH}" ;;
  esac
}

home=${HOME:-}
prepend_path /opt/homebrew/bin
prepend_path /usr/local/bin
prepend_path "$home/.local/bin"
prepend_path "$home/.volta/bin"
prepend_path "${ASDF_DATA_DIR:-$home/.asdf}/shims"
prepend_path "$home/.local/share/mise/shims"
prepend_path "$home/.fnm/aliases/default/bin"
prepend_path "$home/Library/Application Support/fnm/aliases/default/bin"
prepend_path "$home/.local/share/fnm/aliases/default/bin"

export PATH

NODE=""
if command -v node >/dev/null 2>&1; then
  NODE=$(command -v node)
fi

if [ -z "$NODE" ]; then
  nvm_root="${NVM_DIR:-$home/.nvm}/versions/node"
  if [ -d "$nvm_root" ]; then
    best_key=""
    for dir in "$nvm_root"/*; do
      [ -x "$dir/bin/node" ] || continue
      ver=$(basename "$dir")
      ver=${ver#v}
      key=$(printf '%s\n' "$ver" | awk -F. '{ printf "%05d%05d%05d\n", $1+0, $2+0, $3+0 }')
      if [ -z "$best_key" ]; then
        best_key=$key
        NODE="$dir/bin/node"
      else
        winner=$(printf '%s\n%s\n' "$best_key" "$key" | sort | tail -n 1)
        if [ "$winner" = "$key" ]; then
          best_key=$key
          NODE="$dir/bin/node"
        fi
      fi
    done
  fi
fi

if [ -z "$NODE" ]; then
  for candidate in \
    "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node" \
    "$home/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node" \
    "/usr/share/cursor/resources/app/resources/helpers/node" \
    "/usr/lib/cursor/resources/app/resources/helpers/node"
  do
    if [ -x "$candidate" ]; then
      NODE=$candidate
      break
    fi
  done
fi

if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "kstack: node not found. Install Node.js 18+ or put it on PATH." >&2
  exit 127
fi

prepend_path "$(dirname "$NODE")"
export PATH

exec "$NODE" "$ROOT/review-state.mjs" "$@"
