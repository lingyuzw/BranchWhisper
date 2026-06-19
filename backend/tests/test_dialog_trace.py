from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import numpy as np

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from api.diagnostics import create_diagnostics_router
from dialog.profile_context import trace_profile_context
from dialog.session import DialogSession
from dialog.trace import DialogTraceStore
from service_runtime.tts_clients import TtsServiceNotReady


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

    def test_dialog_session_builds_profile_context_from_active_settings(self) -> None:
        session = object.__new__(DialogSession)

        class Settings:
            asr_provider_mode = "api"
            api_asr_provider = "custom_openai"
            api_asr_model = "branch-asr"
            asr_mode = "local"
            asr_model = "local-asr"
            dialog_mode = "api"
            api_llm_model = "qwen-plus"
            llm_model = "local-llm"
            tts_provider_mode = "local"
            api_tts_provider = "remote-tts"
            api_tts_model = "remote-voice"
            tts_model = "cosyvoice-local"

        session.settings = Settings()

        self.assertEqual(
            session.trace_profile_context("asr"),
            {"profile_role": "asr", "profile_name": "custom_openai:branch-asr"},
        )
        self.assertEqual(
            session.trace_profile_context("llm"),
            {"profile_role": "llm", "profile_name": "api:qwen-plus"},
        )
        self.assertEqual(
            session.trace_profile_context("tts"),
            {"profile_role": "tts", "profile_name": "local:cosyvoice-local"},
        )
        self.assertEqual(session.trace_profile_context("media"), {"profile_role": "", "profile_name": ""})

    def test_trace_profile_context_maps_active_settings_without_session(self) -> None:
        class Settings:
            asr_provider_mode = "api"
            api_asr_provider = "custom_openai"
            api_asr_model = "branch-asr"
            asr_mode = "local"
            asr_model = "local-asr"
            dialog_mode = "api"
            api_llm_model = "qwen-plus"
            llm_model = "local-llm"
            tts_provider_mode = "local"
            api_tts_provider = "remote-tts"
            api_tts_model = "remote-voice"
            tts_model = "cosyvoice-local"

        settings = Settings()

        self.assertEqual(trace_profile_context(settings, "asr"), {"profile_role": "asr", "profile_name": "custom_openai:branch-asr"})
        self.assertEqual(trace_profile_context(settings, "llm"), {"profile_role": "llm", "profile_name": "api:qwen-plus"})
        self.assertEqual(trace_profile_context(settings, "tts"), {"profile_role": "tts", "profile_name": "local:cosyvoice-local"})
        self.assertEqual(trace_profile_context(settings, "media"), {"profile_role": "", "profile_name": ""})

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


class DialogSessionFailureAttributionTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_utterance_attributes_asr_failures_to_active_profile(self) -> None:
        store = DialogTraceStore(max_traces=5, clock=lambda: 100.0)
        session = object.__new__(DialogSession)
        session.trace_store = store
        session.conversation = {"id": "conv"}
        session.current_trace_id = ""
        session.processing = False

        class Settings:
            asr_provider_mode = "local"
            api_asr_provider = "openai"
            api_asr_model = "remote-asr"
            asr_mode = "local"
            asr_model = "branch-whisper"

        session.settings = Settings()
        events = []

        async def send_event(event_type: str, **payload) -> None:
            events.append({"type": event_type, **payload})

        session.send_event = send_event

        with patch("dialog.session.transcribe_audio", side_effect=RuntimeError("asr offline")):
            await session.process_utterance(np.zeros(16, dtype=np.float32))

        trace = store.payload(limit=5)["traces"][0]
        asr_event = next(item for item in trace["events"] if item["stage"] == "asr" and item["status"] == "error")
        self.assertEqual(asr_event["profile_role"], "asr")
        self.assertEqual(asr_event["profile_name"], "local:branch-whisper")
        self.assertEqual(asr_event["failure_reason"], "asr offline")
        self.assertEqual(trace["events"][-1]["failure_reason"], "asr offline")
        self.assertTrue(any(event["type"] == "error" for event in events))

    async def test_stream_direct_tts_attributes_not_ready_to_active_profile(self) -> None:
        store = DialogTraceStore(max_traces=5, clock=lambda: 100.0)
        trace_id = store.start(source="voice", conversation_id="conv")
        session = object.__new__(DialogSession)
        session.trace_store = store
        session.current_trace_id = trace_id
        session.tts_pcm_pending = b""
        session.tts_pcm_tail = np.array([], dtype=np.int16)
        session.tts_pcm_started = False

        class Settings:
            tts_enabled = True
            tts_provider_mode = "local"
            api_tts_provider = "openai"
            api_tts_model = "tts-1"
            tts_model = "cosyvoice-local"
            tts_url = "http://127.0.0.1:9880/tts"
            tts_sample_rate = 24000
            tts_speed = 1.0
            tts_seed = 42
            tts_volume = 1.0
            tts_fade_ms = 0

        session.settings = Settings()
        events = []

        async def send_event(event_type: str, **payload) -> None:
            events.append({"type": event_type, **payload})

        session.send_event = send_event

        async def failing_tts_audio(settings, text):
            if False:
                yield b""
            raise TtsServiceNotReady("tts warming", status="loading")

        with patch("dialog.session.iter_tts_audio", failing_tts_audio):
            await session.stream_direct_tts("你好")

        trace = store.payload(limit=5)["traces"][0]
        tts_event = next(item for item in trace["events"] if item["stage"] == "tts" and item["status"] == "error")
        self.assertEqual(tts_event["profile_role"], "tts")
        self.assertEqual(tts_event["profile_name"], "local:cosyvoice-local")
        self.assertEqual(tts_event["failure_reason"], "tts warming")
        self.assertTrue(any(event["type"] == "error" for event in events))

    async def test_process_user_text_attributes_llm_stream_failures_to_active_profile(self) -> None:
        store = DialogTraceStore(max_traces=5, clock=lambda: 100.0)
        session = object.__new__(DialogSession)
        session.trace_store = store
        session.conversation = {"id": "conv", "messages": []}
        session.current_trace_id = ""
        session.processing = False
        session.pending_sticker_tags = []
        session.messages = [{"role": "system", "content": "sys"}]
        session.followup_policy = None

        class MemoryStore:
            def format_context(self, settings, user_text, mode=""):
                return ""

        class Settings:
            dialog_mode = "api"
            api_llm_model = "qwen-plus"
            llm_model = "local-llm"
            api_history_turns = 6
            history_turns = 6
            tools_enabled = False
            tts_enabled = False
            system = "sys"

        session.settings = Settings()
        session.memory_store = MemoryStore()
        events = []

        async def send_event(event_type: str, **payload) -> None:
            events.append({"type": event_type, **payload})

        async def prepare_user_attachments(attachments):
            return []

        async def failing_stream_llm(request_messages, text_queue):
            raise RuntimeError("llm offline")

        session.send_event = send_event
        session.prepare_user_attachments = prepare_user_attachments
        session.persist_messages = lambda messages, title_hint=None: None
        session.persist_assistant_reply = lambda text, **kwargs: None
        session.stream_llm = failing_stream_llm

        await session.process_user_text("你好", source="text")

        trace = store.payload(limit=5)["traces"][0]
        llm_event = next(item for item in trace["events"] if item["stage"] == "llm" and item["status"] == "error")
        self.assertEqual(llm_event["profile_role"], "llm")
        self.assertEqual(llm_event["profile_name"], "api:qwen-plus")
        self.assertEqual(llm_event["failure_reason"], "llm offline")
        self.assertEqual(trace["status"], "failed")
        self.assertEqual(trace["events"][-1]["failure_reason"], "llm offline")
        self.assertTrue(any(event["type"] == "error" for event in events))


if __name__ == "__main__":
    unittest.main()
