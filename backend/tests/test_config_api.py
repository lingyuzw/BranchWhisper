from __future__ import annotations

import argparse
import sys
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


def make_settings(**overrides) -> SessionSettings:
    parser = argparse.ArgumentParser()
    add_settings_args(parser)
    settings = SessionSettings.from_args(parser.parse_args([]))
    settings.update_from_dict(overrides)
    for key, value in overrides.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    return settings


def make_client(settings: SessionSettings) -> TestClient:
    app = FastAPI()
    app.state.settings = settings
    app.include_router(create_config_router())
    return TestClient(app)


class ConfigApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_save = config_api.save_persisted_settings
        self.saved_payloads: list[dict] = []

        def fake_save(settings: SessionSettings, _path: Path) -> None:
            self.saved_payloads.append(
                {
                    "dialog_mode": settings.dialog_mode,
                    "api_llm_url": settings.api_llm_url,
                    "api_llm_model": settings.api_llm_model,
                    "api_llm_api_key": settings.api_llm_api_key,
                }
            )

        config_api.save_persisted_settings = fake_save

    def tearDown(self) -> None:
        config_api.save_persisted_settings = self.original_save

    def test_get_masks_api_llm_api_key(self) -> None:
        settings = make_settings(api_llm_api_key="sk-test-1234567890")
        client = make_client(settings)

        response = client.get("/api/config")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["api_llm_api_key"], "")
        self.assertTrue(payload["api_llm_api_key_set"])
        self.assertEqual(payload["api_llm_api_key_masked"], "sk-test***********************7890")
        self.assertNotIn("sk-test-1234567890", response.text)

    def test_patch_updates_api_llm_config_and_masks_response(self) -> None:
        settings = make_settings(api_llm_api_key="old-secret")
        client = make_client(settings)

        response = client.patch(
            "/api/config",
            json={
                "dialog_mode": "api",
                "api_llm_url": "https://api.example.test/v1/chat/completions",
                "api_llm_model": "qwen-plus",
                "api_llm_api_key": "new-secret-value",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(settings.dialog_mode, "api")
        self.assertEqual(settings.api_llm_url, "https://api.example.test/v1/chat/completions")
        self.assertEqual(settings.api_llm_model, "qwen-plus")
        self.assertEqual(settings.api_llm_api_key, "new-secret-value")
        self.assertEqual(self.saved_payloads[-1]["api_llm_api_key"], "new-secret-value")
        payload = response.json()
        self.assertEqual(payload["api_llm_api_key"], "")
        self.assertTrue(payload["api_llm_api_key_set"])
        self.assertEqual(payload["api_llm_api_key_masked"], "new-sec***********************alue")
        self.assertNotIn("new-secret-value", response.text)

    def test_patch_with_masked_api_llm_key_keeps_existing_key(self) -> None:
        settings = make_settings(api_llm_api_key="existing-secret")
        client = make_client(settings)

        response = client.patch(
            "/api/config",
            json={
                "dialog_mode": "api",
                "api_llm_url": "https://api.changed.test/v1/chat/completions",
                "api_llm_model": "changed-model",
                "api_llm_api_key": "existin***********************cret",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(settings.api_llm_api_key, "existing-secret")
        self.assertEqual(self.saved_payloads[-1]["api_llm_api_key"], "existing-secret")
        payload = response.json()
        self.assertEqual(payload["api_llm_api_key"], "")
        self.assertEqual(payload["api_llm_api_key_masked"], "existin***********************cret")
        self.assertNotIn("existing-secret", response.text)

    def test_patch_rolls_back_settings_when_save_fails(self) -> None:
        settings = make_settings(
            dialog_mode="local",
            api_llm_url="https://saved.example.test/v1/chat/completions",
            api_llm_model="saved-model",
            api_llm_api_key="saved-secret",
        )
        client = make_client(settings)

        def failing_save(_settings: SessionSettings, _path: Path) -> None:
            raise RuntimeError("disk full")

        config_api.save_persisted_settings = failing_save

        response = client.patch(
            "/api/config",
            json={
                "dialog_mode": "api",
                "api_llm_url": "https://unsaved.example.test/v1/chat/completions",
                "api_llm_model": "unsaved-model",
                "api_llm_api_key": "unsaved-secret",
            },
        )

        self.assertEqual(response.status_code, 500)
        self.assertIn("保存配置失败", response.text)
        self.assertEqual(settings.dialog_mode, "local")
        self.assertEqual(settings.api_llm_url, "https://saved.example.test/v1/chat/completions")
        self.assertEqual(settings.api_llm_model, "saved-model")
        self.assertEqual(settings.api_llm_api_key, "saved-secret")


if __name__ == "__main__":
    unittest.main()
