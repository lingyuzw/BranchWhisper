from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import PlainTextResponse


def create_conversations_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/conversations")
    async def conversations(request: Request, query: str = "", archived: str = "active"):
        return {"conversations": request.app.state.conversation_store.list(query=query, archived=archived)}

    @router.post("/api/conversations")
    async def create_conversation(request: Request, payload: dict | None = Body(default=None)):
        conversation = request.app.state.conversation_store.create((payload or {}).get("title"))
        return {"conversation": conversation}

    @router.get("/api/conversations/{conversation_id}")
    async def conversation(conversation_id: str, request: Request):
        loaded = request.app.state.conversation_store.load(conversation_id)
        if not loaded:
            return {"conversation": None}
        return {"conversation": loaded}

    @router.patch("/api/conversations/{conversation_id}")
    async def update_conversation(conversation_id: str, request: Request, payload: dict | None = Body(default=None)):
        updated = request.app.state.conversation_store.update(conversation_id, payload or {})
        if not updated:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"conversation": updated, "conversations": request.app.state.conversation_store.list()}

    @router.get("/api/conversations/{conversation_id}/export.md")
    async def export_conversation_markdown(conversation_id: str, request: Request):
        text = request.app.state.conversation_store.export_markdown(conversation_id)
        if not text:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return PlainTextResponse(
            text,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{conversation_id}.md"'},
        )

    @router.delete("/api/conversations/{conversation_id}")
    async def delete_conversation(conversation_id: str, request: Request):
        deleted = request.app.state.conversation_store.delete(conversation_id)
        if deleted:
            request.app.state.integration_manager.forget_conversation(conversation_id)
        return {"ok": deleted, "conversations": request.app.state.conversation_store.list()}

    return router
