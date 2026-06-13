from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.http_client import is_local_url, trust_env_for_url


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


if __name__ == "__main__":
    unittest.main()
