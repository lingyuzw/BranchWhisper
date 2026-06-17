from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from engagement.proactive import ProactiveStore


class ProactiveStoreTests(unittest.TestCase):
    def make_store(self) -> tuple[tempfile.TemporaryDirectory, ProactiveStore]:
        tmp = tempfile.TemporaryDirectory()
        root = Path(tmp.name)
        return tmp, ProactiveStore(root / "proactive_config.json", root / "proactive.sqlite3")

    def test_explicit_greeting_window_can_fire_during_global_quiet_hours(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)
        store.save_config(
            {
                "enabled": True,
                "quiet_hours_enabled": True,
                "quiet_start": "23:00",
                "quiet_end": "08:00",
                "channels": {"web": False, "weixin": True},
                "greetings": {
                    "enabled": True,
                    "good_morning": {
                        "enabled": True,
                        "window_start": "07:00",
                        "window_end": "08:00",
                        "with_weather": False,
                        "with_reminders": False,
                        "message": "",
                    },
                },
            }
        )

        created = store.maybe_create_greetings(now=datetime(2026, 6, 17, 7, 30))

        self.assertEqual([item["kind"] for item in created], ["greeting:good_morning"])
        self.assertEqual(created[0]["channel"], "weixin")

    def test_default_greeting_copy_varies_by_day(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)

        first = store.default_greeting_message("good_morning", datetime(2026, 6, 17, 7, 30))
        second = store.default_greeting_message("good_morning", datetime(2026, 6, 18, 7, 30))

        self.assertNotEqual(first, second)

    def test_long_absence_creates_topic_after_threshold(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)
        store.save_config(
            {
                "enabled": True,
                "quiet_hours_enabled": True,
                "quiet_start": "23:00",
                "quiet_end": "08:00",
                "channels": {"web": False, "weixin": True},
                "greetings": {"enabled": True, "long_absence": {"enabled": True, "after_hours": 3}},
            }
        )

        event = store.maybe_create_long_absence(
            last_activity_at="2026-06-17 08:00:00",
            now=datetime(2026, 6, 17, 12, 30),
        )

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event["kind"], "greeting:long_absence")
        self.assertEqual(event["channel"], "weixin")

    def test_long_absence_respects_quiet_hours(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)
        store.save_config(
            {
                "enabled": True,
                "quiet_hours_enabled": True,
                "quiet_start": "23:00",
                "quiet_end": "08:00",
                "greetings": {"enabled": True, "long_absence": {"enabled": True, "after_hours": 3}},
            }
        )

        event = store.maybe_create_long_absence(
            last_activity_at="2026-06-17 18:00:00",
            now=datetime(2026, 6, 17, 23, 30),
        )

        self.assertIsNone(event)


if __name__ == "__main__":
    unittest.main()
