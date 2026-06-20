#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TOKEN="${CODEX_REMOTE_LOCAL_TOKEN:-example-token}"
PROJECT_ROOT="${CODEX_REMOTE_ALLOWED_PROJECT_ROOT:-$ROOT_DIR}"
WORKER_PORT="${CODEX_REMOTE_WORKER_PORT:-8787}"
CONTROL_PLANE_PORT="${CODEX_REMOTE_CONTROL_PLANE_PORT:-8786}"
APP_SERVER_TRANSPORT="${CODEX_REMOTE_APP_SERVER_TRANSPORT:-stdio}"
CODEX_REMOTE_START_APP_SERVER=true

mkdir -p "$LOG_DIR"

log_status() {
  printf "%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" >>"$LOG_DIR/real-local-stack.log"
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

case "$APP_SERVER_TRANSPORT" in
  stdio)
    echo "real:start using stdio: Worker will start codex app-server over stdio."
    log_status "stdio transport selected"
    ;;
  debug-websocket)
    CODEX_REMOTE_START_APP_SERVER=true
    echo "real:start using debug fallback: Worker will start loopback WebSocket app-server; this is not real stdio readiness evidence."
    log_status "debug-websocket fallback selected"
    ;;
  *)
    echo "real:start blocked: unsupported CODEX_REMOTE_APP_SERVER_TRANSPORT value."
    echo "Supported values: stdio, debug-websocket."
    exit 1
    ;;
esac

start_background() {
  local name="$1"
  local pid_file="$LOG_DIR/$name.pid"
  shift

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file")"
    if is_pid_running "$existing_pid"; then
      echo "$name already running: $existing_pid"
      log_status "$name already running"
      return
    fi
    rm -f "$pid_file"
  fi

  local started_pid
  started_pid="$(
    START_ROOT="$ROOT_DIR" python3 - "$@" <<'PY'
import os
import subprocess
import sys

process = subprocess.Popen(
    sys.argv[1:],
    cwd=os.environ["START_ROOT"],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    start_new_session=True,
)
print(process.pid)
PY
  )"
  echo "$started_pid" >"$pid_file"
  echo "$name started: $started_pid"
  log_status "$name started"
}

start_background worker env \
  CODEX_REMOTE_WORKER_TOKEN="$TOKEN" \
  CODEX_REMOTE_ALLOWED_ORIGINS="http://127.0.0.1:$CONTROL_PLANE_PORT" \
  CODEX_REMOTE_ALLOWED_PROJECT_ROOT="$PROJECT_ROOT" \
  CODEX_REMOTE_DEVICE_ID="local-device" \
  CODEX_REMOTE_HTTP_PORT="$WORKER_PORT" \
  CODEX_REMOTE_APP_SERVER_TRANSPORT="$APP_SERVER_TRANSPORT" \
  CODEX_REMOTE_START_APP_SERVER="$CODEX_REMOTE_START_APP_SERVER" \
  pnpm --filter @codex-remote/worker serve:read

start_background control-plane env \
  CODEX_REMOTE_CONTROL_PLANE_CONFIG="{\"publicToken\":\"$TOKEN\",\"taskDatabasePath\":\"$LOG_DIR/codex-remote-tasks.sqlite\",\"devices\":[{\"id\":\"local-device\",\"name\":\"Local Device\",\"baseUrl\":\"http://127.0.0.1:$WORKER_PORT\",\"token\":\"$TOKEN\"}]}" \
  pnpm --filter @codex-remote/control-plane serve

NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL="http://127.0.0.1:$CONTROL_PLANE_PORT" \
NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN="$TOKEN" \
pnpm web:start
