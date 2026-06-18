from __future__ import annotations

from typing import Any


BUSINESS_RESPONSE_KEYS = ("ret", "errcode", "error_code", "errmsg", "err_msg", "message", "msg")


def weixin_business_error(data: object, stage: str) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    for key in ("ret", "errcode", "error_code"):
        if key not in data:
            continue
        try:
            value = int(data.get(key))
        except (TypeError, ValueError):
            continue
        if value == 0:
            continue
        message = str(data.get("errmsg") or data.get("err_msg") or data.get("message") or data.get("msg") or "")
        hint = ""
        if value == -2:
            hint = "iLink 业务层拒绝发送；请先让微信端给 BranchWhisper 发一条新消息刷新会话 context_token，若文本仍 ret=-2 则重新登录微信集成。"
        error = f"{stage} returned {key}={data.get(key)}"
        if message:
            error += f": {message}"
        if hint:
            error += f". {hint}"
        return {
            "ok": False,
            "error": error,
            "stage": stage,
            "business_response": {k: data[k] for k in BUSINESS_RESPONSE_KEYS if k in data},
        }
    return None
