from __future__ import annotations

from pathlib import Path


SCRIPT = Path(__file__).with_name("build_windows_desktop.ps1")


def test_windows_desktop_build_stops_stale_backend_process() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Get-Process BranchWhisper" in text
    assert "Get-Process branchwhisper-backend" in text
    assert "Stop-Process -Force" in text


def test_windows_desktop_build_packages_backend_by_default() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert "[switch]$BuildBackend = $true" in text
    assert "build_windows_backend.ps1" in text
    assert "$env:BRANCHWHISPER_BACKEND_EXECUTABLE" in text


def test_windows_desktop_build_embeds_backend_resource_and_exports_installer() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Copy-BackendRuntimeResource" in text
    assert "src-tauri\\resources" in text
    assert "branchwhisper-backend.exe" in text
    assert "Get-WindowsInstallerArtifact" in text
    assert "DesktopInstallerPath" in text
    assert "BranchWhisper-Setup.exe" in text
    assert "Copy-Item -LiteralPath $InstallerPath -Destination $DesktopInstallerPath -Force" in text


def test_windows_desktop_build_verifies_required_desktop_api_routes() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Assert-BackendDesktopApiContract" in text
    assert "/api/desktop/capabilities" in text
    assert "/api/config/api-providers" in text
    assert "/api/statistics" in text
