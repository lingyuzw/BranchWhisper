from __future__ import annotations

from fastapi import APIRouter, Body, Request

from domain.paths import MEMORY_DB


def create_memory_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/memory")
    async def memory_items(request: Request, limit: int = 200, query: str = "", layer: str = "", mode: str = ""):
        return {
            "items": request.app.state.memory_store.list_memories(request.app.state.settings, limit=limit, query=query, layer=layer, mode=mode),
            "db_path": str(MEMORY_DB),
            "mode": mode or getattr(request.app.state.settings, "dialog_mode", "local"),
        }

    @router.post("/api/memory")
    async def create_memory_item(request: Request, payload: dict | None = Body(default=None)):
        payload = payload or {}
        item = request.app.state.memory_store.create_memory(payload, mode=payload.get("mode") or getattr(request.app.state.settings, "dialog_mode", "local"))
        return {"item": item}

    @router.patch("/api/memory/{memory_id}")
    async def update_memory_item(memory_id: str, request: Request, payload: dict | None = Body(default=None)):
        item = request.app.state.memory_store.update_memory(memory_id, payload or {})
        return {"item": item}

    @router.delete("/api/memory/{memory_id}")
    async def delete_memory_item(memory_id: str, request: Request):
        return {"ok": request.app.state.memory_store.delete_memory(memory_id)}

    @router.post("/api/memory/decay")
    async def decay_memory(request: Request, payload: dict | None = Body(default=None)):
        payload = payload or {}
        return request.app.state.memory_store.apply_decay(request.app.state.settings, mode=payload.get("mode"))

    return router
