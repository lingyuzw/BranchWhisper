from __future__ import annotations

import copy
import json
import os
from pathlib import Path

from domain.paths import PROJECT_ROOT

LEGACY_AUTODL_PROJECT = Path("/", "root", "autodl-tmp", "project").as_posix()
LEGACY_AUTODL_REPO = f"{LEGACY_AUTODL_PROJECT}/BranchWhisper"


def workspace_root_from_env(*, project_root: Path = PROJECT_ROOT, env: dict[str, str] | None = None) -> Path:
    source = env if env is not None else os.environ
    return Path(source.get("BRANCHWHISPER_WORKSPACE_ROOT") or project_root.parent).expanduser().resolve()


def service_path_tokens(*, project_root: Path = PROJECT_ROOT, workspace_root: Path | None = None) -> dict[str, str]:
    resolved_workspace = workspace_root or workspace_root_from_env(project_root=project_root)
    return {
        "${PROJECT_ROOT}": project_root.as_posix(),
        "${WORKSPACE_ROOT}": resolved_workspace.as_posix(),
    }


def expand_profile_paths(
    value: str,
    *,
    project_root: Path = PROJECT_ROOT,
    workspace_root: Path | None = None,
) -> str:
    text = str(value or "")
    if not text:
        return ""
    resolved_workspace = workspace_root or workspace_root_from_env(project_root=project_root)
    text = text.replace(LEGACY_AUTODL_REPO, project_root.as_posix())
    text = text.replace(LEGACY_AUTODL_PROJECT, resolved_workspace.as_posix())
    for token, path in service_path_tokens(project_root=project_root, workspace_root=resolved_workspace).items():
        text = text.replace(f"{token}/", f"{path.rstrip('/')}/")
        text = text.replace(token, path)
    return text


def migrate_legacy_profile_paths(profiles: dict) -> dict:
    def migrate_value(value):
        if isinstance(value, dict):
            return {key: migrate_value(item) for key, item in value.items()}
        if isinstance(value, list):
            return [migrate_value(item) for item in value]
        if not isinstance(value, str):
            return value
        return value.replace(LEGACY_AUTODL_REPO, "${PROJECT_ROOT}").replace(LEGACY_AUTODL_PROJECT, "${WORKSPACE_ROOT}")

    return migrate_value(profiles)


def service_profiles_payload(services: dict, *, schema_version: int) -> dict:
    return {"schema_version": schema_version, "services": services}


def load_profile_services(config_path: Path | None, *, defaults: dict, schema_version: int) -> dict:
    profiles = copy.deepcopy(defaults)
    if config_path and config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        for service_id, service_patch in (data.get("services") or {}).items():
            if service_id in profiles and isinstance(service_patch, dict):
                profiles[service_id].update(service_patch)
    migrated = migrate_legacy_profile_paths(profiles)
    if config_path and config_path.exists() and migrated != profiles:
        write_profile_services(config_path, migrated, schema_version=schema_version)
    return migrated


def write_profile_services(config_path: Path, services: dict, *, schema_version: int) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    payload = service_profiles_payload(services, schema_version=schema_version)
    tmp_path = config_path.with_suffix(f"{config_path.suffix}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(config_path)
