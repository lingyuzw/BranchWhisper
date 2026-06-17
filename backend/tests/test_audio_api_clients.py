from __future__ import annotations

import argparse
import asyncio
import io
import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.config import (
    SessionSettings,
    active_asr_api_key,
    active_asr_model,
    active_asr_provider,
    active_asr_url,
    active_tts_api_key,
    active_tts_model,
    active_tts_provider,
    active_tts_url,
    add_settings_args,
    public_settings,
    update_audio_api_keys,
)
from service_runtime.audio_pipeline import build_asr_request
from service_runtime.tts_clients import (
    TtsServiceNotReady,
    build_tts_request,
    ensure_local_tts_ready,
    save_voice_sample_data_url,
    synthesize_tts_bytes,
    synthesize_tts_wav_bytes,
    tts_provider_capabilities,
    wav_bytes_from_pcm16,
)


def default_settings() -> SessionSettings:
    parser = argparse.ArgumentParser()
    add_settings_args(parser)
    return SessionSettings.from_args(parser.parse_args([]))


def tiny_wav_bytes(pcm: bytes = b"\x01\x00\x02\x00") -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(pcm)
    return buffer.getvalue()


class AudioApiConfigTests(unittest.TestCase):
    def test_asr_and_tts_api_secrets_are_masked_and_preserved(self) -> None:
        settings = default_settings()
        settings.api_asr_api_key = "sk-asr-secret-value"
        settings.api_tts_api_key = "sk-tts-secret-value"

        payload = public_settings(settings)

        self.assertEqual(payload["api_asr_api_key"], "")
        self.assertTrue(payload["api_asr_api_key_set"])
        self.assertIn("***", payload["api_asr_api_key_masked"])
        self.assertEqual(payload["api_tts_api_key"], "")
        self.assertTrue(payload["api_tts_api_key_set"])
        self.assertIn("***", payload["api_tts_api_key_masked"])

        update_audio_api_keys(settings, {"api_asr_api_key": "sk-asr-new", "api_tts_api_key": "sk-tts-new"})
        self.assertEqual(settings.api_asr_api_key, "sk-asr-new")
        self.assertEqual(settings.api_tts_api_key, "sk-tts-new")

        update_audio_api_keys(settings, {"api_asr_api_key": "sk-asr****************0000", "api_tts_api_key": ""})
        self.assertEqual(settings.api_asr_api_key, "sk-asr-new")
        self.assertEqual(settings.api_tts_api_key, "sk-tts-new")

    def test_active_asr_and_tts_selectors_follow_provider_mode(self) -> None:
        settings = default_settings()
        self.assertEqual(active_asr_provider(settings), "local")
        self.assertEqual(active_asr_url(settings), settings.asr_url)
        self.assertEqual(active_asr_model(settings), settings.asr_model)
        self.assertEqual(active_asr_api_key(settings), "")
        self.assertEqual(active_tts_provider(settings), "local")
        self.assertEqual(active_tts_url(settings), settings.tts_url)
        self.assertEqual(active_tts_model(settings), settings.tts_model)

        settings.asr_provider_mode = "api"
        settings.api_asr_provider = "openai"
        settings.api_asr_url = "https://api.openai.com/v1/audio/transcriptions"
        settings.api_asr_model = "gpt-4o-mini-transcribe"
        settings.api_asr_api_key = "sk-asr"
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "openai"
        settings.api_tts_url = "https://api.openai.com/v1/audio/speech"
        settings.api_tts_model = "gpt-4o-mini-tts"
        settings.api_tts_api_key = "sk-tts"

        self.assertEqual(active_asr_provider(settings), "openai")
        self.assertEqual(active_asr_url(settings), "https://api.openai.com/v1/audio/transcriptions")
        self.assertEqual(active_asr_model(settings), "gpt-4o-mini-transcribe")
        self.assertEqual(active_asr_api_key(settings), "sk-asr")
        self.assertEqual(active_tts_provider(settings), "openai")
        self.assertEqual(active_tts_url(settings), "https://api.openai.com/v1/audio/speech")
        self.assertEqual(active_tts_model(settings), "gpt-4o-mini-tts")
        self.assertEqual(active_tts_api_key(settings), "sk-tts")


class AudioRequestShapeTests(unittest.TestCase):
    def test_openai_asr_request_uses_audio_transcriptions_shape(self) -> None:
        settings = default_settings()
        settings.asr_provider_mode = "api"
        settings.api_asr_provider = "openai"
        settings.api_asr_url = "https://api.openai.com/v1/audio/transcriptions"
        settings.api_asr_model = "gpt-4o-transcribe"
        settings.api_asr_api_key = "sk-test"
        settings.api_asr_language = "zh"

        request = build_asr_request(settings, b"RIFF....WAVE")

        self.assertEqual(request.url, "https://api.openai.com/v1/audio/transcriptions")
        self.assertEqual(request.data["model"], "gpt-4o-transcribe")
        self.assertEqual(request.data["language"], "zh")
        self.assertEqual(request.files["file"][0], "speech.wav")
        self.assertEqual(request.headers["Authorization"], "Bearer sk-test")

    def test_dashscope_asr_request_uses_qwen_audio_chat_shape(self) -> None:
        settings = default_settings()
        settings.asr_provider_mode = "api"
        settings.api_asr_provider = "dashscope"
        settings.api_asr_url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        settings.api_asr_model = "qwen3-asr-flash"
        settings.api_asr_api_key = "sk-test"

        request = build_asr_request(settings, b"RIFF....WAVE")

        self.assertEqual(request.url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        self.assertEqual(request.headers["Authorization"], "Bearer sk-test")
        self.assertEqual(request.json["model"], "qwen3-asr-flash")
        self.assertEqual(request.json["stream"], False)
        content = request.json["messages"][0]["content"]
        self.assertEqual(content[0]["type"], "input_audio")
        self.assertTrue(content[0]["input_audio"]["data"].startswith("data:audio/wav;base64,"))

    def test_openai_tts_request_uses_voice_profile_and_pcm_output(self) -> None:
        settings = default_settings()
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "openai"
        settings.api_tts_url = "https://api.openai.com/v1/audio/speech"
        settings.api_tts_model = "gpt-4o-mini-tts"
        settings.api_tts_api_key = "sk-test"
        settings.api_tts_voice = "coral"
        settings.api_tts_instructions = "自然、亲近、像微信语音。"
        settings.api_tts_format = "pcm"

        request = build_tts_request(settings, "你好呀")

        self.assertEqual(request.url, "https://api.openai.com/v1/audio/speech")
        self.assertEqual(request.json["model"], "gpt-4o-mini-tts")
        self.assertEqual(request.json["voice"], "coral")
        self.assertEqual(request.json["input"], "你好呀")
        self.assertEqual(request.json["instructions"], "自然、亲近、像微信语音。")
        self.assertEqual(request.json["response_format"], "pcm")
        self.assertEqual(request.headers["Authorization"], "Bearer sk-test")

    def test_elevenlabs_manual_or_cloned_voice_uses_voice_id_endpoint(self) -> None:
        settings = default_settings()
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "elevenlabs"
        settings.api_tts_url = "https://api.elevenlabs.io/v1/text-to-speech"
        settings.api_tts_api_key = "xi-test"
        settings.api_tts_voice_mode = "manual"
        settings.api_tts_voice_id = "voice_123"
        settings.api_tts_model = "eleven_flash_v2_5"
        settings.api_tts_latency_mode = "fast"

        request = build_tts_request(settings, "快一点生成")

        self.assertEqual(request.url, "https://api.elevenlabs.io/v1/text-to-speech/voice_123")
        self.assertEqual(request.json["model_id"], "eleven_flash_v2_5")
        self.assertEqual(request.json["text"], "快一点生成")
        self.assertIn("output_format=pcm_24000", request.query)
        self.assertEqual(request.headers["xi-api-key"], "xi-test")

    def test_dashscope_tts_request_uses_qwen_tts_json_audio_shape(self) -> None:
        settings = default_settings()
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "dashscope"
        settings.api_tts_url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        settings.api_tts_model = "qwen-tts"
        settings.api_tts_api_key = "sk-test"
        settings.api_tts_voice = "Cherry"

        request = build_tts_request(settings, "你好呀")

        self.assertEqual(request.json["model"], "qwen-tts")
        self.assertEqual(request.json["input"]["text"], "你好呀")
        self.assertEqual(request.json["parameters"]["voice"], "Cherry")
        self.assertEqual(request.json["parameters"]["format"], "wav")
        self.assertTrue(request.json_audio)
        self.assertEqual(request.output_format, "pcm_s16le")
        self.assertEqual(request.headers["Authorization"], "Bearer sk-test")


class VoiceProfileTests(unittest.TestCase):
    def test_voice_sample_upload_creates_local_profile_without_remote_clone(self) -> None:
        audio_data_url = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
        with tempfile.TemporaryDirectory() as tmp:
            profile = save_voice_sample_data_url(
                root=Path(tmp),
                data_url=audio_data_url,
                name="mansui-reference",
                provider="openai",
            )

        self.assertEqual(profile["provider"], "openai")
        self.assertEqual(profile["status"], "local_sample")
        self.assertEqual(profile["voice_mode"], "cloned")
        self.assertTrue(profile["sample_path"].endswith(".wav"))
        self.assertEqual(profile["remote_voice_id"], "")

    def test_provider_capabilities_show_voice_clone_support(self) -> None:
        self.assertFalse(tts_provider_capabilities("openai")["voice_clone"])
        self.assertTrue(tts_provider_capabilities("elevenlabs")["voice_clone"])
        self.assertTrue(tts_provider_capabilities("dashscope")["voice_clone"])


class TtsClientRuntimeTests(unittest.IsolatedAsyncioTestCase):
    def test_wav_bytes_from_pcm16_builds_playable_mono_wav(self) -> None:
        wav_data = wav_bytes_from_pcm16(b"\x01\x00\x02\x00", 24000)

        with wave.open(io.BytesIO(wav_data), "rb") as wav:
            self.assertEqual(wav.getnchannels(), 1)
            self.assertEqual(wav.getsampwidth(), 2)
            self.assertEqual(wav.getframerate(), 24000)
            self.assertEqual(wav.readframes(wav.getnframes()), b"\x01\x00\x02\x00")

    async def test_synthesize_tts_bytes_streams_openai_compatible_audio(self) -> None:
        import service_runtime.tts_clients as tts_clients

        settings = default_settings()
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "openai"
        settings.api_tts_url = "https://api.openai.com/v1/audio/speech"
        settings.api_tts_model = "gpt-4o-mini-tts"
        settings.api_tts_api_key = "sk-test"

        captured: dict = {}

        class FakeResponse:
            def raise_for_status(self) -> None:
                return None

            async def aiter_bytes(self):
                yield b"\x01\x00"
                yield b"\x02\x00"

        class FakeStream:
            async def __aenter__(self):
                return FakeResponse()

            async def __aexit__(self, exc_type, exc, tb):
                return False

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            def stream(self, method, url, json=None, headers=None):
                captured["method"] = method
                captured["url"] = url
                captured["json"] = json
                captured["headers"] = headers
                return FakeStream()

        original = tts_clients.httpx_client_for_url
        tts_clients.httpx_client_for_url = lambda url, timeout=None: FakeClient()
        try:
            audio = await synthesize_tts_bytes(settings, "测试语音")
        finally:
            tts_clients.httpx_client_for_url = original

        self.assertEqual(audio, b"\x01\x00\x02\x00")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["url"], "https://api.openai.com/v1/audio/speech")
        self.assertEqual(captured["json"]["input"], "测试语音")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer sk-test")

    async def test_local_tts_health_loading_blocks_tts_request(self) -> None:
        import service_runtime.tts_clients as tts_clients

        settings = default_settings()
        settings.tts_provider_mode = "local"
        settings.tts_url = "http://127.0.0.1:50000/tts"
        calls: list[tuple[str, str]] = []

        class FakeHealthResponse:
            status_code = 200

            def json(self):
                return {"status": "loading", "ready": False}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, url):
                calls.append(("GET", url))
                return FakeHealthResponse()

            def stream(self, method, url, json=None, headers=None):
                calls.append((method, url))
                raise AssertionError("POST /tts should not be called while health is not ready")

        original = tts_clients.httpx_client_for_url
        tts_clients.httpx_client_for_url = lambda url, timeout=None: FakeClient()
        try:
            with self.assertRaises(TtsServiceNotReady) as ctx:
                await synthesize_tts_bytes(settings, "测试语音")
        finally:
            tts_clients.httpx_client_for_url = original

        self.assertIn("加载", str(ctx.exception))
        self.assertEqual(calls, [("GET", "http://127.0.0.1:50000/health")])

    async def test_local_tts_health_error_raises_not_ready_with_detail(self) -> None:
        import service_runtime.tts_clients as tts_clients

        settings = default_settings()
        settings.tts_provider_mode = "local"
        settings.tts_url = "http://127.0.0.1:50000/tts"

        class FakeHealthResponse:
            status_code = 503

            def json(self):
                return {"status": "error", "ready": False, "error": "CUDA out of memory"}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, url):
                return FakeHealthResponse()

        original = tts_clients.httpx_client_for_url
        tts_clients.httpx_client_for_url = lambda url, timeout=None: FakeClient()
        try:
            with self.assertRaises(TtsServiceNotReady) as ctx:
                await ensure_local_tts_ready(settings)
        finally:
            tts_clients.httpx_client_for_url = original

        self.assertIn("CUDA out of memory", str(ctx.exception))

    async def test_synthesize_tts_wav_bytes_wraps_current_voice_pcm(self) -> None:
        import service_runtime.tts_clients as tts_clients

        settings = default_settings()
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "openai"
        settings.api_tts_url = "https://api.openai.com/v1/audio/speech"
        settings.api_tts_model = "gpt-4o-mini-tts"
        settings.api_tts_api_key = "sk-test"
        settings.api_tts_sample_rate = 22050

        async def fake_synthesize(_settings, text: str) -> bytes:
            self.assertEqual(text, "你好，今天过得怎么样。")
            return b"\x01\x00\x02\x00"

        original = tts_clients.synthesize_tts_bytes
        tts_clients.synthesize_tts_bytes = fake_synthesize
        try:
            wav_data = await synthesize_tts_wav_bytes(settings, "你好，今天过得怎么样。")
        finally:
            tts_clients.synthesize_tts_bytes = original

        with wave.open(io.BytesIO(wav_data), "rb") as wav:
            self.assertEqual(wav.getframerate(), 22050)
            self.assertEqual(wav.readframes(wav.getnframes()), b"\x01\x00\x02\x00")

    async def test_synthesize_tts_bytes_downloads_dashscope_audio_url(self) -> None:
        import service_runtime.tts_clients as tts_clients

        settings = default_settings()
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "dashscope"
        settings.api_tts_url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        settings.api_tts_model = "qwen-tts"
        settings.api_tts_api_key = "sk-test"

        captured: dict = {"posts": [], "gets": []}

        class FakePostResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self):
                return {"output": {"audio": {"url": "https://dashscope.example/audio.wav"}}}

        class FakeGetResponse:
            def raise_for_status(self) -> None:
                return None

            @property
            def content(self):
                return tiny_wav_bytes(b"\x01\x00\x02\x00")

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, json=None, headers=None):
                captured["posts"].append({"url": url, "json": json, "headers": headers})
                return FakePostResponse()

            async def get(self, url):
                captured["gets"].append(url)
                return FakeGetResponse()

        original = tts_clients.httpx_client_for_url
        tts_clients.httpx_client_for_url = lambda url, timeout=None: FakeClient()
        try:
            audio = await synthesize_tts_bytes(settings, "测试语音")
        finally:
            tts_clients.httpx_client_for_url = original

        self.assertEqual(audio, b"\x01\x00\x02\x00")
        self.assertEqual(captured["posts"][0]["headers"]["Authorization"], "Bearer sk-test")
        self.assertEqual(captured["gets"], ["https://dashscope.example/audio.wav"])

    async def test_audio_diagnostics_report_missing_keys_without_network(self) -> None:
        from api.diagnostics import run_asr_api_probe, run_tts_api_probe

        settings = default_settings()
        settings.asr_provider_mode = "api"
        settings.api_asr_provider = "openai"
        settings.api_asr_api_key = ""
        settings.tts_provider_mode = "api"
        settings.api_tts_provider = "openai"
        settings.api_tts_api_key = ""

        asr_result = await run_asr_api_probe(settings)
        tts_result = await run_tts_api_probe(settings)

        self.assertFalse(asr_result["ok"])
        self.assertIn("API Key", asr_result["error"])
        self.assertFalse(tts_result["ok"])
        self.assertIn("API Key", tts_result["error"])


if __name__ == "__main__":
    unittest.main()
