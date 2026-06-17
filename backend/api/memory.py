from __future__ import annotations

from fastapi import APIRouter, Body, Request

from domain.paths import MEMORY_DB
from tools.runtime_brain import admit_memory_candidate, extract_memory_candidates


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
        options = {key: value for key, value in payload.items() if key != "mode"}
        return request.app.state.memory_store.apply_decay(request.app.state.settings, mode=payload.get("mode"), options=options)

    @router.post("/api/memory/admission-test")
    async def memory_admission_test(request: Request, payload: dict | None = Body(default=None)):
        payload = payload or {}
        text = str(payload.get("text") or "").strip()
        if not text:
            return {"ok": False, "error": "text is required", "candidates": []}
        candidates = extract_memory_candidates(text)
        results = []
        for candidate in candidates:
            admitted, reason = admit_memory_candidate(candidate, text, request.app.state.settings)
            results.append({"candidate": candidate, "admitted": bool(admitted), "reason": reason, "memory": admitted})
        return {"ok": True, "text": text, "count": len(results), "results": results}

    return router
