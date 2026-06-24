from __future__ import annotations

import argparse
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

import api.config as config_api
from api.config import create_config_router
from core.config import SessionSettings, add_settings_args
from data.api_providers import ApiProviderStore


def make_settings(**overrides) -> SessionSettings:
    parser = argparse.ArgumentParser()
    add_settings_args(parser)
    settings = SessionSettings.from_args(parser.parse_args([]))
    settings.update_from_dict(overrides)
    for key, value in overrides.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    return settings


def make_client(store: ApiProviderStore, settings: SessionSettings) -> TestClient:
    app = FastAPI()
    app.state.api_providers = store
    app.state.settings = settings
    app.include_router(create_config_router())
    return TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000))


class ApiProviderConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.provider_path = Path(self.temp_dir.name) / "api_providers.json"
        self.store = ApiProviderStore(self.provider_path)
        self.settings = make_settings(dialog_mode="local", api_llm_api_key="saved-secret")
        self.client = make_client(self.store, self.settings)
        self.original_save = config_api.save_persisted_settings
        self.saved_settings: list[dict] = []
        self.original_allow_remote = {
            "BRANCHWHISPER_ALLOW_REMOTE_SERVICE_CONTROL": os.environ.pop(
                "BRANCHWHISPER_ALLOW_REMOTE_SERVICE_CONTROL",
                None,
            ),
            "BUDING_ALLOW_REMOTE_SERVICE_CONTROL": os.environ.pop("BUDING_ALLOW_REMOTE_SERVICE_CONTROL", None),
        }

        def fake_save(settings: SessionSettings, _path: Path) -> None:
            self.saved_settings.append(
                {
                    "dialog_mode": settings.dialog_mode,
                    "api_llm_url": settings.api_llm_url,
                    "api_llm_model": settings.api_llm_model,
                    "api_llm_api_key": settings.api_llm_api_key,
                    "api_temperature": settings.api_temperature,
                    "api_max_tokens": settings.api_max_tokens,
                }
            )

        config_api.save_persisted_settings = fake_save

    def tearDown(self) -> None:
        config_api.save_persisted_settings = self.original_save
        for key, value in self.original_allow_remote.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)
        self.temp_dir.cleanup()

    def test_get_returns_default_providers_without_secret_values(self) -> None:
        response = self.client.get("/api/config/api-providers")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["active_id"], "qwen")
        provider_ids = [item["id"] for item in payload["providers"]]
        self.assertEqual(provider_ids[:4], ["qwen", "deepseek", "openai", "custom"])
        self.assertEqual(payload["providers"][0]["url"], "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        for item in payload["providers"]:
            self.assertEqual(item["api_key"], "")
            self.assertIn("api_key_set", item)
            self.assertIn("api_key_masked", item)
        self.assertNotIn("saved-secret", response.text)

    def test_create_provider_persists_secret_but_masks_public_response(self) -> None:
        response = self.client.post(
            "/api/config/api-providers",
            json={
                "id": "my-provider",
                "name": "我的 API",
                "url": "https://api.example.test/v1/chat/completions",
                "model": "example-chat",
                "api_key": "sk-example-secret",
                "temperature": 0.4,
                "max_tokens": 2048,
            },
        )

        self.assertEqual(response.status_code, 200)
        provider = response.json()["provider"]
        self.assertEqual(provider["id"], "my-provider")
        self.assertEqual(provider["api_key"], "")
        self.assertTrue(provider["api_key_set"])
        self.assertEqual(provider["api_key_masked"], "sk-exam***********************cret")
        self.assertNotIn("sk-example-secret", response.text)

        persisted = json.loads(self.provider_path.read_text(encoding="utf-8"))
        saved = next(item for item in persisted["providers"] if item["id"] == "my-provider")
        self.assertEqual(saved["api_key"], "sk-example-secret")

    def test_patch_provider_keeps_existing_secret_when_masked_key_is_submitted(self) -> None:
        created = self.store.create(
            {
                "id": "my-provider",
                "name": "我的 API",
                "url": "https://api.example.test/v1/chat/completions",
                "model": "example-chat",
                "api_key": "sk-existing-secret",
            }
        )

        response = self.client.patch(
            f"/api/config/api-providers/{created['id']}",
            json={
                "name": "我的 API v2",
                "model": "example-chat-v2",
                "api_key": "sk-exi***********************cret",
            },
        )

        self.assertEqual(response.status_code, 200)
        provider = response.json()["provider"]
        self.assertEqual(provider["name"], "我的 API v2")
        self.assertEqual(provider["model"], "example-chat-v2")
        self.assertEqual(provider["api_key"], "")
        persisted = json.loads(self.provider_path.read_text(encoding="utf-8"))
        saved = next(item for item in persisted["providers"] if item["id"] == "my-provider")
        self.assertEqual(saved["api_key"], "sk-existing-secret")
        self.assertNotIn("sk-existing-secret", response.text)

    def test_activate_provider_updates_current_llm_api_config_and_persists_settings(self) -> None:
        self.store.create(
            {
                "id": "my-provider",
                "name": "我的 API",
                "url": "https://api.example.test/v1/chat/completions",
                "model": "example-chat",
                "api_key": "sk-activate-secret",
                "temperature": 0.2,
                "max_tokens": 3072,
            }
        )

        response = self.client.post("/api/config/api-providers/my-provider/activate")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["active_id"], "my-provider")
        self.assertEqual(self.settings.dialog_mode, "api")
        self.assertEqual(self.settings.api_llm_url, "https://api.example.test/v1/chat/completions")
        self.assertEqual(self.settings.api_llm_model, "example-chat")
        self.assertEqual(self.settings.api_llm_api_key, "sk-activate-secret")
        self.assertEqual(self.settings.api_temperature, 0.2)
        self.assertEqual(self.settings.api_max_tokens, 3072)
        self.assertEqual(self.saved_settings[-1]["api_llm_api_key"], "sk-activate-secret")
        self.assertNotIn("sk-activate-secret", response.text)

    def test_delete_custom_provider_removes_it_without_deleting_default_presets(self) -> None:
        self.store.create({"id": "temporary", "name": "临时 API", "url": "https://tmp.example.test", "model": "tmp"})

        response = self.client.delete("/api/config/api-providers/temporary")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertNotIn("temporary", [item["id"] for item in payload["providers"]])
        self.assertIn("qwen", [item["id"] for item in payload["providers"]])

        response = self.client.delete("/api/config/api-providers/qwen")

        self.assertEqual(response.status_code, 409)
        self.assertIn("default provider cannot be deleted", response.text)


if __name__ == "__main__":
    unittest.main()
