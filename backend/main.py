"""PROCity backend — FastAPI REST + WebSocket server bound to localhost.

Run (from backend/):  python -m uvicorn main:app --host 127.0.0.1 --port 8901
Environment:
  PROCITY_PORT     default 8901
  PROCITY_INTERVAL monitoring interval seconds, default 1.0
  PROCITY_MAX      max buildings shown, default 1000
  PROCITY_DEMO     "1" to serve synthetic demo data
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from monitor import ProcessMonitor
from models import ProcessInfo, Snapshot, SystemStats

DEMO = os.environ.get("PROCITY_DEMO", "0") == "1"
PORT = int(os.environ.get("PROCITY_PORT", "8901"))
INTERVAL = float(os.environ.get("PROCITY_INTERVAL", "1.0"))
MAX_PROC = int(os.environ.get("PROCITY_MAX", "1000"))

app = FastAPI(title="PROCity API", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

monitor = ProcessMonitor(interval=INTERVAL, max_processes=MAX_PROC, demo=DEMO)


@app.on_event("startup")
async def _startup() -> None:
    # Warm up so the very first REST/WS response has real CPU values.
    await asyncio.to_thread(monitor.snapshot)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "demo": monitor.demo, "version": "1.0.0"}


@app.get("/api/snapshot", response_model=Snapshot)
async def snapshot() -> dict:
    return await asyncio.to_thread(monitor.snapshot)


@app.get("/api/processes")
async def processes() -> dict:
    snap = await asyncio.to_thread(monitor.snapshot)
    return {
        "processes": snap["processes"],
        "truncated": snap["truncated"],
        "total_processes": snap["total_processes"],
        "display_limit": snap["display_limit"],
        "demo": snap["demo"],
    }


@app.get("/api/processes/{pid}", response_model=ProcessInfo)
async def process_detail(
    pid: int,
    create_time: Optional[float] = Query(default=None, ge=0.0),
) -> dict:
    if pid < 1:
        raise HTTPException(status_code=422, detail="pid out of range")
    info = await asyncio.to_thread(monitor.find_process, pid, create_time)
    if info is None:
        raise HTTPException(status_code=404, detail="process not found (exited or pid recycled)")
    return info


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            snap = await asyncio.to_thread(monitor.snapshot)
            await ws.send_json(snap)
            await asyncio.sleep(monitor.interval)
    except (WebSocketDisconnect, RuntimeError, ConnectionError):
        return


# Serve the built frontend (production mode) if present.
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if (_DIST / "index.html").is_file():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="app")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
