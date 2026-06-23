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

import api.diagnostics as diagnostics_api
from api.diagnostics import create_diagnostics_router
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
    app.include_router(create_diagnostics_router())
    return TestClient(app)


class FakeResponse:
    text = '{"choices":[]}'

    def __init__(self, body: dict | None = None, status_code: int = 200) -> None:
        self.status_code = status_code
        self._body = body or {
            "id": "chatcmpl-test",
            "model": "provider-model",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "pong"}}],
        }

    def json(self) -> dict:
        return self._body


class FakeClient:
    def __init__(self, calls: list[dict]) -> None:
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb) -> None:
        return None

    async def post(self, url: str, *, json: dict, headers: dict):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return FakeResponse()


class RaisingClient(FakeClient):
    def __init__(self, calls: list[dict], message: str) -> None:
        super().__init__(calls)
        self.message = message

    async def post(self, url: str, *, json: dict, headers: dict):
        self.calls.append({"url": url, "json": json, "headers": headers})
        raise RuntimeError(self.message)


class ErrorBodyClient(FakeClient):
    def __init__(self, calls: list[dict], body: dict) -> None:
        super().__init__(calls)
        self.body = body

    async def post(self, url: str, *, json: dict, headers: dict):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return FakeResponse(self.body, status_code=401)


class LlmApiDiagnosticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_factory = diagnostics_api.httpx_client_for_url
        self.client_urls: list[dict] = []
        self.post_calls: list[dict] = []

        def fake_factory(url: str, timeout=None):
            self.client_urls.append({"url": url, "timeout": timeout})
            return FakeClient(self.post_calls)

        diagnostics_api.httpx_client_for_url = fake_factory

    def tearDown(self) -> None:
        diagnostics_api.httpx_client_for_url = self.original_factory

    def test_llm_api_test_uses_unsaved_body_values(self) -> None:
        settings = make_settings(
            api_llm_url="https://saved.example.test/v1/chat/completions",
            api_llm_model="saved-model",
            api_llm_api_key="saved-secret",
        )
        client = make_client(settings)

        response = client.post(
            "/api/diagnostics/llm-api-test",
            json={
                "url": "https://unsaved.example.test/v1/chat/completions",
                "model": "unsaved-model",
                "api_key": "unsaved-secret",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["url"], "https://unsaved.example.test/v1/chat/completions")
        self.assertEqual(payload["model"], "unsaved-model")
        self.assertEqual(self.client_urls[0]["url"], "https://unsaved.example.test/v1/chat/completions")
        self.assertEqual(self.post_calls[0]["json"]["model"], "unsaved-model")
        self.assertEqual(self.post_calls[0]["headers"]["Authorization"], "Bearer unsaved-secret")
        self.assertNotIn("unsaved-secret", response.text)

    def test_llm_api_test_accepts_api_llm_api_key_alias(self) -> None:
        settings = make_settings(api_llm_api_key="saved-secret")
        client = make_client(settings)

        response = client.post(
            "/api/diagnostics/llm-api-test",
            json={
                "api_llm_url": "https://alias.example.test/v1/chat/completions",
                "api_llm_model": "alias-model",
                "api_llm_api_key": "alias-secret",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["url"], "https://alias.example.test/v1/chat/completions")
        self.assertEqual(payload["model"], "alias-model")
        self.assertEqual(self.post_calls[0]["headers"]["Authorization"], "Bearer alias-secret")
        self.assertNotIn("alias-secret", response.text)

    def test_llm_api_test_keeps_saved_key_when_public_config_key_is_empty_or_masked(self) -> None:
        settings = make_settings(
            api_llm_url="https://saved.example.test/v1/chat/completions",
            api_llm_model="saved-model",
            api_llm_api_key="saved-secret",
        )
        client = make_client(settings)

        empty_response = client.post(
            "/api/diagnostics/llm-api-test",
            json={
                "api_llm_url": "https://public.example.test/v1/chat/completions",
                "api_llm_model": "public-model",
                "api_llm_api_key": "",
            },
        )
        masked_response = client.post(
            "/api/diagnostics/llm-api-test",
            json={
                "api_llm_url": "https://masked.example.test/v1/chat/completions",
                "api_llm_model": "masked-model",
                "api_llm_api_key": "saved-s***********************cret",
            },
        )

        self.assertTrue(empty_response.json()["ok"])
        self.assertTrue(masked_response.json()["ok"])
        self.assertEqual(self.post_calls[0]["headers"]["Authorization"], "Bearer saved-secret")
        self.assertEqual(self.post_calls[1]["headers"]["Authorization"], "Bearer saved-secret")
        self.assertNotIn("saved-secret", empty_response.text)
        self.assertNotIn("saved-secret", masked_response.text)

    def test_llm_api_test_without_body_uses_saved_settings(self) -> None:
        settings = make_settings(
            api_llm_url="https://saved.example.test/v1/chat/completions",
            api_llm_model="saved-model",
            api_llm_api_key="saved-secret",
        )
        client = make_client(settings)

        response = client.post("/api/diagnostics/llm-api-test")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["url"], "https://saved.example.test/v1/chat/completions")
        self.assertEqual(payload["model"], "saved-model")
        self.assertEqual(self.post_calls[0]["headers"]["Authorization"], "Bearer saved-secret")
        self.assertNotIn("saved-secret", response.text)

    def test_llm_api_test_redacts_api_key_from_error_response(self) -> None:
        secret = "leaky-secret-token"

        def fake_factory(url: str, timeout=None):
            self.client_urls.append({"url": url, "timeout": timeout})
            return RaisingClient(self.post_calls, f"provider echoed {secret}")

        diagnostics_api.httpx_client_for_url = fake_factory
        client = make_client(
            make_settings(
                api_llm_url="https://saved.example.test/v1/chat/completions",
                api_llm_model="saved-model",
                api_llm_api_key=secret,
            )
        )

        response = client.post("/api/diagnostics/llm-api-test")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertIn("[redacted]", payload["error"])
        self.assertNotIn(secret, response.text)

    def test_llm_api_test_redacts_api_key_from_provider_json_response(self) -> None:
        secret = "leaky-secret-token"

        def fake_factory(url: str, timeout=None):
            self.client_urls.append({"url": url, "timeout": timeout})
            return ErrorBodyClient(
                self.post_calls,
                {
                    "error": {"message": f"bad key {secret}"},
                    "debug": ["provider echoed", secret],
                },
            )

        diagnostics_api.httpx_client_for_url = fake_factory
        client = make_client(
            make_settings(
                api_llm_url="https://saved.example.test/v1/chat/completions",
                api_llm_model="saved-model",
                api_llm_api_key=secret,
            )
        )

        response = client.post("/api/diagnostics/llm-api-test")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"], "bad key [redacted]")
        self.assertIn("[redacted]", str(payload["response"]))
        self.assertNotIn(secret, response.text)


if __name__ == "__main__":
    unittest.main()
