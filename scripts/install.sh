#!/usr/bin/env bash
# PROCity installer — checks dependencies, creates the venv, builds the frontend.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

say()  { printf '\033[36m[procity]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[procity]\033[0m %s\n' "$*" >&2; }

MISSING=0

command -v python3 >/dev/null 2>&1 || { err "python3 not found. On Omarchy/Arch: sudo pacman -S python"; MISSING=1; }
command -v node    >/dev/null 2>&1 || { err "node not found.    On Omarchy/Arch: sudo pacman -S nodejs npm"; MISSING=1; }
command -v npm    >/dev/null 2>&1 || { err "npm not found.    On Omarchy/Arch: sudo pacman -S npm"; MISSING=1; }

if [ "$MISSING" -ne 0 ]; then
  err "Install the missing dependencies above, then re-run scripts/install.sh"
  exit 1
fi

say "Python3 $(python3 --version | cut -d' ' -f2), Node $(node --version) found."

say "Creating Python virtual environment…"
python3 -m venv "$BACKEND/.venv"

say "Installing backend dependencies…"
"$BACKEND/.venv/bin/pip" install --quiet --upgrade pip
"$BACKEND/.venv/bin/pip" install --quiet -r "$BACKEND/requirements.txt"

say "Installing frontend dependencies…"
(cd "$FRONTEND" && npm install --no-fund --no-audit)

say "Building production frontend…"
(cd "$FRONTEND" && npm run build)

chmod +x "$ROOT/scripts/run.sh" "$ROOT/scripts/uninstall.sh"

# Optional convenience launcher on PATH.
LAUNCH_DIR="$HOME/.local/bin"
mkdir -p "$LAUNCH_DIR"
ln -sf "$ROOT/scripts/run.sh" "$LAUNCH_DIR/procity"
say "Launcher installed: ~/.local/bin/procity"

say "Install complete. Start PROCity with: scripts/run.sh   (or: procity)"
say "Demo mode (no real process data):    scripts/run.sh --demo"
