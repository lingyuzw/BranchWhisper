from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.tool_flow import build_tool_planner_messages, has_tool_routing_signal


class DialogToolFlowTests(unittest.TestCase):
    def test_tool_signal_requires_available_specs(self) -> None:
        self.assertFalse(has_tool_routing_signal("查一下今天上海天气", [], heuristic_call=None))

    def test_tool_signal_accepts_heuristic_call(self) -> None:
        self.assertTrue(
            has_tool_routing_signal(
                "今天怎么样",
                [{"id": "weather", "builtin": True}],
                heuristic_call={"id": "weather", "arguments": {}},
            )
        )

    def test_tool_signal_accepts_custom_tool_even_without_keyword(self) -> None:
        self.assertTrue(has_tool_routing_signal("帮我处理一下", [{"id": "crm", "builtin": False}], heuristic_call=None))

    def test_tool_signal_matches_realtime_keywords_and_urls(self) -> None:
        specs = [{"id": "search", "builtin": True}]

        self.assertTrue(has_tool_routing_signal("查一下最新新闻", specs, heuristic_call=None))
        self.assertTrue(has_tool_routing_signal("这个网址 https://example.com 讲了什么", specs, heuristic_call=None))

    def test_tool_signal_ignores_plain_chat_with_builtin_tools_only(self) -> None:
        self.assertFalse(has_tool_routing_signal("我今天有点累", [{"id": "search", "builtin": True}], heuristic_call=None))

    def test_build_tool_planner_messages_includes_available_tools_and_user_text(self) -> None:
        messages = build_tool_planner_messages("今天上海天气如何", "weather: 查询天气")

        self.assertEqual("system", messages[0]["role"])
        self.assertIn("工具路由器", messages[0]["content"])
        self.assertIn("weather: 查询天气", messages[0]["content"])
        self.assertEqual({"role": "user", "content": "今天上海天气如何"}, messages[1])


if __name__ == "__main__":
    unittest.main()
