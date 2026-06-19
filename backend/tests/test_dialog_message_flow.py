from __future__ import annotations

import unittest
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.message_flow import build_llm_messages, compose_user_request_text, draft_conversation, memory_observation_text


class DialogMessageFlowTests(unittest.TestCase):
    def test_compose_user_request_text_includes_image_summaries(self) -> None:
        text = compose_user_request_text(
            "看看",
            [
                {"type": "image", "summary": "桌上有一杯咖啡"},
                {"type": "file", "summary": "ignored"},
                {"type": "image"},
            ],
        )

        self.assertIn("看看", text)
        self.assertIn("图片1摘要：桌上有一杯咖啡", text)
        self.assertIn("图片3摘要：未生成摘要", text)
        self.assertIn("不要假装看到了摘要以外的细节", text)

    def test_memory_observation_text_respects_vision_memory_flag(self) -> None:
        attachments = [{"type": "image", "summary": "用户养了一盆薄荷"}]

        disabled = memory_observation_text("我在浇水", attachments, vision_memory_extract_enabled=False)
        enabled = memory_observation_text("我在浇水", attachments, vision_memory_extract_enabled=True)

        self.assertEqual("我在浇水", disabled)
        self.assertIn("图片摘要", enabled)
        self.assertIn("用户养了一盆薄荷", enabled)

    def test_build_llm_messages_includes_attachment_notes(self) -> None:
        conversation = {
            "messages": [
                {"role": "user", "content": "看看", "attachments": [{"type": "image", "summary": "一只杯子"}]},
                {"role": "assistant", "content": "", "attachments": [{"type": "sticker", "name": "点头"}]},
                {"role": "tool", "content": "ignored"},
            ]
        }

        messages = build_llm_messages(conversation, system_prompt="system")

        self.assertEqual("system", messages[0]["content"])
        self.assertEqual("user", messages[1]["role"])
        self.assertIn("看看", messages[1]["content"])
        self.assertIn("[图片]", messages[1]["content"])
        self.assertEqual("assistant", messages[2]["role"])
        self.assertIn("点头", messages[2]["content"])
        self.assertEqual(3, len(messages))

    def test_draft_conversation_creates_unsaved_chat_shape(self) -> None:
        draft = draft_conversation(now_text="2026-06-19 09:10:00")

        self.assertEqual("", draft["id"])
        self.assertTrue(draft["draft"])
        self.assertEqual("新的对话", draft["title"])
        self.assertEqual([], draft["messages"])
        self.assertEqual("2026-06-19 09:10:00", draft["created_at"])


if __name__ == "__main__":
    unittest.main()
