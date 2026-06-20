#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
WEB_PORT="${CODEX_REMOTE_WEB_PORT:-5173}"
CONTROL_PLANE_PORT="${CODEX_REMOTE_CONTROL_PLANE_PORT:-8786}"
WORKER_PORT="${CODEX_REMOTE_WORKER_PORT:-8787}"

for name in worker control-plane web-dev; do
  pid_file="$LOG_DIR/$name.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1; then
    echo "$name: running pid=$(cat "$pid_file")"
  else
    echo "$name: stopped"
  fi
done

for port in "$WEB_PORT" "$CONTROL_PLANE_PORT" "$WORKER_PORT"; do
  printf ":%s " "$port"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true
done
