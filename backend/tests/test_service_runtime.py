from __future__ import annotations

import argparse
import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.config import SessionSettings, add_settings_args
from integration_runtime import weixin_media
from integration_runtime.openclaw_bridge import mark_message_processed_once, mark_reply_sent_once, message_fingerprint, reply_fingerprint
from integration_runtime.manager import ExternalDialogEngine, IntegrationManager, attachment_history_text
from integration_runtime.weixin_media import WeixinVoiceSendError, send_weixin_voice
from media.sticker_policy import StickerPolicy
from service_runtime.audio_pipeline import clean_reply_text, strip_internal_attachment_markers
from service_runtime.services import (
    ServiceManager,
    check_service,
    friendly_service_error,
    extract_latest_started_command,
    extract_service_log_error,
    linux_process_started_at,
    normalize_command_for_compare,
    service_startup_timed_out,
    service_process_env,
    service_runtime_state,
    tune_start_command,
    _is_pid_alive,
)
from tools.runtime_brain import MemoryStore, ToolManager, admit_memory_candidate, extract_memory_candidates


def default_settings() -> SessionSettings:
    parser = argparse.ArgumentParser()
    add_settings_args(parser)
    return SessionSettings.from_args(parser.parse_args([]))


class ServiceRuntimeStateTests(unittest.TestCase):
    def test_offline_service_without_process_is_stopped(self) -> None:
        state = service_runtime_state(
            running=False,
            tracked_running=False,
            health={"ok": False, "error": "All connection attempts failed"},
            port_open=False,
            returncode=None,
        )

        self.assertEqual(state, "stopped")

    def test_health_ok_is_ready(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=True,
            health={"ok": True, "status": 200, "payload": {"ready": True}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "ready")

    def test_returncode_is_failed(self) -> None:
        state = service_runtime_state(
            running=False,
            tracked_running=False,
            health=None,
            port_open=False,
            returncode=1,
        )

        self.assertEqual(state, "failed")

    def test_http_5xx_health_is_failed(self) -> None:
        state = service_runtime_state(
            running=False,
            tracked_running=False,
            health={"ok": False, "status": 503, "payload": {"error": "loading failed"}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "failed")

    def test_running_service_with_loading_503_health_is_starting(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=True,
            health={"ok": False, "status": 503, "payload": {"detail": "TTS model is loading"}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "starting")

    def test_running_service_with_loading_status_text_is_starting(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=True,
            health={"ok": False, "status": 503, "payload": {"status": "loading model"}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "starting")

    def test_running_service_with_warming_503_health_is_warming(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=True,
            health={"ok": False, "status": 503, "payload": {"status": "warming", "ready": False}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "warming")

    def test_health_error_status_is_failed_even_when_port_open(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=True,
            health={"ok": False, "status": 503, "payload": {"status": "error", "ready": False, "error": "boom"}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "failed")

    def test_health_not_found_with_open_port_is_degraded_not_starting(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=False,
            health={"ok": False, "status": 404, "payload": {}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "running_degraded")

    def test_running_process_with_unready_health_is_starting(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=True,
            health={"ok": False, "error": "All connection attempts failed"},
            port_open=False,
            returncode=None,
        )

        self.assertEqual(state, "starting")

    def test_asr_tuning_does_not_override_saved_gpu_or_context(self) -> None:
        command = (
            "conda run --no-capture-output -n qwen3-asr qwen-asr-serve model "
            "--served-model-name qwen3-asr --gpu-memory-utilization 0.35 --max-model-len 2048 "
            "--host 0.0.0.0 --port 8001"
        )

        tuned = tune_start_command("asr", command)

        self.assertIn("--gpu-memory-utilization 0.35", tuned)
        self.assertIn("--max-model-len 2048", tuned)
        self.assertIn("--max-num-seqs 1", tuned)
        self.assertTrue(tuned.startswith("env OMP_NUM_THREADS=1"))

    def test_service_update_persists_to_runtime_config_and_exposes_final_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "service_profiles.json"
            manager = ServiceManager(config_path, Path(tmp) / "logs")

            saved = manager.update_service(
                "asr",
                {
                    "command": (
                        "conda run --no-capture-output -n qwen3-asr qwen-asr-serve model "
                        "--gpu-memory-utilization 0.35 --max-model-len 2048 --host 0.0.0.0 --port 8001"
                    )
                },
            )
            data = json.loads(config_path.read_text(encoding="utf-8"))

        self.assertEqual(data["services"]["asr"]["command"], saved["configured_command"])
        self.assertIn("--gpu-memory-utilization 0.35", saved["final_command"])
        self.assertIn("--max-model-len 2048", saved["final_command"])
        self.assertNotIn("--gpu-memory-utilization 0.60", saved["final_command"])

    def test_service_process_env_adds_local_conda_paths(self) -> None:
        env = service_process_env({"PATH": "/usr/bin:/bin"}, home=Path("/home/me"))

        path_parts = env["PATH"].split(":")
        self.assertEqual(env["PYTHONUNBUFFERED"], "1")
        self.assertLess(path_parts.index("/home/me/miniconda3/bin"), path_parts.index("/usr/bin"))
        self.assertIn("/home/me/miniconda3/condabin", path_parts)

    def test_conda_missing_error_has_environment_hint(self) -> None:
        message = friendly_service_error("env: 'conda': No such file or directory")

        self.assertIn("Conda", message)
        self.assertIn("PATH", message)

    def test_running_service_exceeding_ready_timeout_is_not_left_starting_forever(self) -> None:
        timed_out = service_startup_timed_out(
            state="starting",
            started_at=100.0,
            timeout_sec=60,
            health={"ok": False, "error": "All connection attempts failed"},
            now=200.1,
        )

        self.assertTrue(timed_out)

    def test_ready_service_does_not_time_out(self) -> None:
        timed_out = service_startup_timed_out(
            state="ready",
            started_at=100.0,
            timeout_sec=60,
            health={"ok": True, "payload": {"ready": True}},
            now=200.1,
        )

        self.assertFalse(timed_out)

    def test_linux_process_started_at_reads_proc_start_ticks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            proc = Path(tmp)
            (proc / "stat").write_text("cpu 0 0 0 0\nbtime 1000\n", encoding="utf-8")
            pid_dir = proc / "42"
            pid_dir.mkdir()
            # Field 2 may contain spaces in parentheses; field 22 is starttime.
            fields = ["42", "(python worker)", "S", "1", "1", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "250"]
            (pid_dir / "stat").write_text(" ".join(fields), encoding="utf-8")

            started = linux_process_started_at(42, proc_root=proc, clock_ticks=100)

        self.assertEqual(started, 1002.5)

    def test_zombie_process_is_not_treated_as_alive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            proc = Path(tmp)
            pid_dir = proc / "42"
            pid_dir.mkdir()
            pid_dir.joinpath("stat").write_text("42 (conda) Z 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 250", encoding="utf-8")

            alive = _is_pid_alive(42, proc_root=proc)

        self.assertFalse(alive)

    def test_extract_service_log_error_detects_vllm_memory_profile_failure(self) -> None:
        text = """
===== start 2026-06-17 21:11:05 =====
INFO loading model
AssertionError: Error in memory profiling. Initial free memory 8.46 GiB, current free memory 12.98 GiB.
RuntimeError: Engine core initialization failed. See root cause above.
"""

        error = extract_service_log_error(text)

        self.assertIn("Error in memory profiling", error)
        self.assertIn("显存", friendly_service_error(error))

    def test_extract_service_log_error_ignores_previous_start_failures(self) -> None:
        text = """
===== start 2026-06-17 20:00:00 =====
/bin/bash: line 1: /missing/model: No such file or directory
===== start 2026-06-17 21:27:42 =====
final command: conda run --no-capture-output -n cosyvoice_vllm python server.py
INFO:     Uvicorn running on http://0.0.0.0:50000
"""

        error = extract_service_log_error(text)

        self.assertEqual(error, "")

    def test_extract_service_log_error_ignores_transient_tts_503(self) -> None:
        text = """
===== start 2026-06-17 21:39:08 =====
INFO:     Started server process [888090]
INFO:     Uvicorn running on http://0.0.0.0:50000
INFO:     127.0.0.1:44037 - "POST /tts HTTP/1.1" 503 Service Unavailable
INFO 06-17 21:42:21 [backends.py:559] Dynamo bytecode transform time: 8.30 s
Loaded model: /home/me/workspace/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B
"""

        error = extract_service_log_error(text)

        self.assertEqual(error, "")

    def test_extract_latest_started_command_preserves_multiline_final_command(self) -> None:
        text = """
===== start 2026-06-17 20:33:11 =====
configured command: old
final command: ./build/bin/llama-server \\
  -m ./BranchWhisper-Qwen3.5-9B-v12-reality-Q8_0.gguf \\
  --host 127.0.0.1 \\
  --port 8080
0.00.320.284 I log_info: verbosity = 3
"""

        command = extract_latest_started_command(text)

        self.assertIn("-m ./BranchWhisper-Qwen3.5-9B-v12-reality-Q8_0.gguf", command)
        self.assertIn("--port 8080", command)
        self.assertNotIn("log_info", command)

    def test_extract_latest_started_command_ignores_runtime_noise_without_start_command(self) -> None:
        text = "[rank0]:[W617 21:20:30.539654453 ProcessGroupNCCL.cpp:1538] Warning: destroy_process_group() was not called\n"

        command = extract_latest_started_command(text)

        self.assertEqual(command, "")

    def test_normalize_command_for_compare_treats_wrapped_shell_command_as_same(self) -> None:
        wrapped = "./build/bin/llama-server \\\n  -m model.gguf \\\n  --port 8080"
        flat = "./build/bin/llama-server -m model.gguf --port 8080"

        self.assertEqual(normalize_command_for_compare(wrapped), normalize_command_for_compare(flat))


class ServiceHealthCheckTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_health_check_ignores_proxy_environment(self) -> None:
        original_factory = check_service.__globals__["httpx_client_for_url"]
        observed: dict[str, object] = {}

        class FakeClient:
            def __init__(self, **kwargs) -> None:
                observed.update(kwargs)

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb) -> None:
                return None

            async def get(self, url: str):
                import httpx

                return httpx.Response(200, json={"ready": True})

        def fake_factory(url: str, **kwargs):
            observed["url"] = url
            return FakeClient(**kwargs)

        check_service.__globals__["httpx_client_for_url"] = fake_factory
        try:
            result = await check_service("asr", "http://127.0.0.1:8001/health")
        finally:
            check_service.__globals__["httpx_client_for_url"] = original_factory

        self.assertTrue(result["ok"])
        self.assertEqual(observed["url"], "http://127.0.0.1:8001/health")
        self.assertIn("timeout", observed)


class WeixinVoiceSenderTests(unittest.TestCase):
    def test_voice_sender_accepts_sent_message_with_cdn_verify_warning(self) -> None:
        original_run = weixin_media.subprocess.run

        class FakeProc:
            returncode = 0
            stderr = ""
            stdout = json.dumps(
                {
                    "ok": True,
                    "stage": "sent",
                    "cdn_verify": {"ok": False, "error": "voice CDN verify HTTP 400: "},
                    "sendmessage_shape": {"ret": "number"},
                }
            )

        def fake_run(*_args, **_kwargs):
            return FakeProc()

        weixin_media.subprocess.run = fake_run
        try:
            result = send_weixin_voice(base_url="https://example.test", token="token", to_user_id="u", voice_file="/tmp/a.wav")
        finally:
            weixin_media.subprocess.run = original_run

        self.assertEqual(result["stage"], "sent")
        self.assertEqual(result["cdn_verify"]["ok"], False)

    def test_voice_sender_self_test_prefers_ogg_opus_outbound(self) -> None:
        script = BACKEND_ROOT / "integration_runtime" / "weixin_voice_sender.mjs"

        proc = weixin_media.subprocess.run(
            ["node", str(script), "--self-test"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            check=False,
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload.get("voice_format"), "ogg_opus")
        self.assertEqual(payload.get("encode_type"), 8)
        self.assertEqual(payload.get("sample_rate"), 48000)


class IntegrationDiagnosticsTests(unittest.TestCase):
    def test_local_weixin_base_url_connection_refused_has_hint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state_dir = root / "openclaw-state"
            account_id = "test-account"
            account_dir = state_dir / "openclaw-weixin" / "accounts"
            account_dir.mkdir(parents=True)
            (state_dir / "openclaw-weixin" / "accounts.json").write_text(
                f'["{account_id}"]',
                encoding="utf-8",
            )
            (account_dir / f"{account_id}.json").write_text(
                '{"baseUrl":"http://127.0.0.1:9","token":"token","userId":"u"}',
                encoding="utf-8",
            )

            old_state_dir = __import__("os").environ.get("OPENCLAW_STATE_DIR")
            __import__("os").environ["OPENCLAW_STATE_DIR"] = str(state_dir)
            try:
                manager = IntegrationManager(root / "integrations.json", root / "logs", root / "media")
                accounts = manager.weixin_accounts({"openclaw_profile": "branchwhisper"})
            finally:
                if old_state_dir is None:
                    __import__("os").environ.pop("OPENCLAW_STATE_DIR", None)
                else:
                    __import__("os").environ["OPENCLAW_STATE_DIR"] = old_state_dir

        self.assertEqual(len(accounts), 1)
        self.assertFalse(accounts[0]["base_url_reachable"])
        self.assertIn("OpenClaw", accounts[0]["diagnostic_hint"])


class OpenClawBridgeTests(unittest.TestCase):
    def test_reply_fingerprint_is_sent_once_per_source_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            account_id = "test-account"
            (state_dir / "openclaw-weixin" / "accounts").mkdir(parents=True)
            source_msg = {"message_id": "m1", "client_id": "c1", "session_id": "s1"}
            first = reply_fingerprint(account_id, "user@im.wechat", source_msg, "满穗啊，漳州人，爱吃爱睡。")
            same = reply_fingerprint(account_id, "user@im.wechat", source_msg, "满穗啊，漳州人，爱吃爱睡。")
            other_text = reply_fingerprint(account_id, "user@im.wechat", source_msg, "我是满穗。")
            other_msg = reply_fingerprint(account_id, "user@im.wechat", {**source_msg, "message_id": "m2"}, "满穗啊，漳州人，爱吃爱睡。")

            self.assertEqual(first, same)
            self.assertTrue(mark_reply_sent_once(state_dir, account_id, first))
            self.assertFalse(mark_reply_sent_once(state_dir, account_id, same))
            self.assertTrue(mark_reply_sent_once(state_dir, account_id, other_text))
            self.assertTrue(mark_reply_sent_once(state_dir, account_id, other_msg))

    def test_message_fingerprint_is_processed_once_across_processes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            account_id = "test-account"
            msg = {
                "message_id": "m1",
                "client_id": "c1",
                "from_user_id": "user@im.wechat",
                "create_time_ms": 123,
            }
            fingerprint = message_fingerprint(account_id, msg, "感觉咋都笨笨的？")

            self.assertTrue(mark_message_processed_once(state_dir, account_id, fingerprint))
            self.assertFalse(mark_message_processed_once(state_dir, account_id, fingerprint))


class ToolRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_weather_question_uses_configured_default_location(self) -> None:
        class ProviderConfigStub:
            def load(self) -> dict:
                return {
                    "enabled": True,
                    "timeout": 12,
                    "max_result_chars": 4000,
                    "weather": {
                        "enabled": True,
                        "provider": "gaode",
                        "default_location": "漳州",
                    },
                }

        class WeatherToolManager(ToolManager):
            async def weather(self, location: str, timeout: float = 12, providers: dict | None = None) -> dict:
                provider = (providers or {}).get("weather") or {}
                final_location = location.strip() or str(provider.get("default_location") or "北京")
                return {"ok": True, "tool": "weather", "location": final_location}

        with tempfile.TemporaryDirectory() as tmp:
            manager = WeatherToolManager(Path(tmp) / "tools.json", ProviderConfigStub())
            suggestion = manager.suggest_from_text("今天天气怎么样")
            self.assertEqual(suggestion, {"id": "weather", "arguments": {"location": ""}})

            result = await manager.execute("weather", suggestion["arguments"])

        self.assertEqual(result["location"], "漳州")

    def test_knowledge_source_question_uses_web_search(self) -> None:
        class ProviderConfigStub:
            def load(self) -> dict:
                return {
                    "enabled": True,
                    "search": {
                        "enabled": True,
                        "provider": "gaode",
                        "base_url": "https://restapi.amap.com/v3",
                        "api_key": "test",
                    },
                    "map": {"enabled": True, "provider": "gaode", "api_key": "test"},
                }

        with tempfile.TemporaryDirectory() as tmp:
            manager = ToolManager(Path(tmp) / "tools.json", ProviderConfigStub())

            suggestion = manager.suggest_from_text("周瑜无谋，诸葛少智这是谁说的？")

        self.assertEqual(suggestion, {"id": "web_search", "arguments": {"query": "周瑜无谋，诸葛少智这是谁说的？", "limit": 5}})


class MemoryRuntimeTests(unittest.TestCase):
    def test_memory_context_keeps_key_value_relation_for_user_preferences(self) -> None:
        settings = default_settings()
        settings.dialog_mode = "api"
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.sqlite3")
            store.upsert_memory(
                {
                    "key": "最喜欢的歌手",
                    "value": "周杰伦",
                    "layer": "short",
                    "confidence": 0.8,
                    "importance": 0.8,
                    "memory_type": "semantic_fact",
                },
                source="chat",
                mode="api",
            )

            context = store.format_context(settings, "你知道我最喜欢的歌手是谁吗？", mode="api")

        self.assertIn("最喜欢的歌手：周杰伦", context)
        self.assertIn("有相关记忆时不要说不知道", context)

    def test_memory_lookup_question_is_not_saved_as_user_preference(self) -> None:
        text = "你知道我最喜欢的歌手是谁吗？"

        self.assertEqual(extract_memory_candidates(text), [])
        admitted, reason = admit_memory_candidate(
            {
                "key": "用户偏好:的歌手是谁吗",
                "value": "用户喜欢的歌手是谁吗",
                "layer": "short",
                "confidence": 0.55,
                "importance": 0.65,
                "source": "chat",
                "memory_type": "semantic_fact",
            },
            text,
            default_settings(),
        )

        self.assertIsNone(admitted)
        self.assertIn(reason, {"memory_lookup_question", "unresolved_question"})

    def test_external_dialog_answers_memory_lookup_directly(self) -> None:
        settings = default_settings()
        settings.dialog_mode = "api"
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.sqlite3")
            store.upsert_memory(
                {
                    "key": "最喜欢的歌手",
                    "value": "周杰伦",
                    "layer": "short",
                    "confidence": 0.8,
                    "importance": 0.8,
                    "memory_type": "semantic_fact",
                },
                source="chat",
                mode="api",
            )
            engine = ExternalDialogEngine(
                integration_manager=None,
                conversation_store=None,
                memory_store=store,
                tool_manager=None,
                bot_profiles=None,
                media_dir=Path(tmp),
            )

            answer = engine.answer_from_memory_lookup(settings, "你知道我最喜欢的歌手是谁吗？")

        self.assertEqual(answer, "记得，是周杰伦。")

    def test_reference_question_expands_tool_query_with_previous_user_message(self) -> None:
        engine = ExternalDialogEngine(
            integration_manager=None,
            conversation_store=None,
            memory_store=None,
            tool_manager=None,
            bot_profiles=None,
            media_dir=Path(tempfile.gettempdir()),
        )
        conversation = {
            "messages": [
                {"role": "user", "content": "哦，原话是周瑜无谋，诸葛少智"},
                {"role": "assistant", "content": "你这记错了还能圆回来？"},
            ]
        }

        query = engine.expand_tool_query("这是谁说的？", conversation)

        self.assertEqual(query, "哦，原话是周瑜无谋，诸葛少智 这是谁说的？")


class ExternalDialogHistoryTests(unittest.TestCase):
    def test_api_llm_default_timeout_is_not_tool_timeout(self) -> None:
        settings = default_settings()
        settings.dialog_mode = "api"
        settings.tools_timeout = 12

        engine = ExternalDialogEngine(
            integration_manager=None,
            conversation_store=None,
            memory_store=None,
            tool_manager=None,
            bot_profiles=None,
            media_dir=Path(tempfile.gettempdir()),
        )

        self.assertGreaterEqual(engine.llm_request_timeout(settings, None), 45)

    def test_describe_llm_http_error_includes_body(self) -> None:
        class Response:
            status_code = 400
            text = '{"message":"input token limit exceeded"}'

            def json(self):
                return {"message": "input token limit exceeded"}

        error = type("HttpError", (), {"response": Response()})()
        engine = ExternalDialogEngine(
            integration_manager=None,
            conversation_store=None,
            memory_store=None,
            tool_manager=None,
            bot_profiles=None,
            media_dir=Path(tempfile.gettempdir()),
        )

        message = engine.describe_llm_error(error)

        self.assertIn("HTTP 400", message)
        self.assertIn("input token limit exceeded", message)

    def test_sticker_attachments_are_visible_to_next_llm_turn(self) -> None:
        class MemoryStub:
            def format_context(self, *_args, **_kwargs) -> str:
                return ""

        engine = ExternalDialogEngine(
            integration_manager=None,
            conversation_store=None,
            memory_store=MemoryStub(),
            tool_manager=None,
            bot_profiles=None,
            media_dir=Path(tempfile.gettempdir()),
        )
        conversation = {
            "messages": [
                {"role": "user", "content": "哈哈"},
                {
                    "role": "assistant",
                    "content": "哈哈，逗你玩的，别当真。",
                    "attachments": [{"type": "sticker", "asset_id": "s1", "name": "自信真好", "tag": "开心"}],
                },
            ]
        }

        messages = engine.build_messages(default_settings(), conversation, "啥表情包？", "啥表情包？")

        self.assertIn("[已发送表情包: 自信真好]", messages[-2]["content"])
        self.assertEqual(attachment_history_text(conversation["messages"][1]["attachments"]), "[已发送表情包: 自信真好]")

    def test_voice_trigger_does_not_match_song_recommendation(self) -> None:
        engine = ExternalDialogEngine(
            integration_manager=None,
            conversation_store=None,
            memory_store=None,
            tool_manager=None,
            bot_profiles=None,
            media_dir=Path(tempfile.gettempdir()),
        )

        self.assertFalse(engine.should_send_voice("推荐首歌听听", [], {}))
        self.assertFalse(engine.should_send_voice("那行，我等下听听看看", [], {}))
        self.assertTrue(engine.should_send_voice("发条语音听听", [], {}))
        self.assertTrue(engine.should_send_voice("听听", [], {}))

    def test_internal_sticker_marker_is_not_display_text(self) -> None:
        leaked = "嗯嗯好歌都是需要时间品的 [已发送表情包:\n表情包_猫_被夸奖时假装谦虚_001]"

        self.assertEqual(strip_internal_attachment_markers(leaked), "嗯嗯好歌都是需要时间品的")
        self.assertEqual(clean_reply_text(leaked), "嗯嗯好歌都是需要时间品的")


class StickerPolicyTests(unittest.TestCase):
    def test_plain_song_followup_does_not_send_sticker(self) -> None:
        policy = StickerPolicy()
        settings = default_settings()
        settings.sticker_activity = "very_active"

        intent = policy.simulate(
            settings,
            session_id="wechat",
            user_text="那行，我等下听听看看",
            reply_text="嗯嗯好歌都是需要时间品的",
            source="weixin",
        )

        self.assertFalse(intent["send"])
        self.assertEqual(intent["reason"], "plain_context")

    def test_strong_chat_emotion_can_send_sticker(self) -> None:
        policy = StickerPolicy()
        settings = default_settings()
        settings.sticker_activity = "very_active"

        intent = policy.simulate(
            settings,
            session_id="wechat",
            user_text="哈哈哈哈笑死我了",
            reply_text="你这反应也太好笑了",
            source="weixin",
        )

        self.assertTrue(intent["send"])


if __name__ == "__main__":
    unittest.main()
