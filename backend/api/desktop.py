from __future__ import annotations

from fastapi import APIRouter, Request

from api.dependencies import require_local_service_control


DESKTOP_API_VERSION = 2
DESKTOP_FEATURES = [
    "api_providers",
    "bot_profiles",
    "conversations",
    "integrations",
    "stickers",
    "statistics",
    "tools",
    "reminders",
    "proactive",
]
DESKTOP_REQUIRED_ROUTES = [
    "/api/config",
    "/api/config/api-providers",
    "/api/bot-profiles",
    "/api/conversations",
    "/api/integrations",
    "/api/stickers",
    "/api/statistics",
    "/api/desktop/capabilities",
]


def create_desktop_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/desktop/capabilities")
    async def desktop_capabilities(request: Request):
        require_local_service_control(request)
        return {
            "ok": True,
            "product": "BranchWhisper",
            "desktop_api_version": DESKTOP_API_VERSION,
            "features": DESKTOP_FEATURES,
            "required_routes": DESKTOP_REQUIRED_ROUTES,
        }

    return router
