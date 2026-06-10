from __future__ import annotations

from typing import Awaitable, Callable

import asyncio
from fastapi import APIRouter, Body, Request

from api.dependencies import require_local_service_control
from service_runtime.services import check_service, health_url_from
from service_runtime.system_resources import collect_system_resources

AttachWarmups = Callable[[list[dict]], list[dict]]
ScheduleWarmup = Callable[..., Awaitable[None]]
ClearWarmup = Callable[..., None]


def create_services_router(
    attach_service_warmups: AttachWarmups,
    warmup_statuses: Callable[[], dict],
    schedule_service_warmup: ScheduleWarmup,
    schedule_service_warmups: ScheduleWarmup,
    clear_warmup_status: ClearWarmup,
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/health")
    async def health(request: Request):
        settings = request.app.state.settings
        checks = await asyncio.gather(
            check_service("asr", health_url_from(settings.asr_url)),
            check_service("llm", health_url_from(settings.llm_url)),
            check_service("tts", health_url_from(settings.tts_url)),
            return_exceptions=True,
        )
        return {
            "vad": {"ok": True, "device": request.app.state.vad_store.device},
            "services": [item for item in checks if isinstance(item, dict)],
            "warmups": warmup_statuses(),
        }

    @router.get("/api/services")
    async def services(request: Request):
        return {"services": attach_service_warmups(await request.app.state.service_manager.status_all())}

    @router.get("/api/system/resources")
    async def system_resources():
        return collect_system_resources()

    @router.post("/api/services/start-all")
    async def start_all_services(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        overrides = (payload or {}).get("services") or {}
        services = await request.app.state.service_manager.start_all(overrides, allow_config_update=True)
        await schedule_service_warmups(request.app.state.settings)
        return {"services": attach_service_warmups(services)}

    @router.post("/api/services/stop-all")
    async def stop_all_services(request: Request):
        require_local_service_control(request)
        clear_warmup_status()
        return {"services": await request.app.state.service_manager.stop_all()}

    @router.post("/api/services/{service_id}/start")
    async def start_service(service_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        service = await request.app.state.service_manager.start(service_id, payload or {}, allow_config_update=True)
        if service_id in {"asr", "llm"}:
            await schedule_service_warmup(service_id, request.app.state.settings)
        service = attach_service_warmups([service])[0]
        return {"service": service}

    @router.post("/api/services/{service_id}/stop")
    async def stop_service(service_id: str, request: Request):
        require_local_service_control(request)
        clear_warmup_status(service_id)
        service = await request.app.state.service_manager.stop(service_id)
        return {"service": service}

    @router.patch("/api/services/{service_id}")
    async def update_service(service_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        service = request.app.state.service_manager.update_service(service_id, payload or {})
        return {"service": service}

    @router.get("/api/services/{service_id}/logs")
    async def service_logs(service_id: str, request: Request, max_bytes: int = 24000):
        return {"id": service_id, "logs": request.app.state.service_manager.read_logs(service_id, max_bytes=max_bytes)}

    @router.delete("/api/services/logs")
    async def clear_all_service_logs(request: Request):
        require_local_service_control(request)
        return request.app.state.service_manager.clear_logs()

    @router.delete("/api/services/{service_id}/logs")
    async def clear_service_logs(service_id: str, request: Request):
        require_local_service_control(request)
        return request.app.state.service_manager.clear_logs(service_id)

    return router
