from __future__ import annotations

import unittest
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.message_flow import compose_user_request_text, memory_observation_text


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


if __name__ == "__main__":
    unittest.main()
