#!/usr/bin/env bash
# PROCity launcher — starts the backend, opens an app window, cleans up on exit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
PYTHON="$BACKEND/.venv/bin/python"

PORT="${PROCITY_PORT:-8901}"
URL="http://127.0.0.1:$PORT/"
DEMO_FLAG=()
for arg in "$@"; do
  case "$arg" in
    --demo) DEMO_FLAG=(PROCITY_DEMO=1) ;;
    *) echo "Unknown option: $arg (supported: --demo)" >&2; exit 1 ;;
  esac
done

say() { printf '\033[36m[procity]\033[0m %s\n' "$*"; }

if [ ! -x "$PYTHON" ]; then
  echo "Backend virtualenv missing. Run scripts/install.sh first." >&2
  exit 1
fi
if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "Frontend build missing. Run scripts/install.sh (or: cd frontend && npm run build)." >&2
  exit 1
fi

say "Starting backend on 127.0.0.1:$PORT …"
cd "$BACKEND"
env PROCITY_PORT="$PORT" "${DEMO_FLAG[@]}" "$PYTHON" -m uvicorn main:app \
  --host 127.0.0.1 --port "$PORT" --log-level warning &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null; wait "$BACKEND_PID" 2>/dev/null; say "PROCity stopped."' EXIT

# Wait for the API to come up.
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
if ! curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "Backend failed to start." >&2; exit 1
fi
say "Backend ready."

# Open a standalone app window (no tabs / browser chrome).
BROWSER_PID=""
for b in chromium chromium-browser google-chrome-stable google-chrome brave vivaldi-stable vivaldi microsoft-edge-stable; do
  if command -v "$b" >/dev/null 2>&1; then
    "$b" --app="$URL" >/dev/null 2>&1 &
    BROWSER_PID=$!
    say "Opened app window with $b."
    break
  fi
done
if [ -z "$BROWSER_PID" ]; then
  if command -v firefox >/dev/null 2>&1; then
    firefox --new-window "$URL" >/dev/null 2>&1 &
    BROWSER_PID=$!
    say "Opened window with firefox (no kiosk mode available)."
  else
    command -v xdg-open >/dev/null 2>&1 && { xdg-open "$URL" >/dev/null 2>&1 & BROWSER_PID=$!; say "Opened default browser."; } || true
  fi
fi

if [ -n "$BROWSER_PID" ]; then
  sleep 3
  if ! kill -0 "$BROWSER_PID" 2>/dev/null; then
    say "Browser handed off to an existing instance — PROCity keeps running here."
    say "Press Ctrl+C to stop PROCity."
    wait
  else
    say "PROCity running. Close the app window (or press Ctrl+C here) to stop."
    wait "$BROWSER_PID"
  fi
else
  say "No browser found — PROCity is serving at $URL"
  say "Press Ctrl+C to stop PROCity."
  wait "$BACKEND_PID"
fi
