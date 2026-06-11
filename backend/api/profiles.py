from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Request

from api.dependencies import require_local_service_control


def create_profiles_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/bot-profiles")
    async def bot_profiles(request: Request):
        require_local_service_control(request)
        return request.app.state.bot_profiles.list_profiles()

    @router.post("/api/bot-profiles")
    async def create_bot_profile(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            profile = request.app.state.bot_profiles.create(payload or {})
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"profile": profile, **request.app.state.bot_profiles.list_profiles()}

    @router.patch("/api/bot-profiles/{profile_id}")
    async def update_bot_profile(profile_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            profile = request.app.state.bot_profiles.update(profile_id, payload or {})
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Profile not found") from exc
        return {"profile": profile, **request.app.state.bot_profiles.list_profiles()}

    @router.delete("/api/bot-profiles/{profile_id}")
    async def delete_bot_profile(profile_id: str, request: Request):
        require_local_service_control(request)
        return {"ok": request.app.state.bot_profiles.delete(profile_id), **request.app.state.bot_profiles.list_profiles()}

    return router
