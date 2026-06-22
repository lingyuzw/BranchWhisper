from __future__ import annotations

import importlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import domain.paths as paths


class DomainPathTests(unittest.TestCase):
    def tearDown(self) -> None:
        if hasattr(sys, "_MEIPASS"):
            delattr(sys, "_MEIPASS")
        if hasattr(sys, "frozen"):
            delattr(sys, "frozen")
        importlib.reload(paths)

    def test_source_checkout_uses_project_runtime_directory(self) -> None:
        reloaded = importlib.reload(paths)

        self.assertEqual(reloaded.BACKEND_DIR, BACKEND_ROOT)
        self.assertEqual(reloaded.PROJECT_ROOT, BACKEND_ROOT.parent)
        self.assertEqual(reloaded.FRONTEND_DIST_DIR, BACKEND_ROOT.parent / "frontend" / "dist")
        self.assertEqual(reloaded.RUNTIME_DIR, BACKEND_ROOT.parent / "runtime")

    def test_pyinstaller_bundle_uses_meipass_for_assets_and_cwd_for_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as bundle_root, tempfile.TemporaryDirectory() as runtime_root:
            sys.frozen = True
            sys._MEIPASS = bundle_root
            with patch("pathlib.Path.cwd", return_value=Path(runtime_root)):
                reloaded = importlib.reload(paths)

        self.assertEqual(reloaded.PROJECT_ROOT, Path(bundle_root))
        self.assertEqual(reloaded.BACKEND_DIR, Path(bundle_root) / "backend")
        self.assertEqual(reloaded.FRONTEND_DIST_DIR, Path(bundle_root) / "frontend" / "dist")
        self.assertEqual(reloaded.RUNTIME_DIR, Path(runtime_root) / "runtime")


if __name__ == "__main__":
    unittest.main()
