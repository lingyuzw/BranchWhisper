from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "setup_desktop_prereqs.sh"
WINDOWS_BACKEND_SCRIPT = ROOT / "scripts" / "build_windows_backend.ps1"
WINDOWS_DESKTOP_SCRIPT = ROOT / "scripts" / "build_windows_desktop.ps1"


class DesktopPrereqScriptTests(unittest.TestCase):
    def test_script_documents_required_tauri_linux_packages(self) -> None:
        content = SCRIPT.read_text(encoding="utf-8")

        self.assertIn("libwebkit2gtk-4.1-dev", content)
        self.assertIn("libayatana-appindicator3-dev", content)
        self.assertIn("libxdo-dev", content)

    def test_script_installs_desktop_npm_dependencies_and_runs_preflight(self) -> None:
        content = SCRIPT.read_text(encoding="utf-8")

        self.assertIn("(cd apps/desktop && npm install)", content)
        self.assertIn("node apps/desktop/src/preflight.mjs --format text", content)

    def test_script_uses_rustup_when_cargo_is_missing(self) -> None:
        content = SCRIPT.read_text(encoding="utf-8")

        self.assertIn("command -v cargo", content)
        self.assertIn("sh.rustup.rs", content)

    def test_windows_backend_script_builds_packaged_backend_executable(self) -> None:
        content = WINDOWS_BACKEND_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("PyInstaller", content)
        self.assertIn("backend/main.py", content)
        self.assertIn("branchwhisper-backend", content)
        self.assertIn("BRANCHWHISPER_BACKEND_EXECUTABLE", content)
        self.assertIn("pip install pyinstaller", content)

    def test_windows_desktop_build_can_wire_packaged_backend(self) -> None:
        content = WINDOWS_DESKTOP_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("$BackendExecutable", content)
        self.assertIn("BRANCHWHISPER_BACKEND_EXECUTABLE", content)
        self.assertIn("build_windows_backend.ps1", content)


if __name__ == "__main__":
    unittest.main()
