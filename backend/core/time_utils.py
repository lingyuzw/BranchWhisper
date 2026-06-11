from __future__ import annotations

import time


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def now_ts() -> float:
    return time.time()
