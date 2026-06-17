from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

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


if __name__ == "__main__":
    unittest.main()
