from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from engagement.proactive import ProactiveStore, build_good_morning_greeting


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

    def test_greeting_does_not_claim_weather_or_reminders_without_data(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)
        store.save_config(
            {
                "enabled": True,
                "quiet_hours_enabled": False,
                "greetings": {
                    "enabled": True,
                    "good_morning": {
                        "enabled": True,
                        "window_start": "07:00",
                        "window_end": "09:30",
                        "with_weather": True,
                        "with_reminders": True,
                        "message": "早啊，还困吗？",
                    },
                },
            }
        )

        created = store.maybe_create_greetings(now=datetime(2026, 6, 17, 7, 30))

        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["content"], "早啊，还困吗？")
        self.assertNotIn("天气", created[0]["content"])
        self.assertNotIn("提醒", created[0]["content"])

    def test_good_morning_weather_greeting_uses_only_provided_weather_data(self) -> None:
        message = build_good_morning_greeting(
            {
                "city": "漳州",
                "weather": "阵雨",
                "min_temp": 24,
                "max_temp": 32,
                "rain_probability": 70,
                "uv_index": 7,
                "aqi_desc": "轻度污染",
            }
        )

        self.assertTrue(message.startswith(("早安", "早，", "早啊")))
        self.assertIn("漳州", message)
        self.assertIn("阵雨", message)
        self.assertIn("24～32℃", message)
        self.assertIn("伞", message)
        self.assertIn("防晒", message)
        self.assertIn("水", message)
        self.assertIn("口罩", message)
        self.assertNotIn("加油", message)
        self.assertNotIn("愿你", message)
        self.assertLessEqual(message.count("记得"), 1)
        self.assertGreaterEqual(len(message), 20)
        self.assertLessEqual(len(message), 120)

    def test_good_morning_weather_greeting_does_not_fabricate_missing_values(self) -> None:
        message = build_good_morning_greeting({"city": "漳州", "weather": "多云"})

        self.assertIn("漳州", message)
        self.assertIn("多云", message)
        self.assertNotIn("℃", message)
        self.assertNotIn("～", message)
        self.assertNotIn("%", message)

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

    def test_delete_event_removes_recent_history_item(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)
        first = store.create_event({"title": "微信事件 A", "content": "a", "channel": "weixin"})
        second = store.create_event({"title": "微信事件 B", "content": "b", "channel": "weixin"})

        self.assertTrue(store.delete_event(first["id"]))
        self.assertFalse(store.delete_event("missing"))

        ids = [item["id"] for item in store.list_events()]
        self.assertNotIn(first["id"], ids)
        self.assertIn(second["id"], ids)

    def test_event_counts_include_all_events_beyond_recent_list_limit(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)
        for index in range(90):
            status = "done" if index < 45 else "pending"
            store.create_event({"title": f"事件 {index}", "content": "x", "status": status})

        counts = store.event_counts()

        self.assertEqual(counts["events"], 90)
        self.assertEqual(counts["tasks"], 90)
        self.assertEqual(counts["done"], 45)
        self.assertEqual(counts["pending"], 45)
        self.assertEqual(counts["failed"], 0)
        self.assertEqual(len(store.list_events()), 80)

    def test_save_config_uses_shared_json_writer(self) -> None:
        tmp, store = self.make_store()
        self.addCleanup(tmp.cleanup)
        calls = []

        def fake_write(path: Path, data) -> None:
            calls.append((path, data))
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

        with patch("engagement.proactive.write_json_file", side_effect=fake_write):
            saved = store.save_config({"enabled": True, "channels": {"weixin": True}})

        self.assertEqual(store.config_path, calls[0][0])
        self.assertTrue(calls[0][1]["enabled"])
        self.assertTrue(calls[0][1]["channels"]["weixin"])
        self.assertEqual(saved, calls[0][1])


if __name__ == "__main__":
    unittest.main()
