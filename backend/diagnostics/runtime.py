from __future__ import annotations

import socket
from dataclasses import dataclass, field
from pathlib import Path
from shutil import which
from typing import Callable, Literal
from urllib.parse import urlsplit

DiagnosticStatus = Literal["ok", "warning", "error"]

CommandResolver = Callable[[str], str | None]
PortChecker = Callable[[int], bool]
HealthChecker = Callable[[str], tuple[bool, str]]


@dataclass(frozen=True)
class RuntimeDiagnosticProfile:
    role: str
    name: str
    provider: str = "custom"
    model_path: str = ""
    command: str = ""
    cwd: str = ""
    port: int | None = None
    health_url: str = ""
    required_bins: tuple[str, ...] = ()
    required_files: tuple[str, ...] = ()
    optional_bins: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    env: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class RuntimeDiagnosticCheck:
    kind: str
    target: str
    status: DiagnosticStatus
    message: str = ""
    fix: str = ""
    metadata: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "target": self.target,
            "status": self.status,
            "message": self.message,
            "fix": self.fix,
            "metadata": self.metadata,
        }


@dataclass(frozen=True)
class RuntimeDiagnosticItem:
    role: str
    name: str
    provider: str
    status: DiagnosticStatus
    summary: str
    checks: tuple[RuntimeDiagnosticCheck, ...]
    capabilities: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "name": self.name,
            "provider": self.provider,
            "status": self.status,
            "summary": self.summary,
            "capabilities": list(self.capabilities),
            "checks": [check.to_dict() for check in self.checks],
        }


def evaluate_profile(
    profile: RuntimeDiagnosticProfile,
    *,
    workspace_root: Path,
    command_resolver: CommandResolver | None = None,
    port_checker: PortChecker | None = None,
    health_checker: HealthChecker | None = None,
) -> RuntimeDiagnosticItem:
    command_resolver = command_resolver or which
    port_checker = port_checker or is_port_available
    health_checker = health_checker or default_health_checker

    checks: list[RuntimeDiagnosticCheck] = []
    if profile.model_path:
        checks.append(_check_model_path(profile.model_path, workspace_root))
    if profile.cwd:
        checks.append(_check_cwd(profile.cwd, workspace_root))
    for binary in profile.required_bins:
        checks.append(_check_binary(binary, command_resolver, required=True))
    for binary in profile.optional_bins:
        checks.append(_check_binary(binary, command_resolver, required=False))
    for required_file in profile.required_files:
        checks.append(_check_required_file(required_file, profile, workspace_root))
    if profile.port is not None:
        checks.append(_check_port(profile.port, port_checker))
    if profile.health_url:
        checks.append(_check_health(profile.health_url, health_checker))

    status = _overall_status(checks)
    return RuntimeDiagnosticItem(
        role=profile.role,
        name=profile.name,
        provider=profile.provider,
        status=status,
        summary=_summary_for(checks, status),
        checks=tuple(checks),
        capabilities=profile.capabilities,
    )


def evaluate_profiles(
    profiles: list[RuntimeDiagnosticProfile] | tuple[RuntimeDiagnosticProfile, ...],
    *,
    workspace_root: Path,
    command_resolver: CommandResolver | None = None,
    port_checker: PortChecker | None = None,
    health_checker: HealthChecker | None = None,
) -> dict:
    items = [
        evaluate_profile(
            profile,
            workspace_root=workspace_root,
            command_resolver=command_resolver,
            port_checker=port_checker,
            health_checker=health_checker,
        )
        for profile in profiles
    ]
    status = _overall_status([RuntimeDiagnosticCheck("profile", item.name, item.status) for item in items])
    return {
        "ok": status == "ok",
        "status": status,
        "items": [item.to_dict() for item in items],
    }


def is_port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def default_health_checker(url: str) -> tuple[bool, str]:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False, "invalid health URL"
    return False, "health probe is not configured in this checker"


def _check_model_path(raw_path: str, workspace_root: Path) -> RuntimeDiagnosticCheck:
    path = _resolve_runtime_path(raw_path, workspace_root)
    if path.exists():
        return RuntimeDiagnosticCheck("model_path", raw_path, "ok", f"Found {path}")
    return RuntimeDiagnosticCheck(
        "model_path",
        raw_path,
        "error",
        "Model path does not exist.",
        "Update the profile model_path to an existing file or directory.",
        {"resolved_path": str(path)},
    )


def _check_cwd(raw_path: str, workspace_root: Path) -> RuntimeDiagnosticCheck:
    path = _resolve_runtime_path(raw_path, workspace_root)
    if path.is_dir():
        return RuntimeDiagnosticCheck("cwd", raw_path, "ok", f"Found {path}")
    return RuntimeDiagnosticCheck(
        "cwd",
        raw_path,
        "error",
        "Working directory does not exist.",
        "Update the profile cwd to an existing directory.",
        {"resolved_path": str(path)},
    )


def _check_binary(binary: str, command_resolver: CommandResolver, *, required: bool) -> RuntimeDiagnosticCheck:
    resolved = command_resolver(binary)
    if resolved:
        return RuntimeDiagnosticCheck("binary", binary, "ok", f"Found {resolved}", metadata={"path": resolved})
    status: DiagnosticStatus = "error" if required else "warning"
    return RuntimeDiagnosticCheck(
        "binary",
        binary,
        status,
        f"{binary} is not available on PATH.",
        f"Install {binary} or make it available on PATH.",
    )


def _check_required_file(raw_path: str, profile: RuntimeDiagnosticProfile, workspace_root: Path) -> RuntimeDiagnosticCheck:
    base = _resolve_runtime_path(profile.model_path or profile.cwd or "${WORKSPACE_ROOT}", workspace_root)
    path = Path(raw_path)
    resolved = path if path.is_absolute() else base / path
    if resolved.exists():
        return RuntimeDiagnosticCheck("required_file", raw_path, "ok", f"Found {resolved}")
    return RuntimeDiagnosticCheck(
        "required_file",
        raw_path,
        "error",
        "Required file does not exist.",
        "Check the profile required_files entry or choose a compatible model directory.",
        {"resolved_path": str(resolved)},
    )


def _check_port(port: int, port_checker: PortChecker) -> RuntimeDiagnosticCheck:
    if port_checker(port):
        return RuntimeDiagnosticCheck("port", str(port), "ok", f"Port {port} is available.")
    return RuntimeDiagnosticCheck(
        "port",
        str(port),
        "error",
        f"Port {port} is already in use.",
        f"Stop the process using port {port} or choose another port.",
    )


def _check_health(url: str, health_checker: HealthChecker) -> RuntimeDiagnosticCheck:
    ok, message = health_checker(url)
    if ok:
        return RuntimeDiagnosticCheck("health_url", url, "ok", message or "Health endpoint responded.")
    return RuntimeDiagnosticCheck(
        "health_url",
        url,
        "warning",
        message or "Health endpoint is not responding.",
        "Start the service or update the profile health_url.",
    )


def _resolve_runtime_path(raw_path: str, workspace_root: Path) -> Path:
    expanded = raw_path.replace("${WORKSPACE_ROOT}", str(workspace_root))
    expanded = expanded.replace("${PROJECT_ROOT}", str(workspace_root / "BranchWhisper"))
    return Path(expanded).expanduser()


def _overall_status(checks: list[RuntimeDiagnosticCheck]) -> DiagnosticStatus:
    if any(check.status == "error" for check in checks):
        return "error"
    if any(check.status == "warning" for check in checks):
        return "warning"
    return "ok"


def _summary_for(checks: list[RuntimeDiagnosticCheck], status: DiagnosticStatus) -> str:
    if status == "ok":
        return "Profile checks passed"
    for check in checks:
        if check.status == status:
            if check.kind == "model_path":
                return "Model path is missing"
            if check.kind == "port":
                return "Port is already in use"
            if check.kind == "health_url":
                return "Health endpoint is not responding"
            if check.kind == "binary":
                return "Required command is missing"
            if check.kind == "cwd":
                return "Working directory is missing"
            if check.kind == "required_file":
                return "Required file is missing"
    return "Profile has diagnostics issues"
