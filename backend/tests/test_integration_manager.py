from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import integration_runtime.manager as manager_module
from integration_runtime.manager import IntegrationManager


class IntegrationManagerProcessEnvTests(unittest.TestCase):
    def test_bridge_process_env_always_bypasses_proxy_for_loopback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(
            os.environ,
            {"NO_PROXY": "example.com", "no_proxy": ""},
            clear=True,
        ):
            root = Path(tmp)
            manager = IntegrationManager(
                config_path=root / "integrations.json",
                log_dir=root / "logs",
                media_dir=root / "media",
            )

            env = manager.process_env()

        self.assertIn("example.com", env["NO_PROXY"].split(","))
        for key in ("NO_PROXY", "no_proxy"):
            hosts = env[key].split(",")
            self.assertIn("127.0.0.1", hosts)
            self.assertIn("localhost", hosts)
            self.assertIn("::1", hosts)


class IntegrationManagerWeixinSessionTests(unittest.TestCase):
    def test_bound_session_uses_fresh_openclaw_context_file_for_reachability(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(
            os.environ,
            {"OPENCLAW_STATE_DIR": str(Path(tmp) / "state")},
            clear=True,
        ):
            root = Path(tmp)
            state_dir = Path(os.environ["OPENCLAW_STATE_DIR"])
            accounts_dir = state_dir / "openclaw-weixin" / "accounts"
            accounts_dir.mkdir(parents=True)
            account_id = "test-account-im-bot"
            sender_id = "test-sender@im.wechat"
            (state_dir / "openclaw-weixin" / "accounts.json").write_text(json.dumps([account_id]), encoding="utf-8")
            (accounts_dir / f"{account_id}.json").write_text(
                json.dumps(
                    {
                        "token": "account-token",
                        "baseUrl": "https://ilinkai.weixin.qq.com",
                        "cdnBaseUrl": "https://novac2c.cdn.weixin.qq.com/c2c",
                    }
                ),
                encoding="utf-8",
            )
            token_path = accounts_dir / f"{account_id}.context-tokens.json"
            token_path.write_text(json.dumps({sender_id: "fresh-context-token"}), encoding="utf-8")
            now = time.time()
            os.utime(token_path, (now, now))

            old_ts = now - 26 * 3600
            config_path = root / "integrations.json"
            config_path.write_text(
                json.dumps(
                    {
                        "integrations": [
                            {
                                "id": "weixin_mqj5dhp1",
                                "type": "weixin_oc",
                                "enabled": True,
                                "openclaw_profile": "branchwhisper",
                            }
                        ],
                        "sessions": {},
                        "my_weixin_session": {
                            "platform_id": "weixin_mqj5dhp1",
                            "account_id": account_id,
                            "session_id": "old-session",
                            "sender_id": sender_id,
                            "conversation_id": "old-conversation",
                            "context_token_set": True,
                            "updated_at": "2026-06-17 16:00:00",
                            "updated_at_ts": old_ts,
                        },
                    }
                ),
                encoding="utf-8",
            )
            manager = IntegrationManager(
                config_path=config_path,
                log_dir=root / "logs",
                media_dir=root / "media",
            )

            session = manager.my_weixin_session("weixin_mqj5dhp1")
            target = manager.select_weixin_target("weixin_mqj5dhp1")

        self.assertTrue(session["reachable"])
        self.assertGreater(session["reachable_remaining_sec"], 23 * 3600)
        self.assertEqual("fresh-context-token", target["context_token"])
        self.assertLess(target["age_hours"], 0.01)


    def test_send_weixin_text_reports_business_ret_failure(self) -> None:
        class FakeResponse:
            content = b'{"ret":-2}'

            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                return {"ret": -2}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, *_args, **_kwargs):
                return FakeResponse()

        with tempfile.TemporaryDirectory() as tmp, patch.dict(
            os.environ,
            {"OPENCLAW_STATE_DIR": str(Path(tmp) / "state")},
            clear=True,
        ):
            root = Path(tmp)
            state_dir = Path(os.environ["OPENCLAW_STATE_DIR"])
            accounts_dir = state_dir / "openclaw-weixin" / "accounts"
            accounts_dir.mkdir(parents=True)
            account_id = "test-account-im-bot"
            sender_id = "test-sender@im.wechat"
            (state_dir / "openclaw-weixin" / "accounts.json").write_text(json.dumps([account_id]), encoding="utf-8")
            (accounts_dir / f"{account_id}.json").write_text(
                json.dumps(
                    {
                        "token": "account-token",
                        "baseUrl": "https://ilinkai.weixin.qq.com",
                        "cdnBaseUrl": "https://novac2c.cdn.weixin.qq.com/c2c",
                    }
                ),
                encoding="utf-8",
            )
            token_path = accounts_dir / f"{account_id}.context-tokens.json"
            token_path.write_text(json.dumps({sender_id: "fresh-context-token"}), encoding="utf-8")
            now = time.time()
            os.utime(token_path, (now, now))
            config_path = root / "integrations.json"
            config_path.write_text(
                json.dumps(
                    {
                        "integrations": [
                            {
                                "id": "weixin_mqj5dhp1",
                                "type": "weixin_oc",
                                "enabled": True,
                                "openclaw_profile": "branchwhisper",
                            }
                        ],
                        "sessions": {},
                        "my_weixin_session": {
                            "platform_id": "weixin_mqj5dhp1",
                            "account_id": account_id,
                            "session_id": "session",
                            "sender_id": sender_id,
                            "conversation_id": "conversation",
                            "context_token_set": True,
                            "updated_at": "2026-06-18 19:00:00",
                            "updated_at_ts": now,
                        },
                    }
                ),
                encoding="utf-8",
            )
            manager = IntegrationManager(
                config_path=config_path,
                log_dir=root / "logs",
                media_dir=root / "media",
            )
            original = manager_module.httpx_client_for_url
            manager_module.httpx_client_for_url = lambda *_args, **_kwargs: FakeClient()
            try:
                result = asyncio.run(manager.send_weixin_text("weixin_mqj5dhp1", "hello"))
            finally:
                manager_module.httpx_client_for_url = original

        self.assertFalse(result["ok"])
        self.assertEqual("sendmessage", result["stage"])
        self.assertEqual({"ret": -2}, result["business_response"])
        self.assertIn("ret=-2", result["error"])


if __name__ == "__main__":
    unittest.main()
