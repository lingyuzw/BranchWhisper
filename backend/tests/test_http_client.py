from __future__ import annotations

import sys
import unittest
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.http_client import is_local_url, request_with_retries, trust_env_for_url


class HttpClientRoutingTests(unittest.TestCase):
    def test_loopback_and_private_urls_do_not_trust_proxy_env(self) -> None:
        self.assertTrue(is_local_url("http://127.0.0.1:8001/health"))
        self.assertTrue(is_local_url("http://localhost:7860/api/health"))
        self.assertTrue(is_local_url("http://192.168.31.5:5173/app/"))
        self.assertTrue(is_local_url("http://10.0.0.8:8080/v1/models"))
        self.assertFalse(trust_env_for_url("http://127.0.0.1:8001/health"))

    def test_remote_api_urls_keep_proxy_env_available(self) -> None:
        self.assertFalse(is_local_url("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        self.assertTrue(trust_env_for_url("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))


class FakeRetryClient:
    def __init__(self, failures: int) -> None:
        self.failures = failures
        self.calls: list[tuple[str, str, dict]] = []

    async def request(self, method: str, url: str, **kwargs):
        self.calls.append((method, url, kwargs))
        if len(self.calls) <= self.failures:
            raise httpx.ConnectError("temporary connect failure")
        return httpx.Response(200, json={"ok": True})


class HttpClientRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_retries_transient_connect_errors(self) -> None:
        client = FakeRetryClient(failures=1)

        response = await request_with_retries(client, "POST", "https://dashscope.aliyuncs.com/v1", attempts=2, delay=0)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(client.calls), 2)

    async def test_raises_after_retry_budget_is_exhausted(self) -> None:
        client = FakeRetryClient(failures=3)

        with self.assertRaises(httpx.ConnectError):
            await request_with_retries(client, "POST", "https://dashscope.aliyuncs.com/v1", attempts=2, delay=0)

        self.assertEqual(len(client.calls), 2)


if __name__ == "__main__":
    unittest.main()
