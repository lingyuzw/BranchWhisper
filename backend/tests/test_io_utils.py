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


if __name__ == "__main__":
    unittest.main()
