#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/web-dev.pid"
LOG_FILE="$LOG_DIR/web-dev.log"
PORT="5173"
HOST="127.0.0.1"
READY_TIMEOUT="20"

mkdir -p "$LOG_DIR"

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

find_port_pid() {
  lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null | head -n 1
}

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE")"
  if [[ -n "${existing_pid:-}" ]] && is_pid_running "$existing_pid"; then
    echo "Web dev server is already running."
    echo "PID: $existing_pid"
    echo "URL: http://$HOST:$PORT"
    exit 0
  fi

  rm -f "$PID_FILE"
fi

port_pid="$(find_port_pid || true)"
if [[ -n "${port_pid:-}" ]]; then
  echo "Port $PORT is already in use by PID $port_pid."
  echo "Run scripts/stop-web.sh first, or stop that process manually."
  exit 1
fi

launcher_pid="$(ROOT_DIR="$ROOT_DIR" APP_DIR="$APP_DIR" LOG_FILE="$LOG_FILE" python3 - <<'PY'
import os
import subprocess

app_dir = os.environ["APP_DIR"]
log_file = os.environ["LOG_FILE"]

with open(log_file, "ab", buffering=0) as log:
    process = subprocess.Popen(
        ["bash", "-lc", "pnpm build && exec pnpm start"],
        cwd=app_dir,
        env=os.environ.copy(),
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    print(process.pid)
PY
)"
echo "$launcher_pid" >"$PID_FILE"

elapsed=0
while (( elapsed < READY_TIMEOUT )); do
  if ! is_pid_running "$launcher_pid"; then
    echo "Web dev server exited before becoming ready. Check $LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
  fi

  port_pid="$(find_port_pid || true)"
  if [[ -n "${port_pid:-}" ]]; then
    echo "$port_pid" >"$PID_FILE"
    echo "Web dev server started."
    echo "PID: $port_pid"
    echo "URL: http://$HOST:$PORT"
    echo "Log: $LOG_FILE"
    exit 0
  fi

  sleep 1
  elapsed=$((elapsed + 1))
done

echo "Timed out waiting for web dev server to listen on $HOST:$PORT. Check $LOG_FILE"
rm -f "$PID_FILE"
exit 1
