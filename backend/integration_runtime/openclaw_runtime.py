from __future__ import annotations


def gateway_disabled_hint(result: dict) -> str:
    text = f"{result.get('stdout') or ''}\n{result.get('stderr') or ''}"
    lowered = text.lower()
    if "gateway service disabled" in lowered or "systemd user services are unavailable" in lowered:
        return (
            "OpenClaw gateway systemd 服务不可用。容器环境下这是常见情况，"
            "请使用“启动桥接”运行 BranchWhisper 的前台桥接进程。"
        )
    return ""
