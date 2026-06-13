from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from shutil import which
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Request

from core.http_client import httpx_client_for_url
from service_runtime.services import check_openai_compatible_endpoint, check_service, health_url_from
from domain.paths import (
    FRONTEND_DIST_DIR,
    INTEGRATIONS_CONFIG,
    LOG_DIR,
    MEMORY_DB,
    PROACTIVE_CONFIG,
    PROACTIVE_DB,
    PROJECT_ROOT,
    REMINDERS_DB,
    RUNTIME_DIR,
    SERVICE_PROFILES_CONFIG,
    SETTINGS_CONFIG,
    STICKER_LIBRARY_INDEX,
    TOOL_PROVIDERS_CONFIG,
    TOOLS_CONFIG,
)

TINY_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR4nGMIWHDnPyWYYdSAUQNGDRguBgAAjJXLH15wN5kAAAAASUVORK5CYII="
)


def path_status(path: Path, *, directory: bool = False) -> dict:
    exists = path.is_dir() if directory else path.exists()
    return {
        "path": str(path),
        "exists": exists,
        "kind": "directory" if directory else "file",
    }


def command_status(command: str) -> dict:
    resolved = which(command)
    return {"command": command, "available": bool(resolved), "path": resolved or ""}


def count_items(value) -> int:
    try:
        return len(value)
    except TypeError:
        return 0


def create_diagnostics_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/diagnostics/summary")
    async def diagnostics_summary(request: Request):
        service_manager = request.app.state.service_manager
        services = await service_manager.status_all()
        integrations = request.app.state.integration_manager.list_integrations()
        stickers = request.app.state.sticker_store.list()
        memories = request.app.state.memory_store.list_memories(request.app.state.settings, limit=1)
        reminders = request.app.state.reminder_store.list(status="")
        proactive_events = request.app.state.proactive_store.list_events(limit=1)

        files = {
            "runtime": path_status(RUNTIME_DIR, directory=True),
            "frontend_dist": path_status(FRONTEND_DIST_DIR, directory=True),
            "settings": path_status(SETTINGS_CONFIG),
            "service_profiles": path_status(SERVICE_PROFILES_CONFIG),
            "tools": path_status(TOOLS_CONFIG),
            "tool_providers": path_status(TOOL_PROVIDERS_CONFIG),
            "integrations": path_status(INTEGRATIONS_CONFIG),
            "stickers": path_status(STICKER_LIBRARY_INDEX),
            "memory_db": path_status(MEMORY_DB),
            "reminders_db": path_status(REMINDERS_DB),
            "proactive_config": path_status(PROACTIVE_CONFIG),
            "proactive_db": path_status(PROACTIVE_DB),
            "logs": path_status(LOG_DIR, directory=True),
        }
        commands = {name: command_status(name) for name in ["node", "npm", "ffmpeg", "openclaw"]}
        issues: list[str] = []
        if not files["frontend_dist"]["exists"]:
            issues.append("前端 dist 不存在，请先在 frontend 目录运行 npm run build。")
        if not files["runtime"]["exists"]:
            issues.append("runtime 目录不存在，后端启动时应自动创建。")
        if not commands["node"]["available"]:
            issues.append("未检测到 node，微信/OpenClaw 链路可能不可用。")
        if not commands["npm"]["available"]:
            issues.append("未检测到 npm，OpenClaw 依赖安装和维护可能不可用。")
        if not commands["ffmpeg"]["available"]:
            issues.append("未检测到 ffmpeg，语音转码和微信语音链路可能不可用。")
        if not integrations.get("environment", {}).get("openclaw", {}).get("ok") and not commands["openclaw"]["available"]:
            issues.append("未检测到 openclaw，微信接入启动会失败。")

        return {
            "ok": not issues,
            "project_root": str(PROJECT_ROOT),
            "python": {
                "executable": sys.executable,
                "version": sys.version.split()[0],
                "platform": sys.platform,
            },
            "process": {"pid": os.getpid(), "cwd": os.getcwd()},
            "files": files,
            "commands": commands,
            "counts": {
                "services": count_items(services),
                "integrations": count_items(integrations.get("integrations", [])),
                "stickers": count_items(stickers),
                "memories_sampled": count_items(memories),
                "reminders": count_items(reminders),
                "proactive_events_sampled": count_items(proactive_events),
            },
            "issues": issues,
        }

    @router.post("/api/diagnostics/llm-api-test")
    async def llm_api_test(request: Request):
        settings = request.app.state.settings
        url = str(getattr(settings, "api_llm_url", "") or "").strip()
        model = str(getattr(settings, "api_llm_model", "") or "").strip()
        api_key = str(getattr(settings, "api_llm_api_key", "") or "").strip()
        if not str(url or "").strip():
            return {"ok": False, "url": "", "model": model, "error": "LLM API URL 未配置"}
        if not str(model or "").strip():
            return {"ok": False, "url": url, "model": "", "error": "LLM API 模型未配置"}
        if not api_key:
            return {"ok": False, "url": url, "model": model, "error": "LLM API Key 未配置"}

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "stream": False,
            "temperature": 0,
            "max_tokens": 8,
        }
        started = time.perf_counter()
        try:
            headers = {"Authorization": f"Bearer {api_key}"}
            async with httpx_client_for_url(url, timeout=httpx.Timeout(15.0, connect=5.0)) as client:
                resp = await client.post(url, json=payload, headers=headers)
            latency_ms = int((time.perf_counter() - started) * 1000)
            try:
                body = resp.json()
            except Exception:
                body = {"text": resp.text[:800]}
            ok = 200 <= resp.status_code < 400 and isinstance(body, dict) and bool(body.get("choices"))
            error = ""
            if not ok:
                error = extract_api_error(body) or f"HTTP {resp.status_code}"
            return {
                "ok": ok,
                "url": url,
                "model": model,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "error": error,
                "response": shrink_response(body),
            }
        except Exception as exc:
            return {
                "ok": False,
                "url": url,
                "model": model,
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "error": str(exc),
            }

    @router.get("/api/diagnostics/local-models")
    async def local_model_diagnostics(request: Request):
        settings = request.app.state.settings
        branch_url = f"http://127.0.0.1:{int(getattr(request.app.state, 'server_port', 7860) or 7860)}/api/health"
        targets = [
            {"id": "asr", "name": "ASR 服务", "url": health_url_from(settings.asr_url)},
            {"id": "llm", "name": "LLM 服务", "url": health_url_from(settings.llm_url), "compatible": True},
            {"id": "tts", "name": "TTS 服务", "url": health_url_from(settings.tts_url)},
        ]
        checks = []
        for target in targets:
            health = await check_service(target["id"], target["url"])
            if target.get("compatible") and not health.get("ok") and health.get("status") in {404, 405}:
                compatible = await check_openai_compatible_endpoint(target["id"], target["url"])
                if compatible.get("ok"):
                    health = {**health, "ok": True, "compatible": compatible, "url": compatible.get("url") or target["url"]}
            checks.append(local_model_result(target["name"], target["url"], health))
        checks.append(
            {
                "id": "branchwhisper",
                "name": "BranchWhisper 主后端",
                "ok": True,
                "status": "正常",
                "latency_ms": 0,
                "port": str(urlsplit(branch_url).port or ""),
                "url": branch_url,
                "error": "",
                "message": "可以正常调用 API",
                "curl": f"curl -sS {branch_url}",
                "detail": {"self": True, "pid": os.getpid()},
            }
        )
        return {"ok": all(item["ok"] for item in checks), "checks": checks}

    @router.post("/api/diagnostics/vision-api-test")
    async def vision_api_test(request: Request):
        settings = request.app.state.settings
        url = str(getattr(settings, "sticker_vision_url", "") or getattr(settings, "vision_url", "") or "").strip()
        model = str(getattr(settings, "sticker_vision_model", "") or getattr(settings, "vision_model", "") or "").strip()
        api_key = str(getattr(settings, "sticker_vision_api_key", "") or "").strip()
        prompt = "请识别这张图片。"
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": TINY_PNG_DATA_URL}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            "max_tokens": 1024,
            "temperature": 0.3,
        }
        request_shape = {
            **payload,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        }
        if not url:
            return vision_result(False, url, model, bool(api_key), "Vision API URL 未配置", request_shape=request_shape)
        if not model:
            return vision_result(False, url, model, bool(api_key), "Vision API 模型未配置", request_shape=request_shape)
        if not api_key:
            return vision_result(False, url, model, False, "Vision API Key 未配置", request_shape=request_shape)

        started = time.perf_counter()
        try:
            async with httpx_client_for_url(url, timeout=httpx.Timeout(30.0, connect=8.0)) as client:
                resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {api_key}"})
            latency_ms = int((time.perf_counter() - started) * 1000)
            try:
                body = resp.json()
            except Exception:
                body = {"text": resp.text[:800]}
            ok = 200 <= resp.status_code < 400 and isinstance(body, dict) and bool(body.get("choices"))
            error = "" if ok else (extract_api_error(body) or f"HTTP {resp.status_code}")
            return vision_result(
                ok,
                url,
                model,
                True,
                error,
                status_code=resp.status_code,
                latency_ms=latency_ms,
                request_shape=request_shape,
                response=shrink_response(body),
            )
        except Exception as exc:
            return vision_result(
                False,
                url,
                model,
                True,
                str(exc),
                latency_ms=int((time.perf_counter() - started) * 1000),
                request_shape=request_shape,
            )

    return router


def local_model_result(name: str, health_url: str, health: dict) -> dict:
    ok = bool(health.get("ok"))
    url = str(health.get("url") or health_url)
    error_text = "" if ok else str(health.get("error") or (f"HTTP {health.get('status')}" if health.get("status") else "连接失败"))
    return {
        "id": str(health.get("name") or name).lower(),
        "name": name,
        "ok": ok,
        "status": "正常" if ok else "异常",
        "latency_ms": health.get("latency_ms"),
        "port": str(urlsplit(url).port or ""),
        "url": url,
        "error": error_text,
        "message": "可以正常调用 API" if ok else f"调用失败：{error_text}",
        "curl": f"curl -sS {url}",
        "detail": health,
    }


def vision_result(
    ok: bool,
    url: str,
    model: str,
    api_key_set: bool,
    error: str = "",
    *,
    status_code: int | None = None,
    latency_ms: int | None = None,
    request_shape: dict | None = None,
    response=None,
) -> dict:
    return {
        "ok": ok,
        "url": url,
        "model": model,
        "api_key_set": api_key_set,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "error": "" if ok else error,
        "message": "可以正常调用识图 API" if ok else f"调用失败：{error or '未知错误'}",
        "request_shape": request_shape or {},
        "response": response or {},
    }


def extract_api_error(body) -> str:
    if not isinstance(body, dict):
        return ""
    error = body.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "")
    if isinstance(error, str):
        return error
    return str(body.get("message") or body.get("detail") or "")


def shrink_response(body):
    if not isinstance(body, dict):
        return body
    result = {key: body.get(key) for key in ["id", "object", "created", "model"] if key in body}
    choices = body.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        result["choices"] = [first if not isinstance(first, dict) else {key: first.get(key) for key in ["index", "finish_reason", "message"] if key in first}]
    if not result:
        return {key: body.get(key) for key in list(body.keys())[:8]}
    return result
