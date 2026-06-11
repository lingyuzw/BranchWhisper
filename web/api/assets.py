from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Request

from api.dependencies import require_local_service_control
from media.assets import normalize_channel


def create_assets_router() -> APIRouter:
    router = APIRouter()

    @router.post("/api/assets/avatar")
    async def upload_avatar(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            return {"asset": request.app.state.avatar_store.save_data_url(str((payload or {}).get("data_url") or ""))}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/api/assets/chat-image")
    async def upload_chat_image(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            asset = request.app.state.chat_image_store.save_data_url(
                str((payload or {}).get("data_url") or ""),
                max_mb=float(getattr(request.app.state.settings, "vision_max_image_mb", 8.0)),
            )
            return {"asset": asset}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/api/stickers")
    async def stickers(request: Request):
        require_local_service_control(request)
        return {"stickers": request.app.state.sticker_store.list()}

    @router.post("/api/stickers")
    async def upload_sticker(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = payload or {}
        try:
            sticker = request.app.state.sticker_store.add_data_url(
                str(payload.get("data_url") or ""),
                tag=str(payload.get("tag") or "默认"),
                name=str(payload.get("name") or ""),
                channels=payload.get("channels") or payload.get("channel") or "all",
            )
            return {"sticker": sticker, "stickers": request.app.state.sticker_store.list()}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/api/stickers/test")
    async def test_sticker(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = payload or {}
        channel = normalize_channel(str(payload.get("channel") or "web"))
        user_text = str(payload.get("text") or payload.get("user_text") or "").strip()
        reply_text = str(payload.get("reply_text") or "").strip()
        if not user_text and not reply_text:
            raise HTTPException(status_code=400, detail="text is required")
        intent = request.app.state.sticker_policy.simulate(
            request.app.state.settings,
            session_id=f"sticker_test:{channel}",
            user_text=user_text,
            reply_text=reply_text,
            source=channel,
        )
        sticker = None
        if intent.get("send"):
            sticker = request.app.state.sticker_store.choose(
                str(intent.get("tag") or ""),
                avoid_id=str(intent.get("avoid_id") or ""),
                channel=channel,
            )
            if not sticker:
                intent = {**intent, "send": False, "reason": "no_channel_sticker"}
        return {
            "ok": True,
            "channel": channel,
            "intent": intent,
            "sticker": sticker,
            "stickers_count": len(request.app.state.sticker_store.list()),
        }

    @router.delete("/api/stickers/{sticker_id}")
    async def delete_sticker(sticker_id: str, request: Request):
        require_local_service_control(request)
        return {"ok": request.app.state.sticker_store.delete(sticker_id), "stickers": request.app.state.sticker_store.list()}

    return router
