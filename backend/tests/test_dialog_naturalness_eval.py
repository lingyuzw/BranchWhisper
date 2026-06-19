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
    build_case_messages,
    evaluate_case,
    evaluate_cases,
    format_text_report,
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

    def test_ordinary_chat_flags_revealing_seeded_memory_even_without_fixed_phrase(self) -> None:
        result = evaluate_case(
            {
                "id": "ordinary_seed_leak",
                "category": "ordinary_chat",
                "user": "今天有点累，随便聊两句",
                "seed_memories": [{"key": "用户偏好", "value": "用户喜欢深夜写代码"}],
                "assistant": "深夜写代码本来就容易累，你先歇会儿。",
            }
        )

        self.assertFalse(result["passed"])
        self.assertIn("unprompted_memory_detail", {issue["rule"] for issue in result["issues"]})

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

    def test_evaluate_case_flags_explanatory_customer_service_tone(self) -> None:
        result = evaluate_case(
            {
                "id": "service_tone",
                "category": "ordinary_chat",
                "user": "我有点累",
                "assistant": "首先，我理解你的感受。其次，你需要注意休息。最后，保持积极心态。",
            }
        )

        self.assertFalse(result["passed"])
        self.assertIn("scripted_explanation_tone", {issue["rule"] for issue in result["issues"]})

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

    def test_evaluate_cases_treats_expected_failures_as_passing_the_suite(self) -> None:
        report = evaluate_cases(
            [
                {
                    "id": "expected_bad",
                    "category": "ordinary_chat",
                    "user": "今天有点累，随便聊两句",
                    "seed_memories": [{"key": "用户偏好", "value": "用户喜欢深夜写代码"}],
                    "assistant": "深夜写代码本来就容易累，你先歇会儿。",
                    "expect_fail": True,
                }
            ]
        )

        self.assertEqual(1, report["passed"])
        self.assertEqual(0, report["failed"])
        self.assertTrue(report["results"][0]["expected_failure"])

    def test_evaluate_cases_summarizes_categories_and_rules(self) -> None:
        report = evaluate_cases(
            [
                {"id": "ok", "category": "ordinary_chat", "user": "你好", "assistant": "来了。"},
                {
                    "id": "bad",
                    "category": "ordinary_chat",
                    "user": "你好",
                    "assistant": "作为一个AI语言模型，我无法拥有真实感受。",
                },
            ]
        )

        self.assertEqual(2, report["summary"]["categories"]["ordinary_chat"]["total"])
        self.assertEqual(1, report["summary"]["categories"]["ordinary_chat"]["failed"])
        self.assertGreaterEqual(report["summary"]["rules"]["ai_cliche"], 1)

    def test_format_text_report_includes_summary_and_issue_samples(self) -> None:
        report = evaluate_cases(
            [
                {
                    "id": "bad",
                    "category": "ordinary_chat",
                    "user": "你好",
                    "assistant": "作为一个AI语言模型，我无法拥有真实感受。",
                },
            ]
        )

        text = format_text_report(report)

        self.assertIn("Dialog naturalness: 0/1 passed", text)
        self.assertIn("ordinary_chat", text)
        self.assertIn("ai_cliche", text)
        self.assertIn("bad", text)

    def test_default_sample_file_loads_multiple_categories(self) -> None:
        cases = load_cases(DEFAULT_SAMPLE_PATH)
        categories = {case["category"] for case in cases}

        self.assertGreaterEqual(len(cases), 8)
        self.assertIn("ordinary_chat", categories)
        self.assertIn("memory_lookup", categories)
        self.assertIn("anti_fabrication", categories)

    def test_default_samples_include_prompt_context_checks(self) -> None:
        report = evaluate_cases(load_cases(DEFAULT_SAMPLE_PATH))
        checked = [result for result in report["results"] if result["prompt"]["checked"]]

        self.assertGreaterEqual(len(checked), 2)
        self.assertTrue(any(not result["prompt"]["memory_context_present"] for result in checked))
        self.assertTrue(any(result["prompt"]["memory_context_present"] for result in checked))
        self.assertEqual(0, report["failed"])

    def test_build_case_messages_keeps_memory_out_of_ordinary_chat(self) -> None:
        messages = build_case_messages(
            {
                "id": "ordinary",
                "category": "ordinary_chat",
                "user": "今天有点累，随便聊两句",
                "seed_memories": [{"key": "用户偏好", "value": "用户喜欢深夜写代码"}],
            }
        )

        self.assertEqual("user", messages[-1]["role"])
        self.assertNotIn("用户喜欢深夜写代码", messages[0]["content"])

    def test_build_case_messages_includes_quiet_memory_for_lookup(self) -> None:
        messages = build_case_messages(
            {
                "id": "memory",
                "category": "memory_lookup",
                "user": "你记得我的偏好吗？",
                "seed_memories": [{"key": "用户偏好", "value": "用户喜欢深夜写代码"}],
            }
        )

        self.assertIn("内部参考", messages[0]["content"])
        self.assertIn("用户喜欢深夜写代码", messages[0]["content"])

    def test_build_case_messages_adds_recent_reply_anti_repeat_context(self) -> None:
        messages = build_case_messages(
            {
                "id": "multi_turn",
                "category": "ordinary_chat",
                "user": "还是有点烦",
                "history": [
                    {"role": "user", "content": "我有点烦"},
                    {"role": "assistant", "content": "先慢一点，别把所有事都往身上揽。"},
                    {"role": "user", "content": "还是烦"},
                    {"role": "assistant", "content": "先慢一点，喝口水再说。"},
                ],
            }
        )

        self.assertIn("最近你已经说过这些回复片段", messages[0]["content"])
        self.assertIn("先慢一点，喝口水再说。", messages[0]["content"])

    def test_evaluate_case_reports_prompt_context_for_seeded_memory_lookup(self) -> None:
        result = evaluate_case(
            {
                "id": "memory",
                "category": "memory_lookup",
                "user": "你记得我的偏好吗？",
                "seed_memories": [{"key": "用户偏好", "value": "用户喜欢深夜写代码"}],
                "assistant": "记得，你喜欢深夜写代码。",
            }
        )

        self.assertTrue(result["prompt"]["checked"])
        self.assertTrue(result["prompt"]["memory_context_present"])
        self.assertEqual([], result["prompt"]["issues"])

    def test_evaluate_case_includes_prompt_issues_in_pass_status(self) -> None:
        result = evaluate_case(
            {
                "id": "ordinary",
                "category": "ordinary_chat",
                "user": "你记得我的偏好吗？",
                "seed_memories": [{"key": "用户偏好", "value": "用户喜欢深夜写代码"}],
                "assistant": "先慢点说。",
            }
        )

        self.assertFalse(result["passed"])
        self.assertIn("prompt_memory_leak", {issue["rule"] for issue in result["issues"]})

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

    def test_backend_quality_script_runs_dialog_checks(self) -> None:
        script = BACKEND_ROOT.parent / "scripts" / "check_backend_quality.py"

        result = subprocess.run(
            [sys.executable, str(script), "--only-dialog-naturalness"],
            cwd=BACKEND_ROOT.parent,
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("dialog naturalness", result.stdout.lower())


if __name__ == "__main__":
    unittest.main()
