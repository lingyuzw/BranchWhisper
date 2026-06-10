from __future__ import annotations

import time

from fastapi import APIRouter, Body, HTTPException, Request

from api.dependencies import require_local_service_control
from tools.direct_answers import direct_answer_from_tool


def create_tools_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/tools")
    async def tools_config(request: Request):
        return request.app.state.tool_manager.get_config()

    @router.patch("/api/tools")
    async def update_tools_config(request: Request, payload: dict | None = Body(default=None)):
        return request.app.state.tool_manager.update_config(payload or {})

    @router.post("/api/tools/test")
    async def test_tool(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        payload = payload or {}
        tool_id = str(payload.get("tool") or payload.get("id") or "")
        arguments = payload.get("arguments") if isinstance(payload.get("arguments"), dict) else {}
        if not tool_id:
            raise HTTPException(status_code=400, detail="tool is required")
        started = time.perf_counter()
        result = await request.app.state.tool_manager.execute(
            tool_id,
            arguments,
            timeout=request.app.state.settings.tools_timeout,
            max_chars=request.app.state.settings.tools_max_result_chars,
        )
        return {"id": tool_id, "arguments": arguments, "elapsed_ms": int((time.perf_counter() - started) * 1000), "result": result}

    @router.post("/api/tools/resolve")
    async def resolve_tool(request: Request, payload: dict | None = Body(default=None)):
        require_local_service_control(request)
        text = str((payload or {}).get("text") or "")
        call = request.app.state.tool_manager.suggest_from_text(text)
        result = None
        if call:
            tool_id = str(call.get("id") or "")
            arguments = call.get("arguments") if isinstance(call.get("arguments"), dict) else {}
            try:
                result = await request.app.state.tool_manager.execute(
                    tool_id,
                    arguments,
                    timeout=request.app.state.settings.tools_timeout,
                    max_chars=request.app.state.settings.tools_max_result_chars,
                )
            except Exception as exc:
                result = {"ok": False, "tool": tool_id, "error": str(exc)}
        return {"tool_call": call, "result": result, "direct_answer": direct_answer_from_tool({"tool": call.get("id"), "result": result} if call else None)}

    return router
