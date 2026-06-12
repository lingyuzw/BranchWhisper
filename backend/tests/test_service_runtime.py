from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from integration_runtime.manager import IntegrationManager
from service_runtime.services import service_runtime_state


class ServiceRuntimeStateTests(unittest.TestCase):
    def test_offline_service_without_process_is_stopped(self) -> None:
        state = service_runtime_state(
            running=False,
            tracked_running=False,
            health={"ok": False, "error": "All connection attempts failed"},
            port_open=False,
            returncode=None,
        )

        self.assertEqual(state, "stopped")

    def test_health_ok_is_ready(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=True,
            health={"ok": True, "status": 200, "payload": {"ready": True}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "ready")

    def test_returncode_is_failed(self) -> None:
        state = service_runtime_state(
            running=False,
            tracked_running=False,
            health=None,
            port_open=False,
            returncode=1,
        )

        self.assertEqual(state, "failed")

    def test_http_5xx_health_is_failed(self) -> None:
        state = service_runtime_state(
            running=False,
            tracked_running=False,
            health={"ok": False, "status": 503, "payload": {"error": "loading failed"}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "failed")

    def test_health_not_found_with_open_port_is_degraded_not_starting(self) -> None:
        state = service_runtime_state(
            running=True,
            tracked_running=False,
            health={"ok": False, "status": 404, "payload": {}},
            port_open=True,
            returncode=None,
        )

        self.assertEqual(state, "running_degraded")


class IntegrationDiagnosticsTests(unittest.TestCase):
    def test_local_weixin_base_url_connection_refused_has_hint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state_dir = root / "openclaw-state"
            account_id = "test-account"
            account_dir = state_dir / "openclaw-weixin" / "accounts"
            account_dir.mkdir(parents=True)
            (state_dir / "openclaw-weixin" / "accounts.json").write_text(
                f'["{account_id}"]',
                encoding="utf-8",
            )
            (account_dir / f"{account_id}.json").write_text(
                '{"baseUrl":"http://127.0.0.1:9","token":"token","userId":"u"}',
                encoding="utf-8",
            )

            old_state_dir = __import__("os").environ.get("OPENCLAW_STATE_DIR")
            __import__("os").environ["OPENCLAW_STATE_DIR"] = str(state_dir)
            try:
                manager = IntegrationManager(root / "integrations.json", root / "logs", root / "media")
                accounts = manager.weixin_accounts({"openclaw_profile": "branchwhisper"})
            finally:
                if old_state_dir is None:
                    __import__("os").environ.pop("OPENCLAW_STATE_DIR", None)
                else:
                    __import__("os").environ["OPENCLAW_STATE_DIR"] = old_state_dir

        self.assertEqual(len(accounts), 1)
        self.assertFalse(accounts[0]["base_url_reachable"])
        self.assertIn("OpenClaw", accounts[0]["diagnostic_hint"])


if __name__ == "__main__":
    unittest.main()
