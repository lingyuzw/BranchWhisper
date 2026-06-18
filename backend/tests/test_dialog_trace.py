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
from dialog.session import DialogSession
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

    def test_trace_events_include_failure_attribution_fields(self) -> None:
        counter = {"value": 100.0}

        def clock() -> float:
            counter["value"] += 0.25
            return counter["value"]

        store = DialogTraceStore(max_traces=5, clock=clock)

        trace_id = store.start(source="voice", conversation_id="conv-voice")
        store.record(
            trace_id,
            "tts",
            "synthesis failed",
            {"provider": "local"},
            status="error",
            started_at=100.5,
            profile_role="tts",
            profile_name="Local TTS",
            failure_reason="connection refused",
        )
        store.finish(trace_id, status="failed", failure_reason="connection refused")

        event = store.payload(limit=5)["traces"][0]["events"][1]
        finish_event = store.payload(limit=5)["traces"][0]["events"][-1]
        self.assertEqual(event["status"], "error")
        self.assertEqual(event["duration_ms"], 250)
        self.assertEqual(event["profile_role"], "tts")
        self.assertEqual(event["profile_name"], "Local TTS")
        self.assertEqual(event["failure_reason"], "connection refused")
        self.assertEqual(finish_event["status"], "failed")
        self.assertEqual(finish_event["failure_reason"], "connection refused")

    def test_dialog_session_trace_helpers_forward_attribution_fields(self) -> None:
        store = DialogTraceStore(max_traces=5, clock=lambda: 100.0)
        session = object.__new__(DialogSession)
        session.trace_store = store
        session.conversation = {"id": "conv"}
        session.current_trace_id = ""

        trace_id = session.begin_trace("voice")
        session.trace_log(
            trace_id,
            "asr:error boom",
            status="error",
            profile_role="asr",
            profile_name="Local ASR",
            failure_reason="boom",
        )
        session.finish_trace(trace_id, "failed", failure_reason="boom")

        trace = store.payload(limit=5)["traces"][0]
        event = next(item for item in trace["events"] if item["stage"] == "asr")
        finish_event = trace["events"][-1]
        self.assertEqual(event["stage"], "asr")
        self.assertEqual(event["status"], "error")
        self.assertEqual(event["profile_role"], "asr")
        self.assertEqual(event["profile_name"], "Local ASR")
        self.assertEqual(event["failure_reason"], "boom")
        self.assertEqual(finish_event["status"], "failed")
        self.assertEqual(finish_event["failure_reason"], "boom")

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
