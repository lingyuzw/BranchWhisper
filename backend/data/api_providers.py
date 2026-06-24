from __future__ import annotations

import json
import re
import time
from pathlib import Path

from core.config import DEFAULT_API_LLM_MODEL, DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL, MASKED_SECRET_CHARS, mask_secret
from core.io_utils import write_json_file


DEFAULT_API_PROVIDER_IDS = {"qwen", "deepseek", "openai", "custom"}


def safe_provider_id(value: str, fallback: str = "custom") -> str:
    text = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(value or "")).strip("_").lower()
    return text[:64] or fallback


class ApiProviderStore:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.save({"active_id": "qwen", "providers": self.default_providers()})

    def default_providers(self) -> list[dict]:
        now = self._now()
        return [
            {
                "id": "qwen",
                "name": "Qwen",
                "url": DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL,
                "model": DEFAULT_API_LLM_MODEL,
                "api_key": "",
                "temperature": 0.7,
                "max_tokens": 1024,
                "editable": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "deepseek",
                "name": "DeepSeek",
                "url": "https://api.deepseek.com/v1/chat/completions",
                "model": "deepseek-chat",
                "api_key": "",
                "temperature": 0.7,
                "max_tokens": 1024,
                "editable": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "openai",
                "name": "OpenAI 兼容",
                "url": "https://api.openai.com/v1/chat/completions",
                "model": "gpt-4o-mini",
                "api_key": "",
                "temperature": 0.7,
                "max_tokens": 1024,
                "editable": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "custom",
                "name": "自定义 API",
                "url": "",
                "model": "",
                "api_key": "",
                "temperature": 0.7,
                "max_tokens": 1024,
                "editable": False,
                "created_at": now,
                "updated_at": now,
            },
        ]

    def load(self) -> dict:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        providers = data.get("providers") if isinstance(data, dict) else None
        if not isinstance(providers, list):
            providers = []
        merged: dict[str, dict] = {item["id"]: item for item in self.default_providers()}
        for item in providers:
            if isinstance(item, dict):
                normalized = self.normalize(item)
                merged[normalized["id"]] = normalized
        ordered = [merged.pop(provider_id) for provider_id in ["qwen", "deepseek", "openai", "custom"]]
        ordered.extend(sorted(merged.values(), key=lambda item: item.get("created_at") or ""))
        active_id = safe_provider_id(str(data.get("active_id") or "qwen")) if isinstance(data, dict) else "qwen"
        if not any(item["id"] == active_id for item in ordered):
            active_id = "qwen"
        return {"active_id": active_id, "providers": ordered}

    def public(self) -> dict:
        data = self.load()
        return {"active_id": data["active_id"], "providers": [self.public_provider(item) for item in data["providers"]]}

    def get(self, provider_id: str) -> dict:
        pid = safe_provider_id(provider_id)
        for item in self.load()["providers"]:
            if item["id"] == pid:
                return item
        raise KeyError(provider_id)

    def create(self, payload: dict) -> dict:
        data = self.load()
        item = self.normalize({**payload, "editable": True})
        if any(provider["id"] == item["id"] for provider in data["providers"]):
            raise ValueError(f"provider already exists: {item['id']}")
        data["providers"].append(item)
        self.save(data)
        return self.public_provider(item)

    def update(self, provider_id: str, payload: dict) -> dict:
        pid = safe_provider_id(provider_id)
        data = self.load()
        for index, item in enumerate(data["providers"]):
            if item["id"] != pid:
                continue
            next_payload = {**item, **payload, "id": item["id"], "editable": item.get("editable", pid not in DEFAULT_API_PROVIDER_IDS), "updated_at": self._now()}
            raw_key = payload.get("api_key") if isinstance(payload, dict) else None
            if raw_key is None or not str(raw_key).strip() or MASKED_SECRET_CHARS in str(raw_key):
                next_payload["api_key"] = item.get("api_key", "")
            data["providers"][index] = self.normalize(next_payload)
            self.save(data)
            return self.public_provider(data["providers"][index])
        raise KeyError(provider_id)

    def delete(self, provider_id: str) -> bool:
        pid = safe_provider_id(provider_id)
        if pid in DEFAULT_API_PROVIDER_IDS:
            raise ValueError("default provider cannot be deleted")
        data = self.load()
        providers = [item for item in data["providers"] if item["id"] != pid]
        if len(providers) == len(data["providers"]):
            return False
        data["providers"] = providers
        if data["active_id"] == pid:
            data["active_id"] = "qwen"
        self.save(data)
        return True

    def activate(self, provider_id: str) -> dict:
        provider = self.get(provider_id)
        data = self.load()
        data["active_id"] = provider["id"]
        self.save(data)
        return provider

    def normalize(self, item: dict) -> dict:
        now = self._now()
        provider_id = safe_provider_id(str(item.get("id") or item.get("name") or "custom"))
        raw_key = str(item.get("api_key") or "").strip()
        return {
            "id": provider_id,
            "name": str(item.get("name") or provider_id)[:80],
            "url": str(item.get("url") or item.get("api_llm_url") or "").strip()[:500],
            "model": str(item.get("model") or item.get("api_llm_model") or "").strip()[:160],
            "api_key": "" if MASKED_SECRET_CHARS in raw_key else raw_key,
            "temperature": float(item.get("temperature", 0.7) or 0.7),
            "max_tokens": int(item.get("max_tokens", 1024) or 1024),
            "editable": bool(item.get("editable", provider_id not in DEFAULT_API_PROVIDER_IDS)),
            "created_at": str(item.get("created_at") or now),
            "updated_at": str(item.get("updated_at") or now),
        }

    def public_provider(self, item: dict) -> dict:
        api_key = str(item.get("api_key") or "")
        result = dict(item)
        result["api_key"] = ""
        result["api_key_set"] = bool(api_key)
        result["api_key_masked"] = mask_secret(api_key)
        return result

    def save(self, data: dict) -> None:
        write_json_file(self.path, data)

    def _now(self) -> str:
        return time.strftime("%Y-%m-%d %H:%M:%S")
