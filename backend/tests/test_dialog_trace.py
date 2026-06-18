from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from api.diagnostics import create_diagnostics_router
from dialog.trace import DialogTraceStore


class DialogTraceStoreTests(unittest.TestCase):
    def test_trace_store_records_events_and_finish_status(self) -> None:
        store = DialogTraceStore(max_traces=5, clock=lambda: 100.0)

        trace_id = store.start(source="text", conversation_id="conv-1")
        store.record(trace_id, "llm", "start")
        store.record(trace_id, "llm", "done", {"answer_len": 42})
        store.finish(trace_id, status="done")

        payload = store.payload(limit=5)

        self.assertEqual(payload["total"], 1)
        trace = payload["traces"][0]
        self.assertEqual(trace["id"], trace_id)
        self.assertEqual(trace["source"], "text")
        self.assertEqual(trace["conversation_id"], "conv-1")
        self.assertEqual(trace["status"], "done")
        self.assertEqual([event["stage"] for event in trace["events"]], ["turn", "llm", "llm", "turn"])
        self.assertEqual(trace["events"][2]["metadata"], {"answer_len": 42})

    def test_trace_store_keeps_recent_traces_only(self) -> None:
        counter = {"value": 0.0}

        def clock() -> float:
            counter["value"] += 1.0
            return counter["value"]

        store = DialogTraceStore(max_traces=2, clock=clock)

        first = store.start(source="text", conversation_id="first")
        second = store.start(source="text", conversation_id="second")
        third = store.start(source="voice", conversation_id="third")

        payload = store.payload(limit=10)

        self.assertEqual([trace["id"] for trace in payload["traces"]], [third, second])
        self.assertNotIn(first, [trace["id"] for trace in payload["traces"]])

    def test_record_ignores_unknown_trace_id(self) -> None:
        store = DialogTraceStore(max_traces=2, clock=lambda: 100.0)

        store.record("", "llm", "done")
        store.record("missing", "llm", "done")

        self.assertEqual(store.payload(limit=5), {"total": 0, "traces": []})

    def test_dialog_trace_route_returns_recent_traces(self) -> None:
        store = DialogTraceStore(max_traces=5, clock=lambda: 100.0)
        trace_id = store.start(source="text", conversation_id="conv")
        store.record(trace_id, "llm", "done")

        app = FastAPI()
        app.state.dialog_trace_store = store
        app.include_router(create_diagnostics_router())

        response = TestClient(app).get("/api/diagnostics/dialog-traces")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["traces"][0]["id"], trace_id)


if __name__ == "__main__":
    unittest.main()
