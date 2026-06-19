from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.config import DEFAULT_SYSTEM


class ConfigDefaultPromptTests(unittest.TestCase):
    def test_default_system_prompt_keeps_persona_lightweight(self) -> None:
        self.assertLessEqual(len(DEFAULT_SYSTEM), 1200)
        for fragment in ("身高", "体重", "二本", "福建人"):
            self.assertNotIn(fragment, DEFAULT_SYSTEM)

    def test_default_system_prompt_sets_factual_boundaries(self) -> None:
        self.assertIn("不知道", DEFAULT_SYSTEM)
        self.assertIn("不确定", DEFAULT_SYSTEM)
        self.assertIn("不要编造当前现实行动、实时位置或真实经历", DEFAULT_SYSTEM)
        self.assertIn("不要主动复述长期记忆", DEFAULT_SYSTEM)


if __name__ == "__main__":
    unittest.main()
