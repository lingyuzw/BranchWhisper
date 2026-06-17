from __future__ import annotations

import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from tools.runtime_brain import MemoryStore, SECONDS_PER_DAY


def memory_settings() -> SimpleNamespace:
    return SimpleNamespace(
        dialog_mode="local",
        memory_short_delete_days=180,
        memory_mid_downgrade_days=180,
        memory_long_downgrade_days=365,
        memory_short_to_mid_days=60,
        memory_short_to_mid_count=3,
        memory_mid_to_long_days=180,
        memory_mid_to_long_count=5,
    )


class MemoryDecayTests(unittest.TestCase):
    def test_decay_accepts_one_off_cleanup_thresholds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(Path(tmp) / "memory.db")
            item = store.create_memory({"value": "我喜欢夜里写代码", "layer": "short"}, mode="local")
            old_seen_at = time.time() - 10 * SECONDS_PER_DAY
            with store.session() as conn:
                conn.execute(
                    "UPDATE memory_items SET last_seen_at = ?, last_changed_at = ? WHERE id = ?",
                    (old_seen_at, old_seen_at, item["id"]),
                )

            result = store.apply_decay(memory_settings(), mode="local", options={"short_delete_days": 1})

            self.assertEqual(result["deleted"], 1)
            self.assertIsNone(store.get_memory(item["id"]))


if __name__ == "__main__":
    unittest.main()
