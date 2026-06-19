from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.naturalness_eval import (
    DEFAULT_SAMPLE_PATH,
    evaluate_case,
    evaluate_cases,
    load_cases,
    main,
)


class DialogNaturalnessEvalTests(unittest.TestCase):
    def test_evaluate_case_flags_unprompted_memory_recall(self) -> None:
        result = evaluate_case(
            {
                "id": "ordinary_chat",
                "category": "ordinary_chat",
                "user": "今天有点累，随便聊两句",
                "assistant": "我记得你之前喜欢深夜写代码，所以你现在应该又熬夜了。",
                "forbidden": ["我记得你之前"],
            }
        )

        self.assertFalse(result["passed"])
        self.assertIn("forbidden_phrase", {issue["rule"] for issue in result["issues"]})

    def test_evaluate_case_flags_fabricated_memory_when_no_evidence(self) -> None:
        result = evaluate_case(
            {
                "id": "unknown_yesterday",
                "category": "anti_fabrication",
                "user": "你还记得我昨天吃了什么吗？",
                "assistant": "记得，你昨天吃了火锅。",
                "expect_uncertainty": True,
                "known_memory": "",
            }
        )

        self.assertFalse(result["passed"])
        self.assertIn("missing_uncertainty", {issue["rule"] for issue in result["issues"]})

    def test_evaluate_case_accepts_uncertain_answer_without_memory(self) -> None:
        result = evaluate_case(
            {
                "id": "unknown_yesterday_ok",
                "category": "anti_fabrication",
                "user": "你还记得我昨天吃了什么吗？",
                "assistant": "这个我不知道，当前记录里没有你昨天吃什么。",
                "expect_uncertainty": True,
                "known_memory": "",
            }
        )

        self.assertTrue(result["passed"])
        self.assertEqual([], result["issues"])

    def test_evaluate_cases_summarizes_pass_rate(self) -> None:
        report = evaluate_cases(
            [
                {"id": "ok", "user": "你好", "assistant": "来了，怎么了。"},
                {"id": "bad", "user": "你好", "assistant": "作为一个AI语言模型，我无法拥有真实感受。"},
            ]
        )

        self.assertEqual(2, report["total"])
        self.assertEqual(1, report["passed"])
        self.assertEqual(1, report["failed"])
        self.assertEqual("bad", report["results"][1]["id"])

    def test_default_sample_file_loads_multiple_categories(self) -> None:
        cases = load_cases(DEFAULT_SAMPLE_PATH)
        categories = {case["category"] for case in cases}

        self.assertGreaterEqual(len(cases), 8)
        self.assertIn("ordinary_chat", categories)
        self.assertIn("memory_lookup", categories)
        self.assertIn("anti_fabrication", categories)

    def test_cli_writes_json_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "report.json"

            exit_code = main(["--output", str(output), "--allow-failures"])

            self.assertEqual(0, exit_code)
            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertIn("total", data)
            self.assertIn("results", data)

    def test_repository_script_runs_from_project_root(self) -> None:
        script = BACKEND_ROOT.parent / "scripts" / "evaluate_dialog_naturalness.py"
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "report.json"

            result = subprocess.run(
                [sys.executable, str(script), "--output", str(output), "--allow-failures"],
                cwd=BACKEND_ROOT.parent,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(0, result.returncode, result.stderr)
            self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
