#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"

pnpm web:stop >/dev/null 2>&1 || true

for name in control-plane worker; do
  pid_file="$LOG_DIR/$name.pid"
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid"
      echo "$name stopped: $pid"
    fi
    rm -f "$pid_file"
  fi
done
