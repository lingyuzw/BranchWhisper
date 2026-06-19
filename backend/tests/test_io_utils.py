from __future__ import annotations

import json
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.config import save_persisted_settings
from core.io_utils import write_json_file
from core.tool_config import ToolProviderConfig
from data.conversations import ConversationStore
from data.profiles import BotProfileStore
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

    def test_persisted_settings_use_shared_json_writer_and_verify_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings_path = Path(tmp) / "settings.json"

            @dataclass
            class Settings:
                name: str
                enabled: bool

            calls = []

            def fake_write(path: Path, data) -> None:
                calls.append((path, data))
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

            with patch("core.config.write_json_file", side_effect=fake_write):
                save_persisted_settings(Settings(name="小枝", enabled=True), settings_path)

            self.assertEqual(settings_path, calls[0][0])
            self.assertEqual({"name": "小枝", "enabled": True}, calls[0][1])
            self.assertEqual({"name": "小枝", "enabled": True}, json.loads(settings_path.read_text(encoding="utf-8")))

    def test_bot_profiles_use_shared_json_writer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            profiles_path = Path(tmp) / "bot_profiles.json"
            calls = []

            def fake_write(path: Path, data) -> None:
                calls.append((path, data))
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

            with patch("data.profiles.write_json_file", side_effect=fake_write):
                store = BotProfileStore(profiles_path, "default system")
                store.create({"name": "小枝"})

            self.assertEqual(profiles_path, calls[0][0])
            self.assertEqual(profiles_path, calls[-1][0])
            self.assertTrue(any(item.get("name") == "小枝" for item in calls[-1][1]["profiles"]))

    def test_tool_provider_config_uses_shared_json_writer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "tool_providers.json"
            calls = []

            def fake_write(path: Path, data) -> None:
                calls.append((path, data))
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

            with patch("core.tool_config.write_json_file", side_effect=fake_write):
                config = ToolProviderConfig(config_path)
                config.update({"weather": {"api_key": "secret-key"}})

            self.assertEqual(config_path, calls[0][0])
            self.assertEqual(config_path, calls[-1][0])
            self.assertEqual("secret-key", calls[-1][1]["weather"]["api_key"])


if __name__ == "__main__":
    unittest.main()
