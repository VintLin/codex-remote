#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TOKEN="${CODEX_REMOTE_LOCAL_TOKEN:-example-token}"
PROJECT_ROOT="${CODEX_REMOTE_ALLOWED_PROJECT_ROOT:-$ROOT_DIR}"
WORKER_PORT="${CODEX_REMOTE_WORKER_PORT:-8787}"
CONTROL_PLANE_PORT="${CODEX_REMOTE_CONTROL_PLANE_PORT:-8786}"

mkdir -p "$LOG_DIR"

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

start_background() {
  local name="$1"
  local pid_file="$LOG_DIR/$name.pid"
  shift

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file")"
    if is_pid_running "$existing_pid"; then
      echo "$name already running: $existing_pid"
      return
    fi
    rm -f "$pid_file"
  fi

  (cd "$ROOT_DIR" && "$@" >"$LOG_DIR/$name.log" 2>&1 & echo $! >"$pid_file")
  echo "$name started: $(cat "$pid_file")"
}

start_background worker env \
  CODEX_REMOTE_WORKER_TOKEN="$TOKEN" \
  CODEX_REMOTE_ALLOWED_ORIGINS="http://127.0.0.1:$CONTROL_PLANE_PORT" \
  CODEX_REMOTE_ALLOWED_PROJECT_ROOT="$PROJECT_ROOT" \
  CODEX_REMOTE_DEVICE_ID="local-device" \
  CODEX_REMOTE_HTTP_PORT="$WORKER_PORT" \
  CODEX_REMOTE_APP_SERVER_TRANSPORT="${CODEX_REMOTE_APP_SERVER_TRANSPORT:-stdio}" \
  CODEX_REMOTE_START_APP_SERVER=true \
  pnpm --filter @codex-remote/worker serve:read

start_background control-plane env \
  CODEX_REMOTE_CONTROL_PLANE_CONFIG="{\"publicToken\":\"$TOKEN\",\"taskDatabasePath\":\"$LOG_DIR/codex-remote-tasks.sqlite\",\"devices\":[{\"id\":\"local-device\",\"name\":\"Local Device\",\"baseUrl\":\"http://127.0.0.1:$WORKER_PORT\",\"token\":\"$TOKEN\"}]}" \
  pnpm --filter @codex-remote/control-plane serve

NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL="http://127.0.0.1:$CONTROL_PLANE_PORT" \
NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN="$TOKEN" \
pnpm web:start
