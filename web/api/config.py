from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Body, Request

from api.dependencies import require_local_service_control
from core.config import public_settings, save_persisted_settings, update_llm_api_key
from domain.paths import APP_DIR, SETTINGS_CONFIG
from services.model_files import extract_model_path_from_command, list_model_files, safe_model_browse_root


def create_config_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/config")
    async def config(request: Request):
        return public_settings(request.app.state.settings)

    @router.patch("/api/config")
    async def update_config(request: Request, payload: dict | None = Body(default=None)):
        payload = dict(payload or {})
        update_llm_api_key(request.app.state.settings, payload)
        request.app.state.settings.update_from_dict(payload)
        save_persisted_settings(request.app.state.settings, SETTINGS_CONFIG)
        return public_settings(request.app.state.settings)

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
