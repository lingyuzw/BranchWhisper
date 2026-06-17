from __future__ import annotations

import base64
import binascii
import contextlib
import io
import re
import uuid
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import urlencode

from core.config import (
    active_tts_api_key,
    active_tts_model,
    active_tts_provider,
    active_tts_provider_mode,
    active_tts_url,
)
from core.http_client import httpx_client_for_url, request_with_retries
from service_runtime.audio_pipeline import clean_for_tts


class TtsServiceNotReady(RuntimeError):
    """Raised when local TTS is reachable but the model has not finished loading."""

    def __init__(self, message: str, *, status: str = "", health: dict | None = None):
        super().__init__(message)
        self.status = status
        self.health = health or {}


@dataclass
class TtsRequest:
    provider: str
    url: str
    json: dict
    headers: dict[str, str]
    query: str = ""
    output_format: str = "pcm_s16le"
    sample_rate: int = 24000
    json_audio: bool = False


def tts_provider_capabilities(provider: str) -> dict:
    provider = normalize_provider(provider)
    return {
        "provider": provider,
        "voice_clone": provider in {"elevenlabs", "dashscope"},
        "streaming": provider in {"local", "openai", "custom_openai", "elevenlabs"},
        "builtin_voice": provider in {"local", "openai", "dashscope", "elevenlabs", "custom_openai"},
    }


def normalize_provider(provider: str) -> str:
    value = str(provider or "").strip().lower().replace("-", "_")
    if value in {"local", "openai", "dashscope", "elevenlabs", "custom_openai"}:
        return value
    return "openai"


def selected_tts_voice(settings: Any) -> str:
    mode = str(getattr(settings, "api_tts_voice_mode", "builtin") or "builtin")
    if mode in {"manual", "cloned"}:
        voice_id = str(getattr(settings, "api_tts_voice_id", "") or "").strip()
        if voice_id:
            return voice_id
    return str(getattr(settings, "api_tts_voice", "") or "coral").strip() or "coral"


def build_tts_request(settings: Any, text: str, stream: bool = True) -> TtsRequest:
    text = clean_for_tts(text) or str(text or "").strip()
    provider = active_tts_provider(settings)
    sample_rate = int(getattr(settings, "api_tts_sample_rate", 24000) or 24000) if active_tts_provider_mode(settings) == "api" else int(settings.tts_sample_rate)

    if provider == "local":
        return TtsRequest(
            provider="local",
            url=active_tts_url(settings),
            json={
                "text": text,
                "stream": stream,
                "speed": float(getattr(settings, "tts_speed", 1.0)),
                "seed": int(getattr(settings, "tts_seed", 42)),
            },
            headers={},
            sample_rate=int(getattr(settings, "tts_sample_rate", sample_rate)),
        )

    api_key = active_tts_api_key(settings)
    if provider in {"openai", "custom_openai"}:
        response_format = "pcm"
        payload = {
            "model": active_tts_model(settings),
            "voice": selected_tts_voice(settings),
            "input": text,
            "response_format": response_format,
            "speed": float(getattr(settings, "api_tts_speed", 1.0) or 1.0),
        }
        instructions = str(getattr(settings, "api_tts_instructions", "") or "").strip()
        if instructions:
            payload["instructions"] = instructions
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        return TtsRequest(
            provider=provider,
            url=active_tts_url(settings),
            json=payload,
            headers=headers,
            output_format="pcm_s16le",
            sample_rate=sample_rate,
        )

    if provider == "elevenlabs":
        voice_id = selected_tts_voice(settings)
        base_url = active_tts_url(settings).rstrip("/")
        query = urlencode({"output_format": f"pcm_{sample_rate}", "optimize_streaming_latency": "4" if str(getattr(settings, "api_tts_latency_mode", "")) == "fast" else "2"})
        headers = {"xi-api-key": api_key} if api_key else {}
        return TtsRequest(
            provider="elevenlabs",
            url=f"{base_url}/{voice_id}",
            json={
                "text": text,
                "model_id": active_tts_model(settings),
                "voice_settings": {"stability": 0.45, "similarity_boost": 0.8},
            },
            headers=headers,
            query=query,
            sample_rate=sample_rate,
        )

    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    if provider == "dashscope":
        return TtsRequest(
            provider=provider,
            url=active_tts_url(settings),
            json={
                "model": active_tts_model(settings),
                "input": {"text": text},
                "parameters": {
                    "voice": selected_tts_voice(settings),
                    "format": "wav",
                    "sample_rate": sample_rate,
                },
            },
            headers=headers,
            output_format="pcm_s16le",
            sample_rate=sample_rate,
            json_audio=True,
        )

    return TtsRequest(
        provider=provider,
        url=active_tts_url(settings),
        json={
            "model": active_tts_model(settings),
            "input": {"text": text},
            "voice": selected_tts_voice(settings),
            "response_format": "pcm",
        },
        headers=headers,
        sample_rate=sample_rate,
    )


async def iter_tts_audio(settings: Any, text: str) -> AsyncIterator[bytes]:
    request = build_tts_request(settings, text, stream=True)
    await ensure_local_tts_ready(settings, request)
    url = request.url
    if request.query:
        url = f"{url}?{request.query}"
    if request.json_audio:
        audio = await request_json_audio(request)
        if audio:
            yield audio
        return
    async with httpx_client_for_url(url, timeout=None) as client:
        async with client.stream("POST", url, json=request.json, headers=request.headers) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                if chunk:
                    yield chunk


async def ensure_local_tts_ready(settings: Any, request: TtsRequest | None = None) -> None:
    request = request or build_tts_request(settings, "", stream=True)
    if request.provider != "local":
        return
    health_url = local_tts_health_url(request.url)
    try:
        async with httpx_client_for_url(health_url, timeout=1.5) as client:
            resp = await client.get(health_url)
        payload = {}
        with contextlib.suppress(Exception):
            data = resp.json()
            if isinstance(data, dict):
                payload = data
    except Exception:
        return

    status = str(payload.get("status") or "").strip().lower()
    ready = payload.get("ready")
    detail = str(payload.get("detail") or payload.get("message") or payload.get("error") or "").strip()
    if 200 <= int(getattr(resp, "status_code", 0) or 0) < 400 and ready is not False and status not in {"loading", "warming", "starting", "not_started", "error", "failed"}:
        return
    if ready is True and status not in {"error", "failed"}:
        return
    raise TtsServiceNotReady(local_tts_not_ready_message(status, detail), status=status, health=payload)


def local_tts_health_url(tts_url: str) -> str:
    from service_runtime.services import health_url_from

    return health_url_from(tts_url)


def local_tts_not_ready_message(status: str, detail: str = "") -> str:
    status = str(status or "").strip().lower()
    detail = str(detail or "").strip()
    if status in {"error", "failed"} or detail:
        return f"TTS 服务未就绪：{detail or status}"
    if status == "warming":
        return "TTS 模型正在预热，稍后再测试语音。"
    if status in {"loading", "starting", "not_started", ""}:
        return "TTS 模型还在加载，稍后再测试语音。"
    return f"TTS 服务未就绪：{status}"


async def synthesize_tts_bytes(settings: Any, text: str) -> bytes:
    data = bytearray()
    async for chunk in iter_tts_audio(settings, text):
        data.extend(chunk)
    return bytes(data)


def wav_bytes_from_pcm16(pcm: bytes, sample_rate: int) -> bytes:
    stream = io.BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(int(sample_rate))
        wav.writeframes(bytes(pcm or b""))
    return stream.getvalue()


async def synthesize_tts_wav_bytes(settings: Any, text: str) -> bytes:
    request = build_tts_request(settings, text, stream=True)
    if request.output_format != "pcm_s16le":
        raise RuntimeError(f"TTS returned unsupported audio format for preview: {request.output_format}")
    pcm = await synthesize_tts_bytes(settings, text)
    if len(pcm) % 2:
        pcm = pcm[:-1]
    if not pcm:
        raise RuntimeError("TTS returned empty audio")
    return wav_bytes_from_pcm16(bytes(pcm), request.sample_rate)


async def request_json_audio(request: TtsRequest) -> bytes:
    async with httpx_client_for_url(request.url, timeout=None) as client:
        resp = await request_with_retries(client, "POST", request.url, json=request.json, headers=request.headers)
        resp.raise_for_status()
        data = resp.json()
        audio = extract_json_audio_bytes(data)
        if audio:
            return normalize_audio_to_pcm(audio)
        audio_url = extract_json_audio_url(data)
        if audio_url:
            audio_resp = await request_with_retries(client, "GET", audio_url)
            audio_resp.raise_for_status()
            return normalize_audio_to_pcm(bytes(audio_resp.content or b""))
    raise ValueError("TTS response did not contain audio data")


def extract_json_audio_url(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    candidates = [
        data.get("audio_url"),
        data.get("url"),
        (data.get("output") or {}).get("audio_url") if isinstance(data.get("output"), dict) else "",
        ((data.get("output") or {}).get("audio") or {}).get("url") if isinstance(data.get("output"), dict) and isinstance((data.get("output") or {}).get("audio"), dict) else "",
    ]
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def extract_json_audio_bytes(data: Any) -> bytes:
    if not isinstance(data, dict):
        return b""
    candidates = [
        data.get("audio"),
        data.get("audio_data"),
        data.get("data"),
        (data.get("output") or {}).get("audio") if isinstance(data.get("output"), dict) else "",
        ((data.get("output") or {}).get("audio") or {}).get("data") if isinstance(data.get("output"), dict) and isinstance((data.get("output") or {}).get("audio"), dict) else "",
    ]
    for value in candidates:
        if isinstance(value, dict):
            value = value.get("data") or value.get("base64") or value.get("content")
        if not isinstance(value, str):
            continue
        value = value.strip()
        if not value:
            continue
        if value.startswith("data:"):
            _, _, value = value.partition(",")
        try:
            return base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            continue
    return b""


def normalize_audio_to_pcm(audio: bytes) -> bytes:
    data = bytes(audio or b"")
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        with wave.open(io.BytesIO(data), "rb") as wav:
            if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
                raise ValueError("TTS WAV must be mono 16-bit PCM")
            return wav.readframes(wav.getnframes())
    return data


def save_voice_sample_data_url(root: Path, data_url: str, name: str, provider: str) -> dict:
    match = re.match(r"^data:(audio/[-+.\w]+);base64,(.+)$", str(data_url or ""), re.I | re.S)
    if not match:
        raise ValueError("voice sample must be an audio data URL")
    mime = match.group(1).lower()
    raw = base64.b64decode(match.group(2), validate=True)
    if not raw:
        raise ValueError("voice sample is empty")
    suffix = ".wav" if "wav" in mime else ".mp3" if "mpeg" in mime or "mp3" in mime else ".audio"
    root.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]+", "-", str(name or "voice-sample")).strip("-") or "voice-sample"
    profile_id = f"voice_{uuid.uuid4().hex[:10]}"
    path = root / f"{profile_id}-{safe_name}{suffix}"
    path.write_bytes(raw)
    return {
        "id": profile_id,
        "provider": normalize_provider(provider),
        "voice_mode": "cloned",
        "status": "local_sample",
        "sample_path": str(path),
        "mime": mime,
        "bytes": len(raw),
        "remote_voice_id": "",
    }
