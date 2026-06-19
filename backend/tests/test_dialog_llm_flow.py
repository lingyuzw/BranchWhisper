from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.llm_flow import build_llm_completion_payload, build_llm_stream_payload


class DialogLlmFlowTests(unittest.TestCase):
    def test_completion_payload_can_enable_thinking(self) -> None:
        messages = [{"role": "user", "content": "你好"}]

        payload = build_llm_completion_payload(
            messages,
            model="qwen",
            temperature=0.2,
            max_tokens=120,
            thinking_enabled=True,
        )

        self.assertEqual("qwen", payload["model"])
        self.assertFalse(payload["stream"])
        self.assertEqual(messages, payload["messages"])
        self.assertTrue(payload["enable_thinking"])

    def test_stream_payload_adds_local_sampling_and_seed(self) -> None:
        messages = [{"role": "user", "content": "讲个故事"}]

        payload = build_llm_stream_payload(
            messages,
            model="local-model",
            temperature=0.7,
            max_tokens=512,
            dialog_mode="local",
            thinking_enabled=True,
            allow_thinking=True,
            seed=123,
        )

        self.assertTrue(payload["stream"])
        self.assertEqual(123, payload["seed"])
        self.assertEqual(1.18, payload["repeat_penalty"])
        self.assertEqual(-1, payload["dry_penalty_last_n"])
        self.assertTrue(payload["enable_thinking"])

    def test_stream_payload_omits_thinking_when_retry_disables_it(self) -> None:
        payload = build_llm_stream_payload(
            [],
            model="api-model",
            temperature=0.7,
            max_tokens=512,
            dialog_mode="api",
            thinking_enabled=True,
            allow_thinking=False,
            seed=123,
        )

        self.assertNotIn("enable_thinking", payload)
        self.assertNotIn("repeat_penalty", payload)
        self.assertNotIn("seed", payload)


if __name__ == "__main__":
    unittest.main()
