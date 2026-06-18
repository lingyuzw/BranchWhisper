from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.text_helpers import attachment_text, build_request_user_text, extract_repeat_text, last_assistant_content


class DialogTextHelpersTests(unittest.TestCase):
    def test_attachment_text_formats_images_and_stickers(self) -> None:
        text = attachment_text(
            [
                {"type": "image", "summary": "一只杯子"},
                {"type": "sticker", "tag": "开心"},
            ]
        )

        self.assertEqual(text, "[图片] 一只杯子 [表情包:开心]")

    def test_story_request_adds_turn_local_constraints(self) -> None:
        text = build_request_user_text("讲个睡前故事")

        self.assertIn("Task: The user is asking for a bedtime/story.", text)
        self.assertIn("100 to 180 Chinese characters", text)

    def test_context_recall_includes_previous_assistant_reply(self) -> None:
        text = build_request_user_text("你刚才说了什么", previous_assistant="上一句回复")

        self.assertIn("your immediately previous assistant reply was: 上一句回复", text)

    def test_extract_repeat_text_removes_prefix_and_punctuation(self) -> None:
        self.assertEqual(extract_repeat_text("跟我说：你好呀"), "你好呀")

    def test_last_assistant_content_returns_latest_assistant_text(self) -> None:
        self.assertEqual(
            last_assistant_content(
                [
                    {"role": "assistant", "content": "旧回复"},
                    {"role": "user", "content": "问题"},
                    {"role": "assistant", "content": "新回复"},
                ]
            ),
            "新回复",
        )


if __name__ == "__main__":
    unittest.main()
