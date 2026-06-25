from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from api.desktop import create_desktop_router


class DesktopCapabilitiesApiTests(unittest.TestCase):
    def test_capabilities_exposes_desktop_api_contract(self) -> None:
        app = FastAPI()
        app.include_router(create_desktop_router())
        client = TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000))

        response = client.get("/api/desktop/capabilities")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertGreaterEqual(payload["desktop_api_version"], 2)
        self.assertIn("api_providers", payload["features"])
        self.assertIn("statistics", payload["features"])
        self.assertIn("bot_profiles", payload["features"])


if __name__ == "__main__":
    unittest.main()
