from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.io_utils import write_json_file
from data.conversations import ConversationStore
from service_runtime.profiles import write_profile_services


class JsonIoUtilsTests(unittest.TestCase):
    def test_write_json_file_preserves_existing_file_when_replace_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            path.write_text('{"ok": true}', encoding="utf-8")

            with patch("pathlib.Path.replace", side_effect=OSError("replace failed")):
                with self.assertRaises(OSError):
                    write_json_file(path, {"ok": False})

            self.assertEqual({"ok": True}, json.loads(path.read_text(encoding="utf-8")))

    def test_write_json_file_writes_readable_utf8_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nested" / "settings.json"

            write_json_file(path, {"name": "小枝"})

            self.assertEqual({"name": "小枝"}, json.loads(path.read_text(encoding="utf-8")))

    def test_conversation_store_uses_shared_json_writer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            calls = []

            def fake_write(path: Path, data) -> None:
                calls.append((path.name, data))
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

            with patch("data.conversations.write_json_file", side_effect=fake_write):
                store = ConversationStore(Path(tmp))
                store.create("你好")

            self.assertIn("index.json", [name for name, _data in calls])
            self.assertTrue(any(name.endswith(".json") and name != "index.json" for name, _data in calls))

    def test_service_profiles_use_shared_json_writer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "service_profiles.json"
            calls = []

            def fake_write(path: Path, data) -> None:
                calls.append((path, data))
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

            with patch("service_runtime.profiles.write_json_file", side_effect=fake_write):
                write_profile_services(config_path, {"llm": {"command": "llama-server"}}, schema_version=2)

            self.assertEqual(config_path, calls[0][0])
            self.assertEqual({"schema_version": 2, "services": {"llm": {"command": "llama-server"}}}, calls[0][1])


if __name__ == "__main__":
    unittest.main()
