from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from memory.utils import SECONDS_PER_DAY, clamp, days_since, normalize_memory_mode, safe_float


class MemoryUtilsTests(unittest.TestCase):
    def test_days_since_uses_seconds_per_day(self) -> None:
        self.assertEqual(days_since(100.0, now=100.0 + 2 * SECONDS_PER_DAY), 2.0)

    def test_days_since_missing_timestamp_is_large(self) -> None:
        self.assertEqual(days_since(None, now=100.0), 999999.0)

    def test_clamp_bounds_value(self) -> None:
        self.assertEqual(clamp(5, 1, 3), 3)
        self.assertEqual(clamp(-1, 1, 3), 1)
        self.assertEqual(clamp(2, 1, 3), 2)

    def test_safe_float_falls_back_for_invalid_values(self) -> None:
        self.assertEqual(safe_float("2.5"), 2.5)
        self.assertEqual(safe_float("bad", default=0.7), 0.7)

    def test_normalize_memory_mode_accepts_only_known_modes(self) -> None:
        self.assertEqual(normalize_memory_mode("api"), "api")
        self.assertEqual(normalize_memory_mode("other"), "local")


if __name__ == "__main__":
    unittest.main()
