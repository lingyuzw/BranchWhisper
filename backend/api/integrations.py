from __future__ import annotations

from typing import Awaitable, Callable

import re

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse

from api.dependencies import require_integration_dialog_access, require_local_service_control

ResolveBranchwhisperUrl = Callable[[Request, str], Awaitable[str]]
PreferredIntegrationId = Callable[..., str]


def create_integrations_router(
    resolve_branchwhisper_url: ResolveBranchwhisperUrl,
    preferred_integration_id: PreferredIntegrationId,
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/integrations")
    async def integrations(request: Request):
        require_local_service_control(request)
        return request.app.state.integration_manager.list_integrations()

    @router.get("/api/integrations/weixin/my-session")
    async def my_weixin_session(request: Request):
        require_local_service_control(request)
        integration_id = preferred_integration_id(request.app)
        return {
            "integration_id": integration_id,
            "session": request.app.state.integration_manager.my_weixin_session(integration_id) if integration_id else {},
        }

    @router.post("/api/integrations")
    async def create_integration(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            item = request.app.state.integration_manager.create_integration(payload or {})
        except ValueError as exc:
            raise HTTPException(
                status_code=409,
                detail="接入实例已存在，请编辑已有实例或换一个实例名。",
            ) from exc
        return {"integration": item, **request.app.state.integration_manager.list_integrations()}

    @router.patch("/api/integrations/{integration_id}")
    async def update_integration(integration_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            item = request.app.state.integration_manager.update_integration(integration_id, payload or {})
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"integration": item, **request.app.state.integration_manager.list_integrations()}

    @router.delete("/api/integrations/{integration_id}")
    async def delete_integration(integration_id: str, request: Request):
        require_local_service_control(request)
        ok = request.app.state.integration_manager.delete_integration(integration_id)
        return {"ok": ok, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/install")
    async def install_integration(integration_id: str, request: Request):
        require_local_service_control(request)
        try:
            result = await request.app.state.integration_manager.install_weixin_cli(integration_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"result": result, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/start")
    async def start_integration(integration_id: str, request: Request):
        require_local_service_control(request)
        try:
            branchwhisper_url = await resolve_branchwhisper_url(request, "")
            result = await request.app.state.integration_manager.start_bridge(
                integration_id,
                branchwhisper_url=branchwhisper_url,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"result": result, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/stop")
    async def stop_integration(integration_id: str, request: Request):
        require_local_service_control(request)
        process_result = request.app.state.integration_manager.stop_process(integration_id)
        return {"result": {"process": process_result}, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/restart")
    async def restart_integration(integration_id: str, request: Request):
        require_local_service_control(request)
        request.app.state.integration_manager.stop_process(integration_id)
        try:
            branchwhisper_url = await resolve_branchwhisper_url(request, "")
            result = await request.app.state.integration_manager.start_bridge(
                integration_id,
                branchwhisper_url=branchwhisper_url,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"result": result, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/login")
    async def login_integration(integration_id: str, request: Request):
        require_local_service_control(request)
        try:
            result = await request.app.state.integration_manager.login(integration_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"result": result, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/login/qr")
    async def start_integration_qr_login(integration_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            result = await request.app.state.integration_manager.request_weixin_login_qr(
                integration_id,
                force=bool((payload or {}).get("force", False)),
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"result": result, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/login/poll")
    async def poll_integration_qr_login(integration_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            result = await request.app.state.integration_manager.poll_weixin_login(
                integration_id,
                verify_code=str((payload or {}).get("verify_code") or ""),
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"result": result, **request.app.state.integration_manager.list_integrations()}

    @router.post("/api/integrations/{integration_id}/bridge/start")
    async def start_integration_bridge(integration_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = payload or {}
        branchwhisper_url = await resolve_branchwhisper_url(
            request,
            str(payload.get("branchwhisper_url") or payload.get("buding_url") or ""),
        )
        try:
            result = await request.app.state.integration_manager.start_bridge(
                integration_id,
                branchwhisper_url=branchwhisper_url,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        return {"result": result, **request.app.state.integration_manager.list_integrations()}

    @router.get("/api/integrations/{integration_id}/logs")
    async def integration_logs(integration_id: str, request: Request, max_bytes: int = 36000, scope: str = "all"):
        require_local_service_control(request)
        return {
            "id": integration_id,
            "scope": scope,
            "logs": request.app.state.integration_manager.read_logs_scoped(integration_id, max_bytes=max_bytes, scope=scope),
        }

    @router.delete("/api/integrations/{integration_id}/logs")
    async def clear_integration_logs(integration_id: str, request: Request):
        require_local_service_control(request)
        return request.app.state.integration_manager.clear_logs(integration_id)

    @router.post("/api/integrations/{integration_id}/timings/{trace_id}")
    async def update_integration_timing(integration_id: str, trace_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            timing = request.app.state.integration_manager.update_message_timing(integration_id, trace_id, payload or {})
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"timing": timing}

    @router.post("/api/integrations/{integration_id}/voice-test")
    async def integration_voice_test(integration_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = payload or {}
        try:
            return await request.app.state.external_dialog_engine.voice_test(
                integration_id,
                request.app.state.settings,
                str(payload.get("text") or ""),
                sender_id=str(payload.get("sender_id") or ""),
                account_id=str(payload.get("account_id") or ""),
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            return JSONResponse(
                status_code=200,
                content={
                    "ok": False,
                    "stage": "api",
                    "error": f"Integration voice test failed: {exc}",
                },
            )

    @router.post("/api/integrations/{integration_id}/sticker-test")
    async def integration_sticker_test(integration_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = payload or {}
        try:
            return await request.app.state.external_dialog_engine.sticker_test(
                integration_id,
                request.app.state.settings,
                str(payload.get("text") or ""),
                sender_id=str(payload.get("sender_id") or ""),
                account_id=str(payload.get("account_id") or ""),
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Integration not found") from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Integration sticker test failed: {exc}") from exc

    @router.post("/api/integrations/dialog")
    async def integration_dialog(request: Request, payload: dict | None = Body(default=None)):
        require_integration_dialog_access(request)
        try:
            return await request.app.state.external_dialog_engine.handle(payload or {}, request.app.state.settings)
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "data": {}, "error": str(exc), "message": f"消息格式不合法：{exc}"},
            )
        except Exception as exc:
            details = integration_error_details(exc)
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "data": details,
                    "error": str(exc),
                    "message": integration_error_message(details, exc),
                },
            )

    return router


def integration_error_details(exc: Exception) -> dict:
    text = str(exc)
    stage = match_error_token(text, "stage") or "dialog"
    url = match_error_token(text, "url")
    account = match_error_token(text, "account")
    message_id = match_error_token(text, "message_id")
    service = {
        "llm": "LLM",
        "tts": "TTS",
        "tool": "工具调用",
        "send": "账号发送",
        "branchwhisper_dialog": "BranchWhisper 主后端",
        "dialog": "微信消息处理",
    }.get(stage, stage)
    return {
        "stage": stage,
        "downstream_service": service,
        "downstream_url": url,
        "account": account,
        "message_id": message_id,
    }


def match_error_token(text: str, key: str) -> str:
    match = re.search(rf"(?:^|\s){re.escape(key)}=([^\s]+)", str(text or ""))
    return match.group(1) if match else ""


def integration_error_message(details: dict, exc: Exception) -> str:
    stage = details.get("stage") or "dialog"
    service = details.get("downstream_service") or stage
    url = details.get("downstream_url") or ""
    target = f"（{url}）" if url else ""
    return f"微信消息处理失败：{service}{target} 阶段异常。{str(exc)[:180]}"
