from __future__ import annotations

import asyncio
import json
import os
import platform
import re
import signal
import socket
import subprocess
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx

from core.http_client import httpx_client_for_url
from domain.paths import PROJECT_ROOT


WORKSPACE_ROOT = Path(os.environ.get("BRANCHWHISPER_WORKSPACE_ROOT") or PROJECT_ROOT.parent).expanduser().resolve()
LEGACY_AUTODL_PROJECT = Path("/", "root", "autodl-tmp", "project").as_posix()
LEGACY_AUTODL_REPO = f"{LEGACY_AUTODL_PROJECT}/BranchWhisper"
SERVICE_PATH_TOKENS = {
    "${PROJECT_ROOT}": PROJECT_ROOT.as_posix(),
    "${WORKSPACE_ROOT}": WORKSPACE_ROOT.as_posix(),
}
SERVICE_HEALTH_TIMEOUT_SEC = 0.8
SERVICE_PORT_TIMEOUT_SEC = 0.15
DEFAULT_ASR_GPU_MEMORY_UTILIZATION = "0.25"
DEFAULT_ASR_MAX_MODEL_LEN = "1024"
SERVICE_PROFILE_SCHEMA_VERSION = 1

DEFAULT_SERVICE_PROFILES = {
    "asr": {
        "label": "Qwen3-ASR vLLM",
        "description": "Speech recognition service, started by qwen-asr-serve.",
        "cwd": "${WORKSPACE_ROOT}",
        "command": (
            "env OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 "
            "conda run --no-capture-output -n qwen3-asr qwen-asr-serve \"${WORKSPACE_ROOT}/Qwen3-ASR-0.6B\" "
            "--served-model-name qwen3-asr --gpu-memory-utilization 0.25 --max-model-len 1024 --max-num-seqs 1 "
            "--enforce-eager --host 0.0.0.0 --port 8001"
        ),
        "health_url": "http://127.0.0.1:8001/health",
        "startup_wait_sec": 0,
        "startup_ready_timeout_sec": 120,
    },
    "llm": {
        "label": "llama.cpp Qwen3.5",
        "description": "OpenAI-compatible llama.cpp server for the chat model.",
        "cwd": "${WORKSPACE_ROOT}/llama.cpp",
        "command": (
            "./build-cuda/bin/llama-server -m ./Qwen3.5-9B.Q8_0.gguf --alias qwen3.5-9b "
            "--host 0.0.0.0 --port 8080 -ngl 99 -c 4096 --jinja --reasoning off"
        ),
        "health_url": "http://127.0.0.1:8080/health",
        "startup_wait_sec": 5,
        "startup_ready_timeout_sec": 90,
    },
    "tts": {
        "label": "CosyVoice3 TTS",
        "description": "Trained CosyVoice3 API with internal vLLM acceleration.",
        "cwd": "${WORKSPACE_ROOT}/CosyVoice",
        "command": (
            "conda run --no-capture-output -n cosyvoice_vllm python -u "
            "\"${PROJECT_ROOT}/services/tts/trained_tts_server.py\" "
            "--repo_dir \"${WORKSPACE_ROOT}/CosyVoice\" "
            "--model_dir \"${WORKSPACE_ROOT}/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B\" "
            "--speaker hanser --load_vllm --fp16 --defer_load --host 0.0.0.0 --port 50000"
        ),
        "health_url": "http://127.0.0.1:50000/health",
        "startup_wait_sec": 0,
        "startup_ready_timeout_sec": 60,
    },
}


class ServiceManager:
    """Manage ASR/LLM/TTS subprocesses and their runtime logs."""

    def __init__(self, config_path: Path | None, log_dir: Path):
        self.config_path = config_path
        self.log_dir = log_dir
        self.services = load_service_profiles(config_path)
        self.processes: dict[str, subprocess.Popen] = {}
        self.log_files: dict[str, Path] = {}
        self.started_at: dict[str, float] = {}
        self.last_started_commands: dict[str, str] = {}
        self.log_dir.mkdir(parents=True, exist_ok=True)
        if self.config_path and not self.config_path.exists():
            self.save_profiles()
        for sid in self.services:
            pid = self._read_service_pid(sid)
            if pid and _is_pid_alive(pid):
                self.started_at[sid] = linux_process_started_at(pid) or time.time()
                proc = _create_virtual_process(pid)
                if proc:
                    self.processes[sid] = proc

    def update_service(self, service_id: str, patch: dict) -> dict:
        if service_id not in self.services:
            raise KeyError(service_id)
        if not self.config_path:
            raise RuntimeError("service config path is not configured")

        service = self.services[service_id]
        for key in ("label", "description", "cwd", "command", "health_url"):
            if key in patch and patch[key] is not None:
                service[key] = str(patch[key])
        for numeric_key in ("startup_wait_sec", "startup_ready_timeout_sec"):
            if numeric_key not in patch or patch[numeric_key] is None:
                continue
            try:
                service[numeric_key] = float(patch[numeric_key])
            except (TypeError, ValueError):
                pass
        self.save_profiles()
        verified = load_service_profiles(self.config_path).get(service_id, {})
        for key in ("label", "description", "cwd", "command", "health_url", "startup_wait_sec", "startup_ready_timeout_sec"):
            if key in service and verified.get(key) != service.get(key):
                raise RuntimeError(f"service config save verification failed for {service_id}.{key}")
        self.services[service_id] = verified or service
        return self.service_config_view(service_id)

    def save_profiles(self) -> None:
        if not self.config_path:
            raise RuntimeError("service config path is not configured")
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"schema_version": SERVICE_PROFILE_SCHEMA_VERSION, "services": self.services}
        tmp_path = self.config_path.with_suffix(f"{self.config_path.suffix}.tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(self.config_path)

    def service_config_view(self, service_id: str) -> dict:
        service = self.services[service_id]
        final_command = final_service_command(service_id, service)
        return {
            **service,
            "id": service_id,
            "configured_command": service.get("command", ""),
            "final_command": final_command,
            "effective_command": final_command,
            "config_path": str(self.config_path) if self.config_path else "",
        }

    async def status_all(self) -> list[dict]:
        service_ids = list(self.services)
        results = await asyncio.gather(
            *(self.status(service_id) for service_id in service_ids),
            return_exceptions=True,
        )
        statuses: list[dict] = []
        for service_id, result in zip(service_ids, results):
            if isinstance(result, Exception):
                service = self.services.get(service_id, {})
                statuses.append(
                    {
                        "id": service_id,
                        **service,
                        "running": False,
                        "state": "failed",
                        "error": friendly_service_error(str(result)),
                        "external": False,
                        "port_open": False,
                        "pid": None,
                        "returncode": None,
                        "started_at": self.started_at.get(service_id),
                        "log_file": str(self.log_files.get(service_id) or self.log_dir / f"{service_id}.log"),
                        "health": None,
                    }
                )
                continue
            statuses.append(result)
        return statuses

    async def status(self, service_id: str) -> dict:
        if service_id not in self.services:
            raise KeyError(service_id)

        service = self.services[service_id]
        process = self.processes.get(service_id)
        health_url = service.get("health_url", "")
        health_task = check_service(service_id, health_url) if health_url else _none_async()
        port_task = asyncio.to_thread(is_tcp_port_open, health_url) if health_url else _false_async()
        tracked_running = False
        tracked_pid = getattr(process, "pid", None) if process else None
        if process is not None:
            tracked_running = _safe_poll(process) is None
        if not tracked_running:
            tracked_pid = tracked_pid or self._read_service_pid(service_id)
            tracked_running = bool(tracked_pid and _is_pid_alive(tracked_pid))
        health, port_open = await asyncio.gather(health_task, port_task)
        if _is_unsupported_health_endpoint(health) and port_open:
            compatible = await check_openai_compatible_endpoint(service_id, health_url)
            if isinstance(health, dict):
                health = {**health, "compatible": compatible}
        external_running = bool(health and health.get("ok")) or port_open
        running = tracked_running or external_running
        returncode = None if running or process is None else _safe_poll(process)
        runtime_state = service_runtime_state(
            running=running,
            tracked_running=tracked_running,
            health=health,
            port_open=port_open,
            returncode=returncode,
        )
        status_layers = service_status_layers(
            running=running,
            tracked_running=tracked_running,
            external_running=external_running,
            health=health,
            port_open=port_open,
            returncode=returncode,
        )
        log_error = self.latest_log_error(service_id)
        if service_log_error_is_fatal(log_error) and runtime_state in {"starting", "warming"}:
            runtime_state = "failed"
        if service_startup_timed_out(
            state=runtime_state,
            started_at=self.started_at.get(service_id),
            timeout_sec=float(service.get("startup_ready_timeout_sec", 0) or 0),
            health=health,
        ):
            runtime_state = "failed"
        if runtime_state == "failed" and not running and not port_open and returncode is None:
            runtime_state = "stopped"
        runtime_error = service_runtime_error(health, returncode, log_error)
        if runtime_state == "failed" and returncode is None and not runtime_error and self.started_at.get(service_id):
            timeout_sec = float(service.get("startup_ready_timeout_sec", 0) or 0)
            runtime_error = f"服务启动超过 {timeout_sec:g}s 仍未通过健康检查。"
        if runtime_state in {"starting", "warming"}:
            runtime_error = friendly_service_error(log_error) if log_error else ""
        if runtime_state in {"ready", "running", "running_degraded"}:
            runtime_error = ""
        if runtime_state == "stopped":
            runtime_error = ""

        if (tracked_running or external_running) and process is None:
            tracked_pid = tracked_pid or self._read_service_pid(service_id)
            if tracked_pid and _is_pid_alive(tracked_pid) and service_id not in self.processes:
                proc = _create_virtual_process(tracked_pid)
                if proc:
                    self.processes[service_id] = proc
                    process = proc

        final_command = final_service_command(service_id, service)
        actual_command = self.last_started_commands.get(service_id) or self.latest_started_command(service_id)
        result = {
            **self.service_config_view(service_id),
            "running": running,
            "state": runtime_state,
            "status_layers": {**status_layers, "runtime_state": runtime_state},
            "error": runtime_error,
            "external": external_running and not tracked_running,
            "port_open": port_open,
            "pid": tracked_pid if tracked_running else None,
            "returncode": returncode,
            "started_at": self.started_at.get(service_id),
            "log_file": str(self.log_files.get(service_id) or self.log_dir / f"{service_id}.log"),
            "health": health,
        }
        if actual_command:
            result["actual_command"] = actual_command
            result["command_mismatch"] = normalize_command_for_compare(actual_command) != normalize_command_for_compare(final_command)
        else:
            result["actual_command"] = ""
            result["command_mismatch"] = False
        return result

    async def start(self, service_id: str, overrides: dict | None = None, allow_config_update: bool = False) -> dict:
        if service_id not in self.services:
            raise KeyError(service_id)

        if overrides and allow_config_update:
            self.update_service(service_id, overrides)

        process = self.processes.get(service_id)
        already_running = process is not None and _safe_poll(process) is None
        if not already_running and process is not None:
            already_running = _is_pid_alive(process.pid)
        if already_running:
            return await self.status(service_id)

        service = self.services[service_id]
        health_url = service.get("health_url", "")
        if health_url:
            health = await check_service(service_id, health_url)
            if health.get("ok") or is_tcp_port_open(health_url):
                return await self.status(service_id)

        configured_command = service.get("command", "").strip()
        command = final_service_command(service_id, service)
        if not command:
            raise ValueError(f"{service_id} command is empty")

        cwd = expand_service_paths(service.get("cwd") or "") or None
        if cwd and not Path(cwd).exists():
            raise FileNotFoundError(f"{service_id} cwd does not exist: {cwd}")

        self.log_dir.mkdir(parents=True, exist_ok=True)
        log_file = self.log_dir / f"{service_id}.log"
        log_handle = log_file.open("ab", buffering=0)
        log_handle.write(f"\n\n===== start {time.strftime('%Y-%m-%d %H:%M:%S')} =====\n".encode("utf-8"))
        log_handle.write((f"configured command: {configured_command}\n").encode("utf-8", errors="replace"))
        log_handle.write((f"final command: {command}\n").encode("utf-8", errors="replace"))

        env = service_process_env()
        kwargs = {
            "cwd": cwd,
            "stdout": log_handle,
            "stderr": subprocess.STDOUT,
            "shell": True,
            "env": env,
        }
        if platform.system() == "Windows":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["executable"] = "/bin/bash"
            kwargs["start_new_session"] = True

        process = subprocess.Popen(command, **kwargs)
        log_handle.close()
        self.processes[service_id] = process
        self.log_files[service_id] = log_file
        self.started_at[service_id] = time.time()
        self.last_started_commands[service_id] = command
        self._write_service_pid(service_id, process.pid)
        return await self.status(service_id)

    async def stop(self, service_id: str) -> dict:
        if service_id not in self.services:
            raise KeyError(service_id)

        process = self.processes.get(service_id)
        pid = getattr(process, "pid", None) if process else self._read_service_pid(service_id)
        if process is None and pid and _is_pid_alive(pid):
            process = _create_virtual_process(pid)
            if process:
                self.processes[service_id] = process

        if process is not None and _safe_poll(process) is None:
            await asyncio.to_thread(self._terminate_process, process)
        elif pid and _is_pid_alive(pid):
            await asyncio.to_thread(self._terminate_pid, pid)

        try:
            self._pid_file(service_id).unlink()
        except FileNotFoundError:
            pass
        self.processes.pop(service_id, None)
        self.started_at.pop(service_id, None)
        return await self.status(service_id)

    async def start_all(self, overrides: dict | None = None, allow_config_update: bool = False) -> list[dict]:
        results = []
        service_ids = list(self.services)
        for index, service_id in enumerate(service_ids):
            service_overrides = (overrides or {}).get(service_id)
            results.append(await self.start(service_id, service_overrides, allow_config_update=allow_config_update))
            timeout_sec = float(self.services[service_id].get("startup_ready_timeout_sec", 0) or 0)
            if timeout_sec > 0 and index < len(service_ids) - 1:
                await self.wait_until_startup_settled(service_id, timeout_sec=timeout_sec)
            wait_sec = float(self.services[service_id].get("startup_wait_sec", 0) or 0)
            if wait_sec > 0 and index < len(service_ids) - 1:
                await asyncio.sleep(wait_sec)
        return results

    async def wait_until_startup_settled(self, service_id: str, *, timeout_sec: float) -> dict:
        deadline = time.time() + max(0.0, timeout_sec)
        last_status: dict = {}
        while time.time() < deadline:
            last_status = await self.status(service_id)
            state = str(last_status.get("state") or "")
            if state in {"ready", "failed", "stopped"}:
                return last_status
            await asyncio.sleep(1.5)
        return last_status or await self.status(service_id)

    async def stop_all(self) -> list[dict]:
        results = []
        for service_id in self.services:
            results.append(await self.stop(service_id))
        return results

    def read_logs(self, service_id: str, max_bytes: int = 24000) -> str:
        if service_id not in self.services:
            raise KeyError(service_id)

        log_file = self.log_files.get(service_id) or self.log_dir / f"{service_id}.log"
        if not log_file.exists():
            return ""

        with log_file.open("rb") as file:
            file.seek(0, os.SEEK_END)
            size = file.tell()
            file.seek(max(0, size - max_bytes), os.SEEK_SET)
            data = file.read()
        return data.decode("utf-8", errors="replace")

    def clear_logs(self, service_id: str | None = None) -> dict:
        if service_id is not None and service_id not in self.services:
            raise KeyError(service_id)

        service_ids = [service_id] if service_id else list(self.services)
        cleared = []
        for sid in service_ids:
            log_file = self.log_files.get(sid) or self.log_dir / f"{sid}.log"
            log_file.parent.mkdir(parents=True, exist_ok=True)
            log_file.write_text("", encoding="utf-8")
            cleared.append({"id": sid, "log_file": str(log_file)})
        return {"cleared": cleared}

    def latest_log_error(self, service_id: str, max_bytes: int = 16000) -> str:
        try:
            text = self.read_logs(service_id, max_bytes=max_bytes)
        except Exception:
            return ""
        return extract_service_log_error(text)

    def latest_started_command(self, service_id: str, max_bytes: int = 32000) -> str:
        try:
            text = self.read_logs(service_id, max_bytes=max_bytes)
        except Exception:
            return ""
        return extract_latest_started_command(text)

    def _terminate_process(self, process: subprocess.Popen) -> None:
        pid = process.pid
        self._terminate_pid(pid)
        if hasattr(process, "returncode"):
            try:
                process.returncode = process.returncode or -15
            except AttributeError:
                pass

    def _terminate_pid(self, pid: int) -> None:
        if platform.system() == "Windows":
            self._terminate_windows_process_tree(pid)
            return
        self._terminate_posix_process_group(pid)

    def _terminate_windows_process_tree(self, pid: int) -> None:
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=4,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        self._wait_pid_exit(pid, timeout_sec=3.0)

    def _terminate_posix_process_group(self, pid: int) -> None:
        for sig, timeout_sec in ((signal.SIGTERM, 2.0), (signal.SIGKILL, 1.5)):
            try:
                os.killpg(pid, sig)
            except OSError:
                try:
                    os.kill(pid, sig)
                except OSError:
                    return
            if self._wait_pid_exit(pid, timeout_sec=timeout_sec):
                return

    def _wait_pid_exit(self, pid: int, *, timeout_sec: float) -> bool:
        deadline = time.time() + max(0.0, timeout_sec)
        while time.time() < deadline:
            if not _is_pid_alive(pid):
                return True
            time.sleep(0.1)
        return not _is_pid_alive(pid)

    def _pid_file(self, service_id: str) -> Path:
        return self.log_dir / f"{service_id}.pid"

    def _write_service_pid(self, service_id: str, pid: int) -> None:
        self._pid_file(service_id).write_text(str(pid), encoding="utf-8")

    def _read_service_pid(self, service_id: str) -> int | None:
        pf = self._pid_file(service_id)
        if pf.exists():
            try:
                return int(pf.read_text(encoding="utf-8").strip())
            except (ValueError, OSError):
                pass
        return None


def load_service_profiles(config_path: Path | None) -> dict:
    profiles = json.loads(json.dumps(DEFAULT_SERVICE_PROFILES))
    if config_path and config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        for service_id, service_patch in (data.get("services") or {}).items():
            if service_id in profiles and isinstance(service_patch, dict):
                profiles[service_id].update(service_patch)
    migrated = migrate_legacy_service_paths(profiles)
    if config_path and config_path.exists() and migrated != profiles:
        config_path.write_text(json.dumps({"schema_version": SERVICE_PROFILE_SCHEMA_VERSION, "services": migrated}, ensure_ascii=False, indent=2), encoding="utf-8")
    return migrated


def final_service_command(service_id: str, service: dict) -> str:
    command = expand_service_paths(str(service.get("command") or "").strip())
    return tune_start_command(service_id, command)


def service_process_env(base_env: dict[str, str] | None = None, *, home: Path | None = None) -> dict[str, str]:
    env = dict(base_env or os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    if platform.system() == "Windows":
        return env

    home_dir = Path(home or env.get("HOME") or Path.home()).expanduser()
    candidates = (
        home_dir / "miniconda3" / "bin",
        home_dir / "miniconda3" / "condabin",
        home_dir / "anaconda3" / "bin",
        home_dir / "anaconda3" / "condabin",
        Path("/opt/conda/bin"),
        Path("/opt/conda/condabin"),
    )
    path_parts = [part for part in env.get("PATH", "").split(os.pathsep) if part]
    prepend = [str(path) for path in candidates if path.exists() and str(path) not in path_parts]
    if prepend:
        env["PATH"] = os.pathsep.join(prepend + path_parts)
    return env


def expand_service_paths(value: str) -> str:
    text = str(value or "")
    if not text:
        return ""
    text = text.replace(LEGACY_AUTODL_REPO, PROJECT_ROOT.as_posix())
    text = text.replace(LEGACY_AUTODL_PROJECT, WORKSPACE_ROOT.as_posix())
    for token, path in SERVICE_PATH_TOKENS.items():
        text = text.replace(f"{token}/", f"{path.rstrip('/')}/")
        text = text.replace(token, path)
    return text


def migrate_legacy_service_paths(profiles: dict) -> dict:
    def migrate_value(value):
        if isinstance(value, dict):
            return {key: migrate_value(item) for key, item in value.items()}
        if isinstance(value, list):
            return [migrate_value(item) for item in value]
        if not isinstance(value, str):
            return value
        return value.replace(LEGACY_AUTODL_REPO, "${PROJECT_ROOT}").replace(LEGACY_AUTODL_PROJECT, "${WORKSPACE_ROOT}")

    return migrate_value(profiles)


def service_runtime_state(
    *,
    running: bool,
    tracked_running: bool,
    health: dict | None,
    port_open: bool,
    returncode: int | None,
) -> str:
    payload = normalized_health_payload(health)
    compatible = (health or {}).get("compatible") if isinstance(health, dict) else None
    model_status = str(payload.get("status") or "").lower()
    detail = str(payload.get("detail") or payload.get("message") or payload.get("error") or "").lower()
    ready = payload.get("ready")

    if returncode is not None:
        return "failed"
    if isinstance(compatible, dict) and compatible.get("ok") and (running or tracked_running or port_open):
        return "running_degraded"
    if model_status in {"error", "failed"}:
        return "failed"
    if any(marker in model_status for marker in ("failed", "failure", "error", "exception", "traceback")):
        return "failed"
    if model_status in {"loading", "warming", "starting"}:
        return "warming" if model_status == "warming" else "starting"
    if any(marker in model_status for marker in ("loading", "warming", "starting", "not_started", "not started")):
        return "warming" if "warming" in model_status else "starting"
    if health and health.get("ok") is False:
        status = health.get("status")
        if isinstance(status, int) and status >= 500 and (running or tracked_running or port_open):
            if any(marker in detail for marker in ("failed", "failure", "error", "exception", "traceback")):
                return "failed"
            if any(marker in detail for marker in ("loading", "warming", "starting", "not_started", "not started")):
                return "warming" if "warming" in detail else "starting"
            if ready is False and not detail:
                return "starting"
            return "failed"
    if ready is False:
        return "starting"
    if health and health.get("ok"):
        return "ready"
    if health and health.get("ok") is False:
        status = health.get("status")
        if status in {404, 405} and (running or tracked_running or port_open):
            return "running_degraded"
        if running or tracked_running or port_open:
            return "starting"
        return "stopped"
    if port_open:
        return "running_degraded"
    if running or tracked_running or port_open:
        return "starting"
    return "stopped"


def service_runtime_error(health: dict | None, returncode: int | None, log_error: str = "") -> str:
    payload = normalized_health_payload(health)
    error = payload.get("error") or (health or {}).get("error")
    if error:
        return friendly_service_error(str(error))
    if log_error:
        return friendly_service_error(log_error)
    if health and health.get("ok") is False and health.get("status"):
        if health.get("status") in {404, 405}:
            return ""
        return f"HTTP {health.get('status')}"
    if returncode is not None:
        return f"exit {returncode}"
    return ""


def service_status_layers(
    *,
    running: bool,
    tracked_running: bool,
    external_running: bool,
    health: dict | None,
    port_open: bool,
    returncode: int | None,
) -> dict:
    runtime_state = service_runtime_state(
        running=running,
        tracked_running=tracked_running,
        health=health,
        port_open=port_open,
        returncode=returncode,
    )
    health_payload = normalized_health_payload(health)
    health_status = str(health_payload.get("status") or health_payload.get("detail") or "").lower()
    if returncode is not None:
        process_state = "exited"
    elif tracked_running:
        process_state = "tracked"
    elif external_running:
        process_state = "external"
    elif running:
        process_state = "running"
    else:
        process_state = "stopped"

    if port_open:
        port_state = "open"
    elif running or tracked_running:
        port_state = "waiting"
    else:
        port_state = "closed"

    if not health:
        health_state = "unknown"
    elif health.get("ok"):
        health_state = "healthy"
    elif health.get("status") in {404, 405} and port_open:
        health_state = "unsupported"
    elif any(marker in health_status for marker in ("loading", "warming", "starting", "not_started", "not started")):
        health_state = "loading"
    elif health.get("status"):
        health_state = "unhealthy"
    else:
        health_state = "unreachable"

    return {
        "process_state": process_state,
        "port_state": port_state,
        "health_state": health_state,
        "runtime_state": runtime_state,
    }


def service_startup_timed_out(
    *,
    state: str,
    started_at: float | int | None,
    timeout_sec: float | int,
    health: dict | None,
    now: float | None = None,
) -> bool:
    if str(state or "") not in {"starting", "warming"}:
        return False
    try:
        started = float(started_at or 0)
        timeout = float(timeout_sec or 0)
    except (TypeError, ValueError):
        return False
    if started <= 0 or timeout <= 0:
        return False
    if health and health.get("ok"):
        return False
    return float(now if now is not None else time.time()) - started > timeout


def linux_process_started_at(pid: int, *, proc_root: Path = Path("/proc"), clock_ticks: int | None = None) -> float | None:
    if platform.system() == "Windows":
        return None
    try:
        stat_text = (proc_root / str(pid) / "stat").read_text(encoding="utf-8", errors="replace")
        system_stat = (proc_root / "stat").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    match = re.match(r"^\d+\s+\(.+\)\s+(.+)$", stat_text.strip())
    if not match:
        return None
    fields_after_comm = match.group(1).split()
    if len(fields_after_comm) < 20:
        return None
    try:
        start_ticks = float(fields_after_comm[19])
    except ValueError:
        return None

    boot_time = None
    for line in system_stat.splitlines():
        if line.startswith("btime "):
            try:
                boot_time = float(line.split()[1])
            except (IndexError, ValueError):
                return None
            break
    if boot_time is None:
        return None
    ticks = clock_ticks or os.sysconf(os.sysconf_names.get("SC_CLK_TCK", "SC_CLK_TCK"))
    try:
        return boot_time + start_ticks / float(ticks)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def extract_service_log_error(text: str) -> str:
    if not text:
        return ""
    start_match = list(re.finditer(r"^=+\s*start\s+\d{4}-\d{2}-\d{2}", text, flags=re.MULTILINE))
    if start_match:
        text = text[start_match[-1].start() :]
    lower = text.lower()
    markers = (
        "no available memory for the cache blocks",
        "error in memory profiling",
        "engine core initialization failed",
        "cuda out of memory",
        "outofmemoryerror",
        "address already in use",
        "port already in use",
        "no such file or directory",
    )
    for marker in markers:
        index = lower.rfind(marker)
        if index >= 0:
            start = max(0, text.rfind("\n", 0, index - 1))
            end = text.find("\n", index)
            if end < 0:
                end = min(len(text), index + 260)
            return text[start:end].strip()
    return ""


def service_log_error_is_fatal(text: str) -> bool:
    lower = str(text or "").lower()
    fatal_markers = (
        "no available memory for the cache blocks",
        "error in memory profiling",
        "engine core initialization failed",
        "cuda out of memory",
        "outofmemoryerror",
        "address already in use",
        "port already in use",
        "conda: command not found",
        "conda': no such file or directory",
        "conda: no such file",
        "no such file or directory",
        "does not exist",
    )
    return any(marker in lower for marker in fatal_markers)


def extract_latest_started_command(text: str) -> str:
    if not text:
        return ""
    latest = ""
    collecting_final = False
    final_lines: list[str] = []

    def flush_final() -> None:
        nonlocal latest, final_lines
        if final_lines:
            latest = collapse_multiline_command(final_lines)
            final_lines = []

    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        lower = stripped.lower()
        if lower.startswith("final command:"):
            flush_final()
            collecting_final = True
            final_lines = [stripped.split(":", 1)[1].strip()]
            continue
        if collecting_final:
            if raw_line.startswith((" ", "\t")) and stripped:
                final_lines.append(stripped)
                continue
            flush_final()
            collecting_final = False
    if collecting_final:
        flush_final()
    return latest


def collapse_multiline_command(lines: list[str]) -> str:
    parts = []
    for line in lines:
        part = str(line or "").strip()
        if part.endswith("\\"):
            part = part[:-1].rstrip()
        if part:
            parts.append(part)
    return " ".join(parts)


def friendly_service_error(text: str) -> str:
    lower = str(text or "").lower()
    if "no available memory for the cache blocks" in lower:
        return "ASR vLLM KV cache 显存不足：建议使用 --gpu-memory-utilization 0.25 和 --max-model-len 1024，仍失败再停止其他模型服务后重试。"
    if "error in memory profiling" in lower or "engine core initialization failed" in lower:
        return "vLLM 显存 profiling 失败：启动时 GPU 显存被其他模型释放或占用，建议停止/等待其他 GPU 服务稳定后单独重启该服务。"
    if "cuda out of memory" in lower or "outofmemoryerror" in lower:
        return "CUDA 显存不足：请先停止其他模型服务，或降低模型长度/显存占用后重试。"
    if "address already in use" in lower or "port already in use" in lower:
        return "端口已被占用：请停止旧服务或修改端口。"
    if "conda: command not found" in lower or "conda': no such file or directory" in lower or "conda: no such file" in lower:
        return "Conda 未进入服务进程 PATH：请确认 /home/me/miniconda3 存在，或在服务命令中使用 conda 的绝对路径。"
    if "no such file or directory" in lower or "does not exist" in lower:
        return "路径不存在：请检查服务命令里的模型路径、conda 路径或工作目录。"
    return str(text or "")


def normalized_health_payload(health: dict | None) -> dict:
    payload = (health or {}).get("payload") or {}
    if not isinstance(payload, dict):
        return {}
    detail = payload.get("detail")
    if isinstance(detail, dict):
        merged = dict(payload)
        merged.update(detail)
        return merged
    return payload


def tune_start_command(service_id: str, command: str) -> str:
    if service_id != "asr":
        return command
    command = ensure_arg(command, "--gpu-memory-utilization", DEFAULT_ASR_GPU_MEMORY_UTILIZATION)
    command = ensure_arg(command, "--max-model-len", DEFAULT_ASR_MAX_MODEL_LEN)
    command = ensure_arg(command, "--max-num-seqs", "1")
    command = normalize_conda_env_threads(command)
    return command


def ensure_arg(command: str, name: str, value: str) -> str:
    pattern = rf"{re.escape(name)}(?:=|\s+)\S+"
    if re.search(pattern, command):
        return command
    return f"{command.strip()} {name} {value}".strip()


def normalize_command_for_compare(command: str) -> str:
    text = re.sub(r"\\\s*(?:\r?\n|\s+)", " ", str(command or ""))
    return " ".join(text.split())


def normalize_conda_env_threads(command: str) -> str:
    prefix = "env OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1"
    stripped = command.strip()
    if stripped.startswith("env ") or " OMP_NUM_THREADS=" in stripped:
        return stripped
    return f"{prefix} {stripped}"


async def check_service(name: str, url: str) -> dict:
    started = time.perf_counter()
    try:
        timeout = httpx.Timeout(SERVICE_HEALTH_TIMEOUT_SEC, connect=0.3, pool=0.3)
        async with httpx_client_for_url(url, timeout=timeout) as client:
            resp = await client.get(url)
        payload = {}
        try:
            payload = resp.json()
        except ValueError:
            payload = {}
        return {
            "name": name,
            "ok": 200 <= resp.status_code < 400,
            "status": resp.status_code,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "url": url,
            "payload": payload if isinstance(payload, dict) else {},
        }
    except Exception as exc:
        return {
            "name": name,
            "ok": False,
            "error": str(exc),
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "url": url,
        }


def _is_unsupported_health_endpoint(health: dict | None) -> bool:
    if not isinstance(health, dict):
        return False
    return health.get("ok") is False and health.get("status") in {404, 405}


def _compatible_models_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, "/v1/models", "", ""))


async def check_openai_compatible_endpoint(name: str, health_url: str) -> dict:
    started = time.perf_counter()
    url = _compatible_models_url(health_url)
    try:
        timeout = httpx.Timeout(SERVICE_HEALTH_TIMEOUT_SEC, connect=0.3, pool=0.3)
        async with httpx_client_for_url(url, timeout=timeout) as client:
            resp = await client.get(url)
        return {
            "name": name,
            "ok": 200 <= resp.status_code < 500,
            "status": resp.status_code,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "url": url,
        }
    except Exception as exc:
        return {
            "name": name,
            "ok": False,
            "error": str(exc),
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "url": url,
        }


async def _none_async() -> None:
    return None


async def _false_async() -> bool:
    return False


def health_url_from(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, "/health", "", ""))


def is_tcp_port_open(url: str, timeout: float = SERVICE_PORT_TIMEOUT_SEC) -> bool:
    if not url:
        return False
    parts = urlsplit(url)
    host = parts.hostname
    port = parts.port
    if not host or not port:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _is_pid_alive(pid: int, *, proc_root: Path = Path("/proc")) -> bool:
    if platform.system() != "Windows":
        try:
            stat_text = (proc_root / str(pid) / "stat").read_text(encoding="utf-8", errors="replace")
            match = re.match(r"^\d+\s+\(.+\)\s+(\S+)", stat_text.strip())
            if match and match.group(1) == "Z":
                return False
        except OSError:
            pass
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _safe_poll(proc) -> int | None:
    try:
        return proc.poll()
    except AttributeError:
        return None


def _create_virtual_process(pid: int) -> subprocess.Popen | None:
    try:
        proc = subprocess.Popen.__new__(subprocess.Popen)
        proc.pid = pid
        proc.returncode = None
        if platform.system() == "Windows":
            return None
        return proc
    except Exception:
        return None
