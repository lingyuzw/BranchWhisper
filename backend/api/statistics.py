from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Request

from api.dependencies import require_local_service_control


def create_statistics_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/statistics")
    async def statistics(request: Request):
        require_local_service_control(request)
        slices = {
            "bots": bot_statistics(request.app.state),
            "conversations": conversation_statistics(request.app.state),
            "messages": message_statistics(request.app.state),
            "stickers": sticker_statistics(request.app.state),
            "integrations": integration_statistics(request.app.state),
            "reminders": reminder_statistics(request.app.state),
            "proactive": proactive_statistics(request.app.state),
            "model_usage": {"model_calls": 0, "tokens": 0, "status": "not_tracked", "source": "not_tracked"},
        }
        return {
            "ok": True,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "bots": int(slices["bots"].get("count", 0)),
                "conversations": int(slices["conversations"].get("count", 0)),
                "messages": int(slices["messages"].get("count", 0)),
                "stickers": int(slices["stickers"].get("count", 0)),
                "integrations": int(slices["integrations"].get("count", 0)),
                "bridges": int(slices["integrations"].get("bridges", 0)),
                "reminders": int(slices["reminders"].get("count", 0)),
                "proactive_events": int(slices["proactive"].get("events", 0)),
                "proactive_tasks": int(slices["proactive"].get("tasks", 0)),
                "model_calls": 0,
                "tokens": 0,
            },
            "slices": slices,
        }

    return router


def safe_slice(defaults: dict[str, Any], collect: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    try:
        return {**defaults, **collect(), "status": "ok"}
    except Exception as exc:
        return {**defaults, "status": "unavailable", "error": "unavailable", "error_type": exc.__class__.__name__}


def payload_items(payload: Any, key: str) -> list[Any]:
    if isinstance(payload, dict):
        value = payload.get(key, [])
    else:
        value = payload
    return value if isinstance(value, list) else []


def item_status(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    return str(item.get("status") or item.get("state") or "").strip().lower()


def count_status(items: list[Any], status: str) -> int:
    return sum(1 for item in items if item_status(item) == status)


def bot_statistics(state: Any) -> dict[str, Any]:
    defaults = {"count": 0, "enabled": 0, "source": "bot_profiles.list_profiles"}

    def collect() -> dict[str, Any]:
        profiles = payload_items(state.bot_profiles.list_profiles(), "profiles")
        return {
            "count": len(profiles),
            "enabled": sum(1 for profile in profiles if isinstance(profile, dict) and bool(profile.get("bridge_enabled"))),
        }

    return safe_slice(defaults, collect)


def conversation_statistics(state: Any) -> dict[str, Any]:
    defaults = {"count": 0, "archived": 0, "active": 0, "source": "conversation_store.list"}

    def collect() -> dict[str, Any]:
        conversations = payload_items(state.conversation_store.list(archived=""), "conversations")
        archived = sum(1 for item in conversations if isinstance(item, dict) and bool(item.get("archived")))
        return {"count": len(conversations), "archived": archived, "active": len(conversations) - archived}

    return safe_slice(defaults, collect)


def message_statistics(state: Any) -> dict[str, Any]:
    defaults = {"count": 0, "source": "conversation_store.message_count"}

    def collect() -> dict[str, Any]:
        store = state.conversation_store
        conversations = payload_items(store.list(archived=""), "conversations")
        count = 0
        for conversation in conversations:
            if not isinstance(conversation, dict):
                continue
            if isinstance(conversation.get("message_count"), int):
                count += int(conversation["message_count"])
                continue
            loaded = store.load(str(conversation.get("id") or ""))
            if isinstance(loaded, dict) and isinstance(loaded.get("messages"), list):
                count += len(loaded["messages"])
        return {"count": count}

    return safe_slice(defaults, collect)


def sticker_statistics(state: Any) -> dict[str, Any]:
    defaults = {"count": 0, "enabled": 0, "disabled": 0, "source": "sticker_store.list"}

    def collect() -> dict[str, Any]:
        stickers = payload_items(state.sticker_store.list(), "stickers")
        disabled = sum(1 for item in stickers if isinstance(item, dict) and item.get("enabled") is False)
        return {"count": len(stickers), "enabled": len(stickers) - disabled, "disabled": disabled}

    return safe_slice(defaults, collect)


def integration_statistics(state: Any) -> dict[str, Any]:
    defaults = {"count": 0, "enabled": 0, "bridges": 0, "running": 0, "source": "integration_manager.list_integrations"}

    def collect() -> dict[str, Any]:
        integrations = payload_items(state.integration_manager.list_integrations(), "integrations")
        enabled = sum(1 for item in integrations if isinstance(item, dict) and bool(item.get("enabled")))
        running = sum(1 for item in integrations if item_status(item) == "running")
        return {"count": len(integrations), "enabled": enabled, "bridges": enabled, "running": running}

    return safe_slice(defaults, collect)


def reminder_statistics(state: Any) -> dict[str, Any]:
    defaults = {"count": 0, "pending": 0, "done": 0, "failed": 0, "source": "reminder_store.list"}

    def collect() -> dict[str, Any]:
        reminders = payload_items(state.reminder_store.list(), "reminders")
        return {
            "count": len(reminders),
            "pending": count_status(reminders, "pending"),
            "done": count_status(reminders, "done"),
            "failed": count_status(reminders, "failed"),
        }

    return safe_slice(defaults, collect)


def proactive_statistics(state: Any) -> dict[str, Any]:
    defaults = {"events": 0, "tasks": 0, "pending": 0, "done": 0, "failed": 0, "source": "proactive_store.event_counts"}

    def collect() -> dict[str, Any]:
        store = state.proactive_store
        if hasattr(store, "event_counts"):
            counts = store.event_counts()
            return {
                "events": int(counts.get("events", 0)),
                "tasks": int(counts.get("tasks", 0)),
                "pending": int(counts.get("pending", 0)),
                "done": int(counts.get("done", 0)),
                "failed": int(counts.get("failed", 0)),
            }
        payload = store.list_events()
        events = payload_items(payload, "events")
        tasks = payload_items(payload, "tasks")
        if not tasks:
            tasks = events
        return {
            "events": len(events),
            "tasks": len(tasks),
            "pending": count_status(tasks, "pending"),
            "done": count_status(tasks, "done"),
            "failed": count_status(tasks, "failed"),
            "source": "proactive_store.list_events",
        }

    return safe_slice(defaults, collect)
