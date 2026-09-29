"""NVIDIA GPU statistics with graceful fallback.

Tries, in order:
  1. pynvml (nvidia-ml-py package)
  2. `nvidia-smi` CLI parsing
  3. Returns None (no GPU data) without ever raising to the caller.
"""
from __future__ import annotations

import threading
import time
from typing import Optional

_lock = threading.Lock()
_cache: tuple[float, Optional[dict]] = (0.0, None)
_CACHE_TTL = 2.0


def _via_pynvml() -> Optional[dict]:
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        try:
            if pynvml.nvmlDeviceGetCount() < 1:
                return None
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            try:
                power = float(pynvml.nvmlDeviceGetPowerUsage(handle)) / 1000.0
            except Exception:
                power = 0.0
            try:
                name = pynvml.nvmlDeviceGetName(handle)
                name = name.decode() if isinstance(name, bytes) else str(name)
            except Exception:
                name = ""
            return {
                "utilization": float(util.gpu),
                "mem_used_mb": mem.used / (1024 * 1024),
                "mem_total_mb": mem.total / (1024 * 1024),
                "temperature_c": float(temp),
                "power_w": power,
                "name": name,
            }
        finally:
            pynvml.nvmlShutdown()
    except Exception:
        return None


def _via_nvidia_smi() -> Optional[dict]:
    import subprocess

    try:
        out = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,"
                "temperature.gpu,power.draw",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return None
        parts = [p.strip() for p in out.stdout.strip().splitlines()[0].split(",")]
        if len(parts) < 6:
            return None

        def _f(i: int) -> float:
            try:
                return float(parts[i])
            except ValueError:
                return 0.0

        return {
            "utilization": _f(1),
            "mem_used_mb": _f(2),
            "mem_total_mb": _f(3),
            "temperature_c": _f(4),
            "power_w": _f(5),
            "name": parts[0],
        }
    except Exception:
        return None


def get_gpu_stats() -> Optional[dict]:
    """Return GPU stats dict or None. Cached for _CACHE_TTL seconds. Never raises."""
    global _cache
    now = time.monotonic()
    with _lock:
        ts, cached = _cache
        if now - ts < _CACHE_TTL:
            return cached
    stats = _via_pynvml() or _via_nvidia_smi()
    with _lock:
        _cache = (now, stats)
    return stats
