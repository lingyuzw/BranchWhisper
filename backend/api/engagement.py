from __future__ import annotations

import time
from typing import Awaitable, Callable

from fastapi import APIRouter, Body, FastAPI, HTTPException, Request

from api.dependencies import require_local_service_control

DeliverProactiveText = Callable[..., Awaitable[dict]]


def create_engagement_router(deliver_proactive_text: DeliverProactiveText) -> APIRouter:
    router = APIRouter()

    @router.get("/api/reminders")
    async def reminders(request: Request, status: str = ""):
        require_local_service_control(request)
        return {"reminders": request.app.state.reminder_store.list(status=status)}

    @router.post("/api/reminders")
    async def create_reminder(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            reminder = request.app.state.reminder_store.create(payload or {})
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"reminder": reminder, "reminders": request.app.state.reminder_store.list()}

    @router.patch("/api/reminders/{reminder_id}")
    async def update_reminder(reminder_id: str, request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        try:
            reminder = request.app.state.reminder_store.update(reminder_id, payload or {})
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Reminder not found") from exc
        return {"reminder": reminder, "reminders": request.app.state.reminder_store.list()}

    @router.delete("/api/reminders/{reminder_id}")
    async def delete_reminder(reminder_id: str, request: Request):
        require_local_service_control(request)
        return {"ok": request.app.state.reminder_store.delete(reminder_id), "reminders": request.app.state.reminder_store.list()}

    @router.get("/api/proactive/config")
    async def proactive_config(request: Request):
        require_local_service_control(request)
        return {"config": request.app.state.proactive_store.public_config()}

    @router.patch("/api/proactive/config")
    async def update_proactive_config(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        return {"config": request.app.state.proactive_store.update_config(payload or {})}

    @router.get("/api/proactive/events")
    async def proactive_events(request: Request, status: str = "", limit: int = 80):
        require_local_service_control(request)
        return {"events": request.app.state.proactive_store.list_events(status=status, limit=limit)}

    @router.post("/api/proactive/test")
    async def proactive_test(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = payload or {}
        config = request.app.state.proactive_store.load_config()
        channel = str(payload.get("channel") or request.app.state.proactive_store.default_channel(config) or "web")
        event = request.app.state.proactive_store.create_event(
            {
                "kind": "test",
                "title": payload.get("title") or "主动消息测试",
                "content": payload.get("content") or "这是一条主动消息测试。保存后会出现在对话列表里。",
                "channel": channel,
                "status": "pending",
            }
        )
        result = await deliver_proactive_text(
            request.app,
            title=event["title"],
            content=event["content"],
            channel=event["channel"],
            source="proactive_test",
        )
        request.app.state.proactive_store.update_event(
            event["id"],
            {
                "status": "done" if result.get("ok") else "failed",
                "fired_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "conversation_id": result.get("conversation_id", ""),
                "last_error": result.get("error", ""),
            },
        )
        return {
            "event": request.app.state.proactive_store.get_event(event["id"]) or event,
            "result": result,
            "events": request.app.state.proactive_store.list_events(),
        }

    @router.post("/api/proactive/events/{event_id}/dismiss")
    async def dismiss_proactive_event(event_id: str, request: Request):
        require_local_service_control(request)
        return {"ok": request.app.state.proactive_store.dismiss_event(event_id), "events": request.app.state.proactive_store.list_events()}

    return router
