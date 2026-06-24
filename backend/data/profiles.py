from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path

from core.io_utils import write_json_file


DEFAULT_PROFILE_ID = "default"
DEFAULT_BRIDGE_PROVIDER = "openclaw"
DEFAULT_BRIDGE_INTEGRATION_ID = "weixin_personal"
DEFAULT_API_PROVIDER_ID = "qwen"
BRIDGE_PROVIDERS = {"openclaw", "compatible"}


def safe_id(value: str, fallback: str = DEFAULT_PROFILE_ID) -> str:
    text = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(value or "")).strip("_")
    return text[:64] or fallback


def normalize_reply_list(value) -> list[str]:
    if isinstance(value, str):
        raw_items = re.split(r"[\n,;，；\s]+", value)
    elif isinstance(value, list):
        raw_items = value
    else:
        raw_items = []
    items: list[str] = []
    seen: set[str] = set()
    for raw in raw_items:
        text = str(raw or "").strip()
        if not text:
            continue
        text = re.sub(r"\s+", "", text)[:120]
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(text)
    return items[:80]


class BotProfileStore:
    def __init__(self, path: Path, default_system: str):
        self.path = path
        self.default_system = default_system
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.save({"profiles": [self.default_profile()]})

    def default_profile(self) -> dict:
        now = self._now()
        return {
            "id": DEFAULT_PROFILE_ID,
            "name": "枝语",
            "avatar_url": "",
            "system": self.default_system,
            "tools_enabled": True,
            "reply_style": "natural",
            "bridge_provider": DEFAULT_BRIDGE_PROVIDER,
            "bridge_integration_id": DEFAULT_BRIDGE_INTEGRATION_ID,
            "bridge_url": "",
            "bridge_enabled": False,
            "api_provider_id": DEFAULT_API_PROVIDER_ID,
            "auto_reply_enabled": True,
            "allow_group_chats": False,
            "reply_allowlist": [],
            "reply_blocklist": [],
            "created_at": now,
            "updated_at": now,
        }

    def load(self) -> dict:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        profiles = data.get("profiles") if isinstance(data, dict) else None
        if not isinstance(profiles, list):
            profiles = []
        items = [self.normalize(item) for item in profiles if isinstance(item, dict)]
        if not any(item["id"] == DEFAULT_PROFILE_ID for item in items):
            items.insert(0, self.default_profile())
        return {"profiles": items}

    def list_profiles(self) -> dict:
        return self.load()

    def get(self, profile_id: str = "") -> dict:
        pid = safe_id(profile_id or DEFAULT_PROFILE_ID)
        for profile in self.load()["profiles"]:
            if profile["id"] == pid:
                return profile
        return self.default_profile()

    def create(self, payload: dict) -> dict:
        data = self.load()
        item = self.normalize({**payload, "id": payload.get("id") or f"profile_{uuid.uuid4().hex[:8]}"})
        if any(profile["id"] == item["id"] for profile in data["profiles"]):
            raise ValueError(f"profile already exists: {item['id']}")
        data["profiles"].append(item)
        self.save(data)
        return item

    def update(self, profile_id: str, payload: dict) -> dict:
        pid = safe_id(profile_id)
        data = self.load()
        for index, item in enumerate(data["profiles"]):
            if item["id"] != pid:
                continue
            merged = {**item, **payload, "id": item["id"], "updated_at": self._now()}
            data["profiles"][index] = self.normalize(merged)
            self.save(data)
            return data["profiles"][index]
        raise KeyError(profile_id)

    def delete(self, profile_id: str) -> bool:
        pid = safe_id(profile_id)
        if pid == DEFAULT_PROFILE_ID:
            return False
        data = self.load()
        next_items = [item for item in data["profiles"] if item["id"] != pid]
        if len(next_items) == len(data["profiles"]):
            return False
        data["profiles"] = next_items
        self.save(data)
        return True

    def normalize(self, item: dict) -> dict:
        now = self._now()
        bridge_provider = str(item.get("bridge_provider") or DEFAULT_BRIDGE_PROVIDER).strip().lower()
        if bridge_provider not in BRIDGE_PROVIDERS:
            bridge_provider = DEFAULT_BRIDGE_PROVIDER
        return {
            "id": safe_id(str(item.get("id") or DEFAULT_PROFILE_ID)),
            "name": str(item.get("name") or "枝语")[:80],
            "avatar_url": str(item.get("avatar_url") or ""),
            "system": str(item.get("system") or self.default_system),
            "tools_enabled": bool(item.get("tools_enabled", True)),
            "reply_style": str(item.get("reply_style") or "natural")[:40],
            "bridge_provider": bridge_provider,
            "bridge_integration_id": safe_id(
                str(item.get("bridge_integration_id") or DEFAULT_BRIDGE_INTEGRATION_ID),
                fallback=DEFAULT_BRIDGE_INTEGRATION_ID,
            ),
            "bridge_url": str(item.get("bridge_url") or "").strip()[:300],
            "bridge_enabled": bool(item.get("bridge_enabled", False)),
            "api_provider_id": safe_id(str(item.get("api_provider_id") or DEFAULT_API_PROVIDER_ID), fallback=DEFAULT_API_PROVIDER_ID).lower(),
            "auto_reply_enabled": bool(item.get("auto_reply_enabled", True)),
            "allow_group_chats": bool(item.get("allow_group_chats", False)),
            "reply_allowlist": normalize_reply_list(item.get("reply_allowlist")),
            "reply_blocklist": normalize_reply_list(item.get("reply_blocklist")),
            "created_at": str(item.get("created_at") or now),
            "updated_at": str(item.get("updated_at") or now),
        }

    def save(self, data: dict) -> None:
        write_json_file(self.path, data)

    def _now(self) -> str:
        return time.strftime("%Y-%m-%d %H:%M:%S")
