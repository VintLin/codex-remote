#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/web-dev.pid"
LOG_FILE="$LOG_DIR/web-dev.log"
PORT="5173"
HOST="127.0.0.1"

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

find_port_pids() {
  lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || true
}

print_recent_log() {
  if [[ -f "$LOG_FILE" ]]; then
    echo "Recent log:"
    tail -n 20 "$LOG_FILE"
  else
    echo "Recent log: none"
  fi
}

pid_file_value=""
if [[ -f "$PID_FILE" ]]; then
  pid_file_value="$(cat "$PID_FILE")"
  if [[ -n "${pid_file_value:-}" ]] && ! is_pid_running "$pid_file_value"; then
    rm -f "$PID_FILE"
    pid_file_value=""
  fi
fi

port_pids="$(find_port_pids)"

if [[ -z "${pid_file_value:-}" && -z "${port_pids:-}" ]]; then
  echo "Web server status: stopped"
  echo "URL: http://$HOST:$PORT"
  echo "PID file: none"
  echo "Listening PID: none"
  print_recent_log
  exit 0
fi

echo "Web server status: running"
echo "URL: http://$HOST:$PORT"
echo "PID file: ${pid_file_value:-none}"

if [[ -n "${port_pids:-}" ]]; then
  echo "Listening PID(s):"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    ps -p "$pid" -o pid=,ppid=,command=
  done <<<"$port_pids"
else
  echo "Listening PID(s): none"
fi

echo "Log file: $LOG_FILE"
print_recent_log
