from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

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


if __name__ == "__main__":
    unittest.main()
