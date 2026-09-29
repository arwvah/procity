# PROCITY — Live 3D Linux Process Visualization

A real-time system-monitoring app for Omarchy Linux (Arch + Hyprland): every running
process is a skyscraper in a neon cyberpunk city. Building **height** = memory (RSS),
building **color** = CPU usage, all driven by live `psutil` data over a local
WebSocket. Not a mockup — actual PIDs, actual usage, updating every second.

![stack](https://img.shields.io/badge/Three.js-Vite-TypeScript-blue) ![backend](https://img.shields.io/badge/FastAPI-psutil-asyncio-green)

## Features

- **Live 3D city** — one InstancedMesh, one draw call for up to ~1000+ buildings
- **Process mapping** — stable identity (`pid:create_time`, PID-recycling safe),
  stable slot per process, smooth height/color interpolation, spawn/despawn animations
- **HUD** — CPU (with per-core bars), RAM, swap, GPU (NVIDIA via pynvml/nvidia-smi
  with graceful fallback), process count, uptime, truncation notice
- **Details panel** — click a building: name, PID, PPID, user, status, CPU, memory,
  threads, start time, command line; Focus Camera button
- **Search** — by name, PID, or username; flies to + highlights the building
- **Filters** — All / High CPU / High Mem / User / System (dims non-matching),
  sort by CPU or memory, Top Processes list
- **Camera** — drag rotate, scroll zoom, right-drag pan, double-click focus,
  reset button, smooth tweened transitions
- **Modes** — Live, Overview, Focus, Resource (height metric: MEM/CPU/THREADS),
  Demo (synthetic data, clearly labeled, auto-engages when backend is unreachable)
- **Security** — localhost-only binding, no sudo, no process killing/modification,
  no process memory inspection, validated API inputs, auto-reconnect

## Layout

```
backend/    FastAPI + psutil monitor + GPU fallback (+ tests)
frontend/   Three.js city + HUD/panels (TypeScript, Vite)
scripts/    install.sh / run.sh / uninstall.sh
hyprland/   optional Hyprland window rules
```

## Install (Omarchy / Arch)

```bash
cd "/home/arwah/Projects/Linux Process City"
scripts/install.sh
```

Checks python3/node/npm, creates `backend/.venv`, installs backend deps
(fastapi, uvicorn, psutil, nvidia-ml-py, pydantic), installs frontend deps
(three, typescript, vite, vitest), builds the production frontend, and installs
a `procity` launcher into `~/.local/bin`.

## Run

```bash
scripts/run.sh            # live mode, opens a standalone app window
scripts/run.sh --demo     # demo mode (synthetic data)
```

Or manually:

```bash
cd backend && .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8901
# open http://127.0.0.1:8901/
```

Press Ctrl+C (or close the app window) to stop; the backend shuts down cleanly.

## Environment variables

| Variable           | Default | Meaning                              |
|--------------------|---------|--------------------------------------|
| `PROCITY_PORT`     | `8901`  | HTTP/WS port (localhost only)        |
| `PROCITY_INTERVAL` | `1.0`   | Monitoring update interval (seconds) |
| `PROCITY_MAX`      | `1000`  | Max buildings shown (top by CPU+RAM) |
| `PROCITY_DEMO`     | `0`     | `1` = serve synthetic demo data      |

## Hyprland integration (optional)

Copy the rules from `hyprland/procity.conf` into your `hyprland.conf` for a
dedicated floating/fullscreen window. Nothing is modified automatically.

## Tests

```bash
backend/.venv/bin/python -m pytest backend/tests -q   # backend: 21 tests
cd frontend && npm test                               # frontend logic: 19 tests
```

## Known limitations

- Other users' processes may show limited fields (cmdline/username) without root —
  by design; the app never requires sudo.
- The run script detects app-window close via the browser process; if the window
  hands off to an already-running browser instance, stop PROCity with Ctrl+C.
- Rendering verified via headless-browser screenshot + API/WS checks in CLI;
  interactive picking/camera behavior was verified in the desktop environment.
