from __future__ import annotations

import re


TOOL_SIGNAL_PATTERN = re.compile(
    r"(当前|现在|几点|几号|星期|最新|实时|热点|新闻|搜索|查一下|网上|天气|价格|汇率|网址|地图|地址|位置|附近|周边|路线|导航|怎么走|距离|在哪|在哪里|属于哪里|属于哪|哪个城市|哪个省|哪个区|哪个县|https?://)",
    flags=re.I,
)


def has_tool_routing_signal(user_text: str, specs: list[dict], *, heuristic_call: dict | None) -> bool:
    if not specs:
        return False
    custom_enabled = any(not spec.get("builtin") for spec in specs)
    return bool(heuristic_call or custom_enabled or TOOL_SIGNAL_PATTERN.search(user_text))
