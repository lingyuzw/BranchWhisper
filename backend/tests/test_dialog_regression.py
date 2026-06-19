from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.config import DEFAULT_SYSTEM
from dialog.message_flow import build_contextual_request_messages, build_llm_messages
from tests.test_service_runtime import default_settings
from tools.runtime_brain import MemoryStore


class DialogRegressionTests(unittest.TestCase):
    def test_ordinary_chat_does_not_receive_long_term_memory_context(self) -> None:
        settings = default_settings()
        settings.dialog_mode = "api"
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.sqlite3")
            store.upsert_memory(
                {
                    "key": "用户偏好",
                    "value": "用户喜欢深夜写代码",
                    "layer": "long",
                    "confidence": 0.9,
                    "importance": 0.9,
                    "memory_type": "semantic_fact",
                },
                source="chat",
                mode="api",
            )

            memory_context = store.format_context(settings, "今天有点累，陪我说两句", mode="api")

        messages = build_contextual_request_messages(
            [{"role": "system", "content": DEFAULT_SYSTEM}],
            "今天有点累，陪我说两句",
            "今天有点累，陪我说两句",
            memory_context=memory_context,
            now_text="2026年06月19日 Friday 15:00",
        )

        self.assertNotIn("用户喜欢深夜写代码", messages[0]["content"])

    def test_explicit_memory_question_receives_quiet_reference_context(self) -> None:
        settings = default_settings()
        settings.dialog_mode = "api"
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.sqlite3")
            store.upsert_memory(
                {
                    "key": "用户偏好",
                    "value": "用户喜欢深夜写代码",
                    "layer": "long",
                    "confidence": 0.9,
                    "importance": 0.9,
                    "memory_type": "semantic_fact",
                },
                source="chat",
                mode="api",
            )

            memory_context = store.format_context(settings, "你记得我的偏好吗？", mode="api")

        self.assertIn("内部参考", memory_context)
        self.assertIn("用户喜欢深夜写代码", memory_context)
        self.assertIn("不要主动复述", memory_context)

    def test_default_prompt_preserves_factual_boundaries_in_llm_messages(self) -> None:
        messages = build_llm_messages({"messages": []}, system_prompt=DEFAULT_SYSTEM)

        system = messages[0]["content"]
        self.assertIn("不知道", system)
        self.assertIn("不确定", system)
        self.assertIn("不要编造当前现实行动、实时位置或真实经历", system)
        self.assertNotIn("身高", system)
        self.assertNotIn("体重", system)


if __name__ == "__main__":
    unittest.main()
