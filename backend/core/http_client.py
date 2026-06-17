from __future__ import annotations

import asyncio
from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx


LOCAL_HOST_NAMES = {"localhost"}


def is_local_url(url: str) -> bool:
    """Return true for loopback/LAN URLs that must not be sent to a proxy."""
    host = urlsplit(str(url or "")).hostname or ""
    if not host:
        return False
    if host.lower() in LOCAL_HOST_NAMES:
        return True
    try:
        ip = ip_address(host)
    except ValueError:
        return host.lower().endswith(".local")
    return ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_unspecified


def trust_env_for_url(url: str) -> bool:
    return not is_local_url(url)


def httpx_client_for_url(url: str, **kwargs) -> httpx.AsyncClient:
    kwargs.setdefault("trust_env", trust_env_for_url(url))
    return httpx.AsyncClient(**kwargs)


async def request_with_retries(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    attempts: int = 2,
    delay: float = 0.35,
    **kwargs,
) -> httpx.Response:
    """Retry short-lived connection failures from remote API providers."""
    attempts = max(1, int(attempts or 1))
    last_error: httpx.HTTPError | None = None
    for index in range(attempts):
        try:
            request = getattr(client, "request", None)
            if request is not None:
                return await request(method, url, **kwargs)
            method_func = getattr(client, method.lower())
            return await method_func(url, **kwargs)
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadError) as exc:
            last_error = exc
            if index >= attempts - 1:
                raise
            if delay > 0:
                await asyncio.sleep(delay)
    if last_error:
        raise last_error
    raise RuntimeError("request retry loop ended unexpectedly")
