from __future__ import annotations

from pathlib import Path


SCRIPT = Path(__file__).with_name("build_windows_desktop.ps1")


def test_windows_desktop_build_stops_stale_backend_process() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Get-Process BranchWhisper" in text
    assert "Get-Process branchwhisper-backend" in text
    assert "Stop-Process -Force" in text
