from __future__ import annotations

import threading
import time
import uuid
from collections import OrderedDict
from typing import Callable


class DialogTraceStore:
    """Small in-memory ring buffer for recent dialog turn traces."""

    def __init__(self, max_traces: int = 80, clock: Callable[[], float] | None = None):
        self.max_traces = max(1, int(max_traces))
        self.clock = clock or time.time
        self._traces: OrderedDict[str, dict] = OrderedDict()
        self._lock = threading.Lock()

    def start(self, *, source: str, conversation_id: str = "") -> str:
        created_at = self.clock()
        trace_id = f"{int(created_at * 1000):x}-{uuid.uuid4().hex[:6]}"
        with self._lock:
            self._traces[trace_id] = {
                "id": trace_id,
                "source": source,
                "conversation_id": conversation_id,
                "status": "running",
                "created_at": created_at,
                "updated_at": created_at,
                "events": [],
            }
            self._trim_locked()
        self.record(trace_id, "turn", "start", {"source": source})
        return trace_id

    def record(self, trace_id: str, stage: str, message: str, metadata: dict | None = None) -> None:
        if not trace_id:
            return
        now = self.clock()
        event = {
            "at": now,
            "stage": str(stage or "event"),
            "message": " ".join(str(message or "").split()),
            "metadata": metadata or {},
        }
        with self._lock:
            trace = self._traces.get(trace_id)
            if not trace:
                return
            trace["events"].append(event)
            trace["updated_at"] = now
            self._traces.move_to_end(trace_id)

    def finish(self, trace_id: str, status: str = "done") -> None:
        if not trace_id:
            return
        self.record(trace_id, "turn", "finish", {"status": status})
        with self._lock:
            trace = self._traces.get(trace_id)
            if trace:
                trace["status"] = status
                trace["updated_at"] = self.clock()
                self._traces.move_to_end(trace_id)

    def payload(self, limit: int = 30) -> dict:
        limit = max(1, int(limit or 30))
        with self._lock:
            traces = list(reversed(list(self._traces.values())))[:limit]
            return {
                "total": len(self._traces),
                "traces": [_clone_trace(trace) for trace in traces],
            }

    def _trim_locked(self) -> None:
        while len(self._traces) > self.max_traces:
            self._traces.popitem(last=False)


def _clone_trace(trace: dict) -> dict:
    return {
        **trace,
        "events": [dict(event) for event in trace.get("events") or []],
    }
