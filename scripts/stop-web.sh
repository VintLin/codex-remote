#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/web-dev.pid"
PORT="5173"

find_port_pids() {
  lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || true
}

stopped=0

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE")"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    echo "Stopped web dev server PID $pid."
    stopped=1
  fi
  rm -f "$PID_FILE"
fi

port_pids="$(find_port_pids)"
if [[ -n "${port_pids:-}" ]]; then
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    echo "Stopped process on port $PORT: PID $pid."
    stopped=1
  done <<<"$port_pids"
fi

if [[ "$stopped" -eq 0 ]]; then
  echo "No web dev server was running."
fi
