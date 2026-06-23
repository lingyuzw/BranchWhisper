from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from api.profiles import create_profiles_router
from data.profiles import BotProfileStore


def make_client(store: BotProfileStore) -> TestClient:
    app = FastAPI()
    app.state.bot_profiles = store
    app.include_router(create_profiles_router())
    return TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000))


class BotProfilesApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.profile_path = Path(self.temp_dir.name) / "profiles.json"
        self.store = BotProfileStore(self.profile_path, "默认模型人格")
        self.client = make_client(self.store)
        self.original_allow_remote = {
            "BRANCHWHISPER_ALLOW_REMOTE_SERVICE_CONTROL": os.environ.pop(
                "BRANCHWHISPER_ALLOW_REMOTE_SERVICE_CONTROL",
                None,
            ),
            "BUDING_ALLOW_REMOTE_SERVICE_CONTROL": os.environ.pop("BUDING_ALLOW_REMOTE_SERVICE_CONTROL", None),
        }

    def tearDown(self) -> None:
        for key, value in self.original_allow_remote.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)
        self.temp_dir.cleanup()

    def test_get_returns_default_profile(self) -> None:
        response = self.client.get("/api/bot-profiles")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["profiles"]), 1)
        self.assertEqual(payload["profiles"][0]["id"], "default")
        self.assertEqual(payload["profiles"][0]["system"], "默认模型人格")
        self.assertEqual(payload["profiles"][0]["bridge_provider"], "openclaw")
        self.assertEqual(payload["profiles"][0]["bridge_integration_id"], "weixin_personal")
        self.assertEqual(payload["profiles"][0]["bridge_url"], "")
        self.assertFalse(payload["profiles"][0]["bridge_enabled"])
        self.assertTrue(payload["profiles"][0]["auto_reply_enabled"])
        self.assertFalse(payload["profiles"][0]["allow_group_chats"])
        self.assertEqual(payload["profiles"][0]["reply_allowlist"], [])
        self.assertEqual(payload["profiles"][0]["reply_blocklist"], [])

    def test_create_profile_persists_bot_persona(self) -> None:
        response = self.client.post(
            "/api/bot-profiles",
            json={
                "id": "morning-bot",
                "name": "早安助手",
                "system": "只负责自然早安问候，不编造天气。",
                "reply_style": "warm",
                "tools_enabled": False,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["profile"]["id"], "morning-bot")
        self.assertEqual(payload["profile"]["name"], "早安助手")
        self.assertEqual(payload["profile"]["system"], "只负责自然早安问候，不编造天气。")
        self.assertEqual(payload["profile"]["reply_style"], "warm")
        self.assertFalse(payload["profile"]["tools_enabled"])

        persisted = json.loads(self.profile_path.read_text(encoding="utf-8"))
        self.assertIn("morning-bot", [profile["id"] for profile in persisted["profiles"]])

    def test_create_profile_persists_weixin_bridge_config(self) -> None:
        response = self.client.post(
            "/api/bot-profiles",
            json={
                "id": "wx-bot",
                "name": "微信 Bot",
                "bridge_provider": "compatible",
                "bridge_integration_id": "weixin_work",
                "bridge_url": "http://127.0.0.1:19088",
                "bridge_enabled": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        profile = response.json()["profile"]
        self.assertEqual(profile["bridge_provider"], "compatible")
        self.assertEqual(profile["bridge_integration_id"], "weixin_work")
        self.assertEqual(profile["bridge_url"], "http://127.0.0.1:19088")
        self.assertTrue(profile["bridge_enabled"])

        reloaded = BotProfileStore(self.profile_path, "默认模型人格")
        self.assertEqual(reloaded.get("wx-bot")["bridge_integration_id"], "weixin_work")

    def test_create_profile_persists_reply_guard_config(self) -> None:
        response = self.client.post(
            "/api/bot-profiles",
            json={
                "id": "safe-wx-bot",
                "name": "安全微信 Bot",
                "auto_reply_enabled": False,
                "allow_group_chats": True,
                "reply_allowlist": ["friend-im-wechat", "family-room@chatroom", ""],
                "reply_blocklist": "spam-user\nannoying-room@chatroom",
            },
        )

        self.assertEqual(response.status_code, 200)
        profile = response.json()["profile"]
        self.assertFalse(profile["auto_reply_enabled"])
        self.assertTrue(profile["allow_group_chats"])
        self.assertEqual(profile["reply_allowlist"], ["friend-im-wechat", "family-room@chatroom"])
        self.assertEqual(profile["reply_blocklist"], ["spam-user", "annoying-room@chatroom"])

        reloaded = BotProfileStore(self.profile_path, "默认模型人格")
        self.assertEqual(reloaded.get("safe-wx-bot")["reply_blocklist"], ["spam-user", "annoying-room@chatroom"])

    def test_create_duplicate_profile_returns_conflict(self) -> None:
        self.client.post("/api/bot-profiles", json={"id": "wechat-bot", "name": "微信 Bot"})

        response = self.client.post("/api/bot-profiles", json={"id": "wechat-bot", "name": "重复 Bot"})

        self.assertEqual(response.status_code, 409)
        self.assertIn("profile already exists", response.text)

    def test_patch_updates_existing_profile(self) -> None:
        self.client.post("/api/bot-profiles", json={"id": "task-bot", "name": "任务 Bot", "system": "旧人格"})

        response = self.client.patch(
            "/api/bot-profiles/task-bot",
            json={"name": "任务提醒 Bot", "system": "只处理明确提醒，没有提醒就不多说。"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"]["name"], "任务提醒 Bot")
        self.assertEqual(response.json()["profile"]["system"], "只处理明确提醒，没有提醒就不多说。")
        reloaded = BotProfileStore(self.profile_path, "默认模型人格")
        self.assertEqual(reloaded.get("task-bot")["system"], "只处理明确提醒，没有提醒就不多说。")

    def test_patch_updates_weixin_bridge_config(self) -> None:
        self.client.post("/api/bot-profiles", json={"id": "wx-bot", "name": "微信 Bot"})

        response = self.client.patch(
            "/api/bot-profiles/wx-bot",
            json={
                "bridge_provider": "openclaw",
                "bridge_integration_id": "weixin_personal",
                "bridge_url": "http://127.0.0.1:18080",
                "bridge_enabled": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        profile = response.json()["profile"]
        self.assertEqual(profile["bridge_provider"], "openclaw")
        self.assertEqual(profile["bridge_integration_id"], "weixin_personal")
        self.assertEqual(profile["bridge_url"], "http://127.0.0.1:18080")
        self.assertTrue(profile["bridge_enabled"])

        reloaded = BotProfileStore(self.profile_path, "默认模型人格")
        self.assertEqual(reloaded.get("wx-bot")["bridge_url"], "http://127.0.0.1:18080")

    def test_delete_profile_keeps_default_profile(self) -> None:
        self.client.post("/api/bot-profiles", json={"id": "temporary-bot", "name": "临时 Bot"})

        deleted = self.client.delete("/api/bot-profiles/temporary-bot")
        default_deleted = self.client.delete("/api/bot-profiles/default")

        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["ok"])
        self.assertEqual(default_deleted.status_code, 200)
        self.assertFalse(default_deleted.json()["ok"])
        self.assertIn("default", [profile["id"] for profile in default_deleted.json()["profiles"]])

    def test_remote_profile_access_is_rejected_without_override(self) -> None:
        app = FastAPI()
        app.state.bot_profiles = self.store
        app.include_router(create_profiles_router())
        remote_client = TestClient(app, base_url="http://example.test", client=("203.0.113.10", 50000))

        response = remote_client.get("/api/bot-profiles")

        self.assertEqual(response.status_code, 403)
        self.assertIn("restricted to localhost", response.text)


if __name__ == "__main__":
    unittest.main()
