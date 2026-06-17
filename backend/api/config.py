from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException, Request

from api.dependencies import require_local_service_control
from core.config import public_settings, save_persisted_settings, update_audio_api_keys, update_llm_api_key
from domain.paths import APP_DIR, SETTINGS_CONFIG, UPLOAD_DIR
from service_runtime.tts_clients import save_voice_sample_data_url, tts_provider_capabilities
from services.model_files import extract_model_path_from_command, list_model_files, safe_model_browse_root


def create_config_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/config")
    async def config(request: Request):
        return public_settings(request.app.state.settings)

    @router.patch("/api/config")
    async def update_config(request: Request, payload: dict | None = Body(default=None)):
        payload = dict(payload or {})
        settings = request.app.state.settings
        before = asdict(settings)
        try:
            update_llm_api_key(settings, payload)
            update_audio_api_keys(settings, payload)
            settings.update_from_dict(payload)
            save_persisted_settings(settings, SETTINGS_CONFIG)
        except Exception as exc:
            for key, value in before.items():
                setattr(settings, key, value)
            raise HTTPException(
                status_code=500,
                detail=f"保存配置失败：path={SETTINGS_CONFIG} error={exc}",
            ) from exc
        return public_settings(settings)

    @router.post("/api/config/voice-samples")
    async def upload_voice_sample(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = dict(payload or {})
        provider = str(payload.get("provider") or getattr(request.app.state.settings, "api_tts_provider", "openai"))
        profile = save_voice_sample_data_url(
            UPLOAD_DIR / "voice_samples",
            str(payload.get("data_url") or ""),
            str(payload.get("name") or "voice-reference"),
            provider,
        )
        profile["capabilities"] = tts_provider_capabilities(provider)
        return {"ok": True, "profile": profile}

    @router.get("/api/config/tools")
    async def tool_provider_config(request: Request):
        require_local_service_control(request)
        return {"tools": request.app.state.tool_providers.public()}

    @router.patch("/api/config/tools")
    async def update_tool_provider_config(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        return {"tools": request.app.state.tool_providers.update(payload or {})}

    @router.get("/api/files/models")
    async def model_files(request: Request, root: str = "", query: str = ""):
        require_local_service_control(request)
        llm_service = request.app.state.service_manager.services.get("llm", {})
        llm_cwd = Path(str(llm_service.get("cwd") or APP_DIR)).expanduser()
        model_path = extract_model_path_from_command(str(llm_service.get("command") or ""))
        default_root = (llm_cwd / model_path).parent if model_path else llm_cwd
        browse_root = safe_model_browse_root(root, default_root)
        return list_model_files(browse_root, query=query)

    return router
