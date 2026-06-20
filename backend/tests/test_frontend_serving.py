from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.server import build_parser, create_app


def args():
    parsed = build_parser().parse_args([])
    parsed.host = "127.0.0.1"
    parsed.port = 7860
    return parsed


class FrontendServingTests(unittest.TestCase):
    def test_root_redirects_to_app_when_dist_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp)
            (dist / "assets").mkdir()
            (dist / "index.html").write_text('<!doctype html><div id="app"></div>', encoding="utf-8")
            with patch("app.server.FRONTEND_DIST_DIR", dist):
                client = TestClient(create_app(args()))
                response = client.get("/", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["location"], "/app/")

    def test_app_routes_return_vue_shell_when_dist_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp)
            (dist / "assets").mkdir()
            (dist / "index.html").write_text("<!doctype html><title>BranchWhisper</title>", encoding="utf-8")
            with patch("app.server.FRONTEND_DIST_DIR", dist):
                client = TestClient(create_app(args()))
                response = client.get("/app/settings")
        self.assertEqual(response.status_code, 200)
        self.assertIn("BranchWhisper", response.text)
        self.assertEqual(response.headers["cache-control"], "no-store, max-age=0")

    def test_missing_dist_returns_clear_503(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp) / "missing"
            with patch("app.server.FRONTEND_DIST_DIR", dist):
                client = TestClient(create_app(args()))
                response = client.get("/app/")
        self.assertEqual(response.status_code, 503)
        self.assertIn("Frontend is not built", response.json()["error"])


if __name__ == "__main__":
    unittest.main()
