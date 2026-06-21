from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "setup_desktop_prereqs.sh"


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


if __name__ == "__main__":
    unittest.main()
