from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any

from core.http_client import httpx_client_for_url
from service_runtime.audio_pipeline import extract_chat_message_text, strip_reasoning_text


STICKER_EMOTIONS = [
    "laugh",
    "smug",
    "angry",
    "sad",
    "comfort",
    "confused",
    "shock",
    "sleepy",
    "cute",
    "bye",
    "silent",
    "agree",
    "reject",
]


def default_sticker_analysis() -> dict:
    return {
        "emotion": "laugh",
        "intensity": 3,
        "tags": [],
        "scene": [],
        "avoid": [],
        "caption": "",
        "ocr_text": "",
        "description": "",
        "confidence": 0.0,
    }


def normalize_analysis(data: dict[str, Any]) -> dict:
    result = default_sticker_analysis()
    emotion = str(data.get("emotion") or "").strip().lower()
    result["emotion"] = emotion if emotion in STICKER_EMOTIONS else "laugh"
    try:
        result["intensity"] = max(1, min(5, int(float(data.get("intensity", 3)))))
    except Exception:
        result["intensity"] = 3
    for key in ("tags", "scene", "avoid"):
        value = data.get(key)
        if isinstance(value, list):
            result[key] = [str(item).strip()[:32] for item in value if str(item).strip()][:8]
        elif isinstance(value, str) and value.strip():
            result[key] = [item.strip()[:32] for item in re.split(r"[,，、\s]+", value) if item.strip()][:8]
    for key in ("caption", "ocr_text", "description"):
        result[key] = str(data.get(key) or "").strip()[:300]
    try:
        result["confidence"] = max(0.0, min(1.0, float(data.get("confidence", 0.0))))
    except Exception:
        result["confidence"] = 0.0
    return result


def extract_json_object(text: str) -> dict:
    text = strip_reasoning_text(str(text or "")).strip()
    if not text:
        raise ValueError("Vision returned empty content")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, flags=re.S)
    if not match:
        raise ValueError("Vision did not return a JSON object")
    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("Vision JSON is not an object")
    return parsed


def image_data_url(image_path: Path, mime: str = "image/png") -> str:
    encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:{mime or 'image/png'};base64,{encoded}"


def vision_headers(api_key: str = "") -> dict[str, str]:
    api_key = str(api_key or "").strip()
    return {"Authorization": f"Bearer {api_key}"} if api_key else {}


async def call_openai_vision(
    *,
    url: str,
    model: str,
    image_path: Path,
    prompt: str,
    mime: str = "image/png",
    api_key: str = "",
    timeout: float = 45.0,
    max_tokens: int = 420,
    temperature: float = 0.1,
) -> str:
    if not str(url or "").strip():
        raise RuntimeError("Vision URL is not configured")
    if not str(model or "").strip():
        raise RuntimeError("Vision model is not configured")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_data_url(image_path, mime)}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "stream": False,
        "temperature": temperature,
        "max_tokens": max(128, min(4096, int(max_tokens or 420))),
    }
    async with httpx_client_for_url(str(url), timeout=float(timeout or 45.0)) as client:
        resp = await client.post(str(url), json=payload, headers=vision_headers(api_key))
    resp.raise_for_status()
    text = extract_chat_message_text(resp.json()).strip()
    if not text:
        raise RuntimeError("Vision returned empty content")
    return text


class ChatImageAnalyzer:
    def __init__(self, settings) -> None:
        self.settings = settings

    def providers(self) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        if getattr(self.settings, "vision_enabled", True):
            candidates.append(
                {
                    "name": "vision",
                    "url": getattr(self.settings, "vision_url", ""),
                    "model": getattr(self.settings, "vision_model", ""),
                    "api_key": getattr(self.settings, "vision_api_key", ""),
                    "timeout": float(getattr(self.settings, "vision_timeout", 45.0)),
                    "max_tokens": 520,
                }
            )
        if getattr(self.settings, "sticker_vision_enabled", True):
            candidates.append(
                {
                    "name": "sticker_vision",
                    "url": getattr(self.settings, "sticker_vision_url", ""),
                    "model": getattr(self.settings, "sticker_vision_model", ""),
                    "api_key": getattr(self.settings, "sticker_vision_api_key", ""),
                    "timeout": float(getattr(self.settings, "sticker_vision_timeout", getattr(self.settings, "vision_timeout", 45.0))),
                    "max_tokens": int(getattr(self.settings, "sticker_vision_max_tokens", 520) or 520),
                }
            )
        providers: list[dict[str, Any]] = []
        seen: set[tuple[str, str, bool]] = set()
        for item in candidates:
            url = str(item.get("url") or "").strip()
            model = str(item.get("model") or "").strip()
            key = (url.rstrip("/"), model, bool(str(item.get("api_key") or "").strip()))
            if not url or not model or key in seen:
                continue
            seen.add(key)
            providers.append(item)
        return providers

    async def describe(self, image_path: Path, mime: str = "image/png") -> str:
        providers = self.providers()
        if not providers:
            raise RuntimeError("Image understanding is disabled or no Vision API is configured")
        errors = []
        prompt = "请用中文简洁描述这张图片的主要内容、可见文字和用户可能想表达的意思。不要编造看不见的信息。"
        for provider in providers:
            try:
                return await call_openai_vision(
                    url=str(provider.get("url") or ""),
                    model=str(provider.get("model") or ""),
                    image_path=image_path,
                    prompt=prompt,
                    mime=mime,
                    api_key=str(provider.get("api_key") or ""),
                    timeout=float(provider.get("timeout") or 45.0),
                    max_tokens=int(provider.get("max_tokens") or 520),
                    temperature=0.1,
                )
            except Exception as exc:
                errors.append(f"{provider.get('name')}({provider.get('model') or '-'}) failed: {exc}")
        raise RuntimeError("; ".join(errors) or "Vision API failed")

    async def test(self, image_path: Path, mime: str = "image/png") -> dict:
        return {"ok": True, "description": await self.describe(image_path, mime=mime)}


class StickerVisionAnalyzer:
    def __init__(self, settings) -> None:
        self.settings = settings

    async def analyze(self, image_path: Path, mime: str = "image/png") -> dict:
        if not getattr(self.settings, "sticker_vision_enabled", True):
            raise RuntimeError("Sticker vision API is disabled")
        prompt = (
            "你是表情包入库分析器。请只输出 JSON 对象，不要 Markdown。"
            "字段必须包含 emotion, intensity, tags, scene, avoid, caption, ocr_text, description, confidence。"
            "emotion 只能从以下值选择：laugh, smug, angry, sad, comfort, confused, shock, sleepy, cute, bye, silent, agree, reject。"
            "intensity 为 1-5；tags/scene/avoid 为中文短语数组。"
            "caption 用一句中文说明这个表情适合什么时候发。"
            "ocr_text 填图片里能看清的文字，没有则空字符串。"
        )
        text = await call_openai_vision(
            url=getattr(self.settings, "sticker_vision_url", "") or getattr(self.settings, "vision_url", ""),
            model=getattr(self.settings, "sticker_vision_model", "") or getattr(self.settings, "vision_model", ""),
            image_path=image_path,
            prompt=prompt,
            mime=mime,
            api_key=getattr(self.settings, "sticker_vision_api_key", ""),
            timeout=float(getattr(self.settings, "sticker_vision_timeout", getattr(self.settings, "vision_timeout", 45.0))),
            max_tokens=int(getattr(self.settings, "sticker_vision_max_tokens", 420) or 420),
            temperature=0.1,
        )
        return normalize_analysis(extract_json_object(text))

    async def test(self, image_path: Path, mime: str = "image/png") -> dict:
        return {"ok": True, "analysis": await self.analyze(image_path, mime=mime)}
