from __future__ import annotations

import socket
import shlex
from dataclasses import dataclass, field
from pathlib import Path
from shutil import which
from typing import Callable, Literal
from urllib.parse import urlsplit

from service_runtime.profiles import expand_profile_paths

DiagnosticStatus = Literal["ok", "warning", "error"]
DiagnosticRequirement = Literal["required", "optional"]

CommandResolver = Callable[[str], str | None]
PortChecker = Callable[[int], bool]
HealthChecker = Callable[[str], tuple[bool, str]]


@dataclass(frozen=True)
class RuntimeModeContext:
    dialog: str = "local"
    asr: str = "local"
    tts: str = "local"
    tts_enabled: bool = True


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
    requirement: DiagnosticRequirement = "required"

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "target": self.target,
            "status": self.status,
            "message": self.message,
            "fix": self.fix,
            "metadata": self.metadata,
            "requirement": self.requirement,
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
    requirement: DiagnosticRequirement = "required"

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "name": self.name,
            "provider": self.provider,
            "status": self.status,
            "summary": self.summary,
            "capabilities": list(self.capabilities),
            "requirement": self.requirement,
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
    cwd_path = _resolve_profile_cwd(profile, workspace_root)
    if profile.model_path:
        checks.append(_check_model_path(profile.model_path, workspace_root, cwd_path))
    if profile.cwd:
        checks.append(_check_cwd(profile.cwd, workspace_root, cwd_path))
    for binary in profile.required_bins:
        checks.append(_check_binary(binary, command_resolver, required=True, workspace_root=workspace_root, cwd_path=cwd_path))
    for binary in profile.optional_bins:
        checks.append(_check_binary(binary, command_resolver, required=False, workspace_root=workspace_root, cwd_path=cwd_path))
    for required_file in profile.required_files:
        checks.append(_check_required_file(required_file, profile, workspace_root, cwd_path))
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


def runtime_diagnostics_payload(
    service_config: dict,
    *,
    workspace_root: Path,
    settings: object | None = None,
    extra_profiles: list[RuntimeDiagnosticProfile] | tuple[RuntimeDiagnosticProfile, ...] = (),
    command_resolver: CommandResolver | None = None,
    port_checker: PortChecker | None = None,
    health_checker: HealthChecker | None = None,
) -> dict:
    profiles = profiles_from_service_config(service_config)
    profiles.extend(extra_profiles)
    context = mode_context_from_settings(settings)
    evaluated_items = [
        evaluate_profile(
            profile,
            workspace_root=workspace_root,
            command_resolver=command_resolver,
            port_checker=port_checker,
            health_checker=health_checker,
        )
        for profile in profiles
    ]
    evaluated_items.extend(api_config_items(context, settings))
    adjusted_items = [apply_requirement(item, requirement_for_item(item, context)) for item in evaluated_items]
    status = _overall_status([RuntimeDiagnosticCheck("profile", item.name, item.status) for item in adjusted_items])
    items = [item.to_dict() for item in adjusted_items]
    payload = {
        "ok": status == "ok",
        "status": status,
        "mode": mode_context_to_dict(context),
        "items": items,
    }
    payload["summary"] = {
        "total": len(items),
        "ok": sum(1 for item in items if item.get("status") == "ok"),
        "warning": sum(1 for item in items if item.get("status") == "warning"),
        "error": sum(1 for item in items if item.get("status") == "error"),
    }
    return payload


def mode_context_from_settings(settings: object | None) -> RuntimeModeContext:
    if settings is None:
        return RuntimeModeContext()
    return RuntimeModeContext(
        dialog=_mode_value(getattr(settings, "dialog_mode", "local")),
        asr=_mode_value(getattr(settings, "asr_provider_mode", "local")),
        tts=_mode_value(getattr(settings, "tts_provider_mode", "local")),
        tts_enabled=bool(getattr(settings, "tts_enabled", True)),
    )


def mode_context_to_dict(context: RuntimeModeContext) -> dict:
    return {
        "dialog": context.dialog,
        "asr": context.asr,
        "tts": context.tts,
        "tts_enabled": context.tts_enabled,
    }


def _mode_value(value: object) -> str:
    return "api" if str(value or "").strip().lower() == "api" else "local"


def requirement_for_item(item: RuntimeDiagnosticItem, context: RuntimeModeContext) -> DiagnosticRequirement:
    if item.provider == "api":
        if item.role == "llm":
            return "required" if context.dialog == "api" else "optional"
        if item.role == "asr":
            return "required" if context.asr == "api" else "optional"
        if item.role == "tts":
            return "required" if context.tts_enabled and context.tts == "api" else "optional"
    if item.role == "llm":
        return "required" if context.dialog == "local" else "optional"
    if item.role == "asr":
        return "required" if context.asr == "local" else "optional"
    if item.role == "tts":
        return "required" if context.tts_enabled and context.tts == "local" else "optional"
    if item.role == "tool":
        return "required" if item.provider == "python" else "optional"
    return "optional"


def apply_requirement(item: RuntimeDiagnosticItem, requirement: DiagnosticRequirement) -> RuntimeDiagnosticItem:
    checks = tuple(apply_check_requirement(check, requirement) for check in item.checks)
    status = _overall_status(list(checks))
    return RuntimeDiagnosticItem(
        role=item.role,
        name=item.name,
        provider=item.provider,
        status=status,
        summary=_summary_for(list(checks), status) if status != item.status else item.summary,
        checks=checks,
        capabilities=item.capabilities,
        requirement=requirement,
    )


def apply_check_requirement(check: RuntimeDiagnosticCheck, requirement: DiagnosticRequirement) -> RuntimeDiagnosticCheck:
    status = check.status
    metadata = dict(check.metadata or {})
    if requirement == "optional" and check.status == "error":
        status = "warning"
        metadata["original_status"] = "error"
    return RuntimeDiagnosticCheck(
        kind=check.kind,
        target=check.target,
        status=status,
        message=check.message,
        fix=check.fix,
        metadata=metadata,
        requirement=requirement,
    )


def api_config_items(context: RuntimeModeContext, settings: object | None) -> list[RuntimeDiagnosticItem]:
    if settings is None:
        return []
    items = [
        _api_config_item(
            role="llm",
            name="API LLM",
            enabled=context.dialog == "api",
            url=str(getattr(settings, "api_llm_url", "") or ""),
            model=str(getattr(settings, "api_llm_model", "") or ""),
            api_key=str(getattr(settings, "api_llm_api_key", "") or ""),
            provider="api",
        ),
        _api_config_item(
            role="asr",
            name="API ASR",
            enabled=context.asr == "api",
            url=str(getattr(settings, "api_asr_url", "") or ""),
            model=str(getattr(settings, "api_asr_model", "") or ""),
            api_key=str(getattr(settings, "api_asr_api_key", "") or ""),
            provider="api",
            api_provider=str(getattr(settings, "api_asr_provider", "") or ""),
        ),
    ]
    if context.tts_enabled:
        items.append(
            _api_config_item(
                role="tts",
                name="API TTS",
                enabled=context.tts == "api",
                url=str(getattr(settings, "api_tts_url", "") or ""),
                model=str(getattr(settings, "api_tts_model", "") or ""),
                api_key=str(getattr(settings, "api_tts_api_key", "") or ""),
                provider="api",
                api_provider=str(getattr(settings, "api_tts_provider", "") or ""),
            )
        )
    return items


def _api_config_item(
    *,
    role: str,
    name: str,
    enabled: bool,
    url: str,
    model: str,
    api_key: str,
    provider: str,
    api_provider: str = "",
) -> RuntimeDiagnosticItem:
    requirement: DiagnosticRequirement = "required" if enabled else "optional"
    checks = (
        _api_config_check("api_url", url, "API URL is configured.", "API URL is missing.", "Fill in the API URL in Quick Start or Settings.", requirement),
        _api_config_check("api_model", model, "API model is configured.", "API model is missing.", "Fill in the API model name in Quick Start or Settings.", requirement),
        _api_config_check("api_key", api_key, "API key is configured.", "API key is missing.", "Fill in the API key, or choose a local runtime mode.", requirement),
    )
    status = _overall_status(list(checks))
    capabilities = ("api", api_provider) if api_provider else ("api",)
    return RuntimeDiagnosticItem(
        role=role,
        name=name,
        provider=provider,
        status=status,
        summary="API configuration is ready" if status == "ok" else "API configuration is incomplete",
        checks=checks,
        capabilities=capabilities,
        requirement=requirement,
    )


def _api_config_check(
    kind: str,
    value: str,
    ok_message: str,
    error_message: str,
    fix: str,
    requirement: DiagnosticRequirement,
) -> RuntimeDiagnosticCheck:
    configured = bool(str(value or "").strip())
    status: DiagnosticStatus = "ok" if configured else "error"
    metadata = {"configured": configured}
    if kind == "api_key" and configured:
        target = "configured"
    else:
        target = str(value or "")
    return apply_check_requirement(
        RuntimeDiagnosticCheck(
            kind=kind,
            target=target,
            status=status,
            message=ok_message if configured else error_message,
            fix="" if configured else fix,
            metadata=metadata,
        ),
        requirement,
    )


def runtime_tool_profiles(*, python_executable: str) -> list[RuntimeDiagnosticProfile]:
    return [
        RuntimeDiagnosticProfile(
            role="tool",
            name="Python",
            provider="python",
            required_bins=(python_executable,),
            capabilities=("backend", "runtime"),
        ),
        RuntimeDiagnosticProfile(
            role="tool",
            name="Node.js",
            provider="node",
            required_bins=("node",),
            capabilities=("frontend", "weixin"),
        ),
        RuntimeDiagnosticProfile(
            role="tool",
            name="npm",
            provider="npm",
            required_bins=("npm",),
            capabilities=("frontend", "weixin"),
        ),
        RuntimeDiagnosticProfile(
            role="tool",
            name="ffmpeg",
            provider="ffmpeg",
            optional_bins=("ffmpeg",),
            capabilities=("audio", "weixin_voice"),
        ),
        RuntimeDiagnosticProfile(
            role="tool",
            name="CUDA",
            provider="cuda",
            optional_bins=("nvidia-smi",),
            capabilities=("gpu",),
        ),
        RuntimeDiagnosticProfile(
            role="tool",
            name="OpenClaw",
            provider="openclaw",
            optional_bins=("openclaw",),
            capabilities=("weixin",),
        ),
    ]


def profiles_from_service_config(config: dict) -> list[RuntimeDiagnosticProfile]:
    services = config.get("services") if isinstance(config.get("services"), dict) else config
    if not isinstance(services, dict):
        return []

    profiles: list[RuntimeDiagnosticProfile] = []
    for role, service in services.items():
        if not isinstance(service, dict):
            continue
        command = str(service.get("command") or "")
        health_url = str(service.get("health_url") or "")
        profiles.append(
            RuntimeDiagnosticProfile(
                role=str(role),
                name=str(service.get("label") or role),
                provider=str(service.get("provider") or role),
                model_path=str(service.get("model_path") or _model_path_from_command(command) or ""),
                command=command,
                cwd=str(service.get("cwd") or ""),
                port=_port_from_service(service, command, health_url),
                health_url=health_url,
                required_bins=_required_bins_from_command(command),
                required_files=tuple(str(item) for item in service.get("required_files") or ()),
                optional_bins=tuple(str(item) for item in service.get("optional_bins") or ()),
                capabilities=tuple(str(item) for item in service.get("capabilities") or ()),
                env={str(key): str(value) for key, value in (service.get("env") or {}).items()} if isinstance(service.get("env"), dict) else {},
            )
        )
    return profiles


def is_port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def default_health_checker(url: str) -> tuple[bool, str]:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False, "invalid health URL"
    return False, "health probe is not configured in this checker"


def _required_bins_from_command(command: str) -> tuple[str, ...]:
    tokens = _split_command(command)
    if not tokens:
        return ()
    first = tokens[0]
    if first == "env":
        for token in tokens[1:]:
            if "=" in token and not token.startswith("-"):
                continue
            return (_command_target(token),)
        return ()
    return (_command_target(first),)


def _command_target(token: str) -> str:
    return token if _has_path_separator(token) else Path(token).name


def _port_from_service(service: dict, command: str, health_url: str) -> int | None:
    explicit = service.get("port")
    if explicit not in (None, ""):
        try:
            return int(explicit)
        except (TypeError, ValueError):
            pass
    parsed = urlsplit(health_url)
    if parsed.port:
        return parsed.port
    tokens = _split_command(command)
    for index, token in enumerate(tokens):
        if token in {"--port", "-p"} and index + 1 < len(tokens):
            try:
                return int(tokens[index + 1])
            except ValueError:
                return None
        if token.startswith("--port="):
            try:
                return int(token.split("=", 1)[1])
            except ValueError:
                return None
    return None


def _model_path_from_command(command: str) -> str:
    tokens = _split_command(command)
    for index, token in enumerate(tokens):
        if token in {"--model", "--model-path", "--model_path", "--model-dir", "--model_dir", "-m"} and index + 1 < len(tokens):
            return tokens[index + 1]
    for token in tokens:
        if _looks_like_model_path(token):
            return token
    return ""


def _looks_like_model_path(token: str) -> bool:
    if token.startswith("-") or "=" in token:
        return False
    lowered = token.lower()
    return (
        "${workspace_root}" in lowered
        or lowered.endswith((".gguf", ".safetensors", ".bin", ".pt", ".pth"))
        or "/model" in lowered
        or lowered.endswith("-model")
    )


def _split_command(command: str) -> list[str]:
    try:
        return shlex.split(command)
    except ValueError:
        return command.split()


def _check_model_path(raw_path: str, workspace_root: Path, cwd_path: Path | None = None) -> RuntimeDiagnosticCheck:
    path = _resolve_runtime_path(raw_path, workspace_root, base_path=cwd_path)
    metadata = _path_metadata(
        raw_path,
        path,
        workspace_root,
        resolution_base=cwd_path or workspace_root,
        profile_cwd=cwd_path,
        exists=path.exists(),
    )
    if path.exists():
        return RuntimeDiagnosticCheck("model_path", raw_path, "ok", f"Found {path}", metadata=metadata)
    return RuntimeDiagnosticCheck(
        "model_path",
        raw_path,
        "error",
        "Model path does not exist.",
        "Update the profile model_path to an existing file or directory.",
        metadata,
    )


def _check_cwd(raw_path: str, workspace_root: Path, cwd_path: Path | None = None) -> RuntimeDiagnosticCheck:
    path = _resolve_runtime_path(raw_path, workspace_root)
    metadata = _path_metadata(
        raw_path,
        path,
        workspace_root,
        resolution_base=workspace_root,
        profile_cwd=cwd_path or path,
        exists=path.is_dir(),
    )
    if path.is_dir():
        return RuntimeDiagnosticCheck("cwd", raw_path, "ok", f"Found {path}", metadata=metadata)
    return RuntimeDiagnosticCheck(
        "cwd",
        raw_path,
        "error",
        "Working directory does not exist.",
        "Update the profile cwd to an existing directory.",
        metadata,
    )


def _check_binary(
    binary: str,
    command_resolver: CommandResolver,
    *,
    required: bool,
    workspace_root: Path,
    cwd_path: Path | None = None,
) -> RuntimeDiagnosticCheck:
    binary_path = _resolve_command_path(binary, workspace_root, cwd_path)
    if binary_path is not None and binary_path.exists():
        return RuntimeDiagnosticCheck(
            "binary",
            binary,
            "ok",
            f"Found {binary_path}",
            metadata=_path_metadata(
                binary,
                binary_path,
                workspace_root,
                resolution_base=cwd_path or workspace_root,
                profile_cwd=cwd_path,
                exists=True,
                legacy_key="path",
            ),
        )
    resolved = command_resolver(binary)
    if resolved:
        return RuntimeDiagnosticCheck(
            "binary",
            binary,
            "ok",
            f"Found {resolved}",
            metadata=_path_metadata(
                binary,
                Path(resolved),
                workspace_root,
                resolution_base="PATH",
                profile_cwd=cwd_path,
                exists=True,
                legacy_key="path",
            ),
        )
    status: DiagnosticStatus = "error" if required else "warning"
    metadata: dict[str, object] = {}
    if binary_path is not None:
        metadata = _path_metadata(
            binary,
            binary_path,
            workspace_root,
            resolution_base=cwd_path or workspace_root,
            profile_cwd=cwd_path,
            exists=False,
        )
    else:
        metadata = {
            "raw_target": binary,
            "resolved_target": "",
            "resolution_base": "PATH",
            "exists": False,
            "profile_cwd": str(cwd_path) if cwd_path else "",
            "workspace_root": str(workspace_root),
        }
    return RuntimeDiagnosticCheck(
        "binary",
        binary,
        status,
        f"{binary} is not available on PATH.",
        f"Install {binary} or make it available on PATH.",
        metadata,
    )


def _check_required_file(
    raw_path: str,
    profile: RuntimeDiagnosticProfile,
    workspace_root: Path,
    cwd_path: Path | None = None,
) -> RuntimeDiagnosticCheck:
    base = _required_file_base(profile, workspace_root, cwd_path)
    path = Path(raw_path)
    resolved = _resolve_runtime_path(raw_path, workspace_root, base_path=cwd_path) if path.is_absolute() else base / path
    metadata = _path_metadata(
        raw_path,
        resolved,
        workspace_root,
        resolution_base=base,
        profile_cwd=cwd_path,
        exists=resolved.exists(),
    )
    if resolved.exists():
        return RuntimeDiagnosticCheck("required_file", raw_path, "ok", f"Found {resolved}", metadata=metadata)
    return RuntimeDiagnosticCheck(
        "required_file",
        raw_path,
        "error",
        "Required file does not exist.",
        "Check the profile required_files entry or choose a compatible model directory.",
        metadata,
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


def _resolve_profile_cwd(profile: RuntimeDiagnosticProfile, workspace_root: Path) -> Path | None:
    if not profile.cwd:
        return None
    return _resolve_runtime_path(profile.cwd, workspace_root)


def _resolve_runtime_path(raw_path: str, workspace_root: Path, *, base_path: Path | None = None) -> Path:
    expanded = expand_profile_paths(raw_path, project_root=workspace_root / "BranchWhisper", workspace_root=workspace_root)
    path = Path(expanded).expanduser()
    if not path.is_absolute() and base_path is not None:
        return base_path / path
    return path


def _resolve_command_path(binary: str, workspace_root: Path, cwd_path: Path | None = None) -> Path | None:
    path = _resolve_runtime_path(binary, workspace_root, base_path=cwd_path)
    if path.is_absolute() or _has_path_separator(binary):
        return path
    return None


def _required_file_base(profile: RuntimeDiagnosticProfile, workspace_root: Path, cwd_path: Path | None = None) -> Path:
    if profile.model_path:
        model_path = _resolve_runtime_path(profile.model_path, workspace_root, base_path=cwd_path)
        if _looks_like_model_file(model_path):
            return model_path.parent
        return model_path
    if profile.cwd:
        return _resolve_runtime_path(profile.cwd, workspace_root)
    return workspace_root


def _looks_like_model_file(path: Path) -> bool:
    return bool(path.suffix)


def _path_metadata(
    raw_target: str,
    resolved_target: Path,
    workspace_root: Path,
    *,
    resolution_base: Path | str,
    profile_cwd: Path | None,
    exists: bool,
    legacy_key: str = "resolved_path",
) -> dict[str, object]:
    resolved = str(resolved_target)
    return {
        "raw_target": raw_target,
        "resolved_target": resolved,
        "resolution_base": str(resolution_base),
        "exists": exists,
        "profile_cwd": str(profile_cwd) if profile_cwd else "",
        "workspace_root": str(workspace_root),
        legacy_key: resolved,
    }


def _has_path_separator(value: str) -> bool:
    return "/" in value or "\\" in value


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
