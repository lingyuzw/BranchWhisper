from __future__ import annotations

from typing import Any

SECONDS_PER_DAY = 86400
MEMORY_MODES = {"local", "api"}


def days_since(timestamp: float | int | None, now: float | None = None, now_fn=None) -> float:
    if not timestamp:
        return 999999.0
    current = now if now is not None else now_fn() if now_fn else __import__("time").time()
    return max(0.0, (current - float(timestamp)) / SECONDS_PER_DAY)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_memory_mode(mode: str | None = None, settings: Any | None = None) -> str:
    value = str(mode or getattr(settings, "dialog_mode", "local") or "local").strip().lower()
    return value if value in MEMORY_MODES else "local"
