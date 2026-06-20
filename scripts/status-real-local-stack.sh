#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"

for name in worker control-plane web-dev; do
  pid_file="$LOG_DIR/$name.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1; then
    echo "$name: running pid=$(cat "$pid_file")"
  else
    echo "$name: stopped"
  fi
done

for port in 5173 8786 8787; do
  printf ":%s " "$port"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true
done
