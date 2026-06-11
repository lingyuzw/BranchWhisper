from __future__ import annotations

import os

from fastapi import HTTPException, Request

LOCALHOST_NAMES = {"127.0.0.1", "::1", "localhost"}


def is_local_request(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in LOCALHOST_NAMES


def require_local_service_control(request: Request) -> None:
    if (
        is_local_request(request)
        or os.environ.get("BRANCHWHISPER_ALLOW_REMOTE_SERVICE_CONTROL") == "1"
        or os.environ.get("BUDING_ALLOW_REMOTE_SERVICE_CONTROL") == "1"
    ):
        return
    raise HTTPException(
        status_code=403,
        detail=(
            "Service control is restricted to localhost. "
            "Set BRANCHWHISPER_ALLOW_REMOTE_SERVICE_CONTROL=1 to override."
        ),
    )


def require_integration_dialog_access(request: Request) -> None:
    if is_local_request(request) or os.environ.get("BRANCHWHISPER_ALLOW_REMOTE_INTEGRATION_DIALOG") == "1":
        return
    raise HTTPException(
        status_code=403,
        detail=(
            "Integration dialog is restricted to localhost. "
            "Set BRANCHWHISPER_ALLOW_REMOTE_INTEGRATION_DIALOG=1 to allow remote bridge calls."
        ),
    )


def local_branchwhisper_url(request: Request) -> str:
    override = (
        os.environ.get("BRANCHWHISPER_BRIDGE_URL")
        or os.environ.get("BUDING_BRIDGE_URL")
        or os.environ.get("BRANCHWHISPER_PUBLIC_URL")
        or os.environ.get("BUDING_PUBLIC_URL")
    )
    if override:
        return override.rstrip("/")
    app_port = getattr(request.app.state, "server_port", None)
    if app_port:
        return f"http://127.0.0.1:{int(app_port)}"
    server = request.scope.get("server") or ("", 7860)
    port = server[1] if isinstance(server, (tuple, list)) and len(server) > 1 else request.url.port
    return f"http://127.0.0.1:{int(port or 7860)}"


def unique_urls(urls: list[str]) -> list[str]:
    seen = set()
    result = []
    for url in urls:
        normalized = str(url or "").rstrip("/")
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result
