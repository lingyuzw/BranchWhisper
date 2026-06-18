from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from diagnostics.runtime import (
    RuntimeDiagnosticProfile,
    evaluate_profile,
    evaluate_profiles,
)


class RuntimeDiagnosticsTests(unittest.TestCase):
    def test_evaluate_profile_reports_missing_model_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="asr",
                name="local-asr",
                provider="custom-asr",
                model_path="${WORKSPACE_ROOT}/missing-model",
            )

            item = evaluate_profile(profile, workspace_root=workspace_root)

        self.assertEqual(item.status, "error")
        self.assertEqual(item.role, "asr")
        self.assertEqual(item.provider, "custom-asr")
        self.assertEqual(item.summary, "Model path is missing")
        self.assertEqual(item.checks[0].kind, "model_path")
        self.assertEqual(item.checks[0].status, "error")
        self.assertEqual(item.checks[0].fix, "Update the profile model_path to an existing file or directory.")

    def test_evaluate_profile_reports_required_binary_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="tts",
                name="local-tts",
                provider="custom-tts",
                required_bins=("python", "ffmpeg"),
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                command_resolver=lambda command: f"/usr/bin/{command}" if command == "python" else None,
            )

        checks = {check.target: check for check in item.checks}
        self.assertEqual(checks["python"].status, "ok")
        self.assertEqual(checks["ffmpeg"].status, "error")
        self.assertEqual(checks["ffmpeg"].fix, "Install ffmpeg or make it available on PATH.")
        self.assertEqual(item.status, "error")

    def test_evaluate_profile_reports_port_conflict(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="llm",
                name="local-llm",
                provider="custom-llm",
                port=8000,
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                port_checker=lambda port: port != 8000,
            )

        self.assertEqual(item.status, "error")
        self.assertEqual(item.summary, "Port is already in use")
        self.assertEqual(item.checks[0].kind, "port")
        self.assertEqual(item.checks[0].fix, "Stop the process using port 8000 or choose another port.")

    def test_evaluate_profile_reports_health_warning(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="llm",
                name="api-llm",
                provider="openai-compatible",
                health_url="http://127.0.0.1:9000/health",
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                health_checker=lambda url: (False, "connection refused"),
            )

        self.assertEqual(item.status, "warning")
        self.assertEqual(item.summary, "Health endpoint is not responding")
        self.assertEqual(item.checks[0].status, "warning")
        self.assertEqual(item.checks[0].message, "connection refused")

    def test_evaluate_profiles_returns_overall_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            ok_dir = workspace_root / "model"
            ok_dir.mkdir()
            profiles = [
                RuntimeDiagnosticProfile(role="asr", name="asr", provider="custom", model_path=str(ok_dir)),
                RuntimeDiagnosticProfile(role="tts", name="tts", provider="custom", model_path=str(workspace_root / "missing")),
            ]

            payload = evaluate_profiles(profiles, workspace_root=workspace_root)

        self.assertIs(payload["ok"], False)
        self.assertEqual(payload["status"], "error")
        self.assertEqual([item["role"] for item in payload["items"]], ["asr", "tts"])
        self.assertEqual(payload["items"][0]["status"], "ok")
        self.assertEqual(payload["items"][1]["status"], "error")


if __name__ == "__main__":
    unittest.main()
