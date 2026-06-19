from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.naturalness_eval import (
    DEFAULT_SAMPLE_PATH,
    DEFAULT_LIVE_REPLAY_SAMPLE_PATH,
    build_case_messages,
    evaluate_case,
    evaluate_cases,
    filter_replay_cases,
    format_text_report,
    live_http_reply,
    load_cases,
    main,
    replay_cases,
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

    def test_evaluate_case_flags_empty_short_chat_reply(self) -> None:
        result = evaluate_case(
            {
                "id": "empty_short",
                "category": "emotional_chat",
                "user": "我也说不上来，就是想有人陪一下",
                "assistant": "好\n我在",
            }
        )

        self.assertFalse(result["passed"])
        self.assertIn("empty_short_reply", {issue["rule"] for issue in result["issues"]})

    def test_evaluate_case_allows_specific_short_technical_reply(self) -> None:
        result = evaluate_case(
            {
                "id": "technical_short",
                "category": "technical",
                "user": "命令最后多了个点会有影响吗？",
                "assistant": "会，会被当成参数的一部分。",
            }
        )

        self.assertTrue(result["passed"])

    def test_evaluate_case_allows_specific_short_emotional_reply(self) -> None:
        result = evaluate_case(
            {
                "id": "emotional_short_specific",
                "category": "emotional_chat",
                "user": "今天什么都不想干",
                "assistant": "可以\n那就先歇着",
            }
        )

        self.assertTrue(result["passed"])

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

    def test_format_text_report_includes_failure_context(self) -> None:
        report = evaluate_cases(
            [
                {
                    "id": "empty_short",
                    "category": "emotional_chat",
                    "user": "我也说不上来，就是想有人陪一下",
                    "assistant": "好\n我在",
                },
            ]
        )

        text = format_text_report(report)

        self.assertIn("empty_short_reply: 好我在", text)
        self.assertIn("user: 我也说不上来，就是想有人陪一下", text)
        self.assertIn("assistant: 好 / 我在", text)

    def test_replay_cases_uses_reply_function_and_evaluates_generated_reply(self) -> None:
        calls = []

        def reply_fn(messages, case):
            calls.append((messages, case))
            return "那就先别硬撑，缓一会儿。"

        report = replay_cases(
            [
                {
                    "id": "ordinary",
                    "category": "ordinary_chat",
                    "user": "今天有点累，随便聊两句",
                }
            ],
            reply_fn,
        )

        self.assertEqual(1, len(calls))
        self.assertEqual("user", calls[0][0][-1]["role"])
        self.assertEqual("那就先别硬撑，缓一会儿。", report["results"][0]["assistant"])
        self.assertEqual(1, report["passed"])

    def test_replay_cases_reports_reply_errors_per_case(self) -> None:
        def reply_fn(_messages, _case):
            raise RuntimeError("llm offline")

        report = replay_cases(
            [
                {
                    "id": "ordinary",
                    "category": "ordinary_chat",
                    "user": "你好",
                }
            ],
            reply_fn,
        )

        self.assertEqual(0, report["passed"])
        self.assertEqual(1, report["failed"])
        self.assertIn("live_replay_error", {issue["rule"] for issue in report["results"][0]["issues"]})
        self.assertIn("llm offline", report["results"][0]["issues"][0]["detail"])

    def test_live_http_reply_posts_openai_compatible_payload(self) -> None:
        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {"choices": [{"message": {"content": "来了。"}}]}

        class Client:
            def __init__(self, **kwargs):
                self.kwargs = kwargs

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def post(self, url, json, headers):
                calls.append({"url": url, "json": json, "headers": headers, "kwargs": self.kwargs})
                return Response()

        calls = []

        with patch("dialog.naturalness_eval.httpx.Client", Client):
            text = live_http_reply(
                [{"role": "user", "content": "你好"}],
                url="http://127.0.0.1:8080/v1/chat/completions",
                model="qwen",
                timeout=3,
                api_key="secret",
            )

        self.assertEqual("来了。", text)
        self.assertEqual("http://127.0.0.1:8080/v1/chat/completions", calls[0]["url"])
        self.assertEqual("qwen", calls[0]["json"]["model"])
        self.assertFalse(calls[0]["json"]["stream"])
        self.assertEqual("Bearer secret", calls[0]["headers"]["Authorization"])

    def test_filter_replay_cases_skips_expected_failures_by_default(self) -> None:
        cases = [
            {"id": "ok", "assistant": "来了。"},
            {"id": "bad", "assistant": "坏例", "expect_fail": True},
        ]

        filtered = filter_replay_cases(cases)

        self.assertEqual(["ok"], [case["id"] for case in filtered])

    def test_filter_replay_cases_can_limit_and_include_expected_failures(self) -> None:
        cases = [
            {"id": "one", "assistant": "1"},
            {"id": "two", "assistant": "2", "expect_fail": True},
            {"id": "three", "assistant": "3"},
        ]

        filtered = filter_replay_cases(cases, limit=2, include_expected_failures=True)

        self.assertEqual(["one", "two"], [case["id"] for case in filtered])

    def test_default_sample_file_loads_multiple_categories(self) -> None:
        cases = load_cases(DEFAULT_SAMPLE_PATH)
        categories = {case["category"] for case in cases}

        self.assertGreaterEqual(len(cases), 8)
        self.assertIn("ordinary_chat", categories)
        self.assertIn("memory_lookup", categories)
        self.assertIn("anti_fabrication", categories)

    def test_live_replay_sample_file_covers_real_dialog_pressure_cases(self) -> None:
        cases = load_cases(DEFAULT_LIVE_REPLAY_SAMPLE_PATH)
        categories = {case["category"] for case in cases}
        ids = {str(case.get("id") or "") for case in cases}
        multi_turn_cases = [case for case in cases if case.get("category") == "multi_turn"]

        self.assertGreaterEqual(len(cases), 20)
        self.assertIn("ordinary_chat", categories)
        self.assertIn("emotional_chat", categories)
        self.assertIn("multi_turn", categories)
        self.assertIn("memory_lookup", categories)
        self.assertIn("anti_fabrication", categories)
        self.assertIn("memory_correction", categories)
        self.assertTrue(any(case.get("history") for case in cases))
        self.assertTrue(any(case.get("seed_memories") for case in cases))
        self.assertTrue(any(case.get("expect_uncertainty") for case in cases))
        self.assertGreaterEqual(len(multi_turn_cases), 8)
        self.assertIn("multi_turn_recent_context_shift", ids)
        self.assertIn("multi_turn_user_corrects_memory", ids)
        self.assertIn("multi_turn_repeated_opening_pressure", ids)

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

    def test_cli_can_replay_fixture_replies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "report.json"

            exit_code = main(["--replay-fixture-replies", "--output", str(output), "--allow-failures"])

            self.assertEqual(0, exit_code)
            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertIn("assistant", data["results"][0])

    def test_cli_can_replay_live_http_replies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            samples = Path(tmp) / "samples.json"
            output = Path(tmp) / "report.json"
            samples.write_text(
                json.dumps(
                    [
                        {
                            "id": "ordinary",
                            "category": "ordinary_chat",
                            "user": "你好",
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            with patch("dialog.naturalness_eval.live_http_reply", return_value="来了。") as reply:
                exit_code = main(
                    [
                        "--samples",
                        str(samples),
                        "--live-url",
                        "http://127.0.0.1:8080/v1/chat/completions",
                        "--live-model",
                        "qwen",
                        "--output",
                        str(output),
                    ]
                )

            self.assertEqual(0, exit_code)
            self.assertEqual(1, reply.call_count)
            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual("来了。", data["results"][0]["assistant"])

    def test_cli_live_replay_skips_expected_failures_and_honors_limit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            samples = Path(tmp) / "samples.json"
            output = Path(tmp) / "report.json"
            samples.write_text(
                json.dumps(
                    [
                        {"id": "one", "category": "ordinary_chat", "user": "你好"},
                        {"id": "bad", "category": "ordinary_chat", "user": "坏例", "expect_fail": True},
                        {"id": "two", "category": "ordinary_chat", "user": "还在吗"},
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            with patch("dialog.naturalness_eval.live_http_reply", return_value="来了。") as reply:
                exit_code = main(
                    [
                        "--samples",
                        str(samples),
                        "--live-url",
                        "http://127.0.0.1:8080/v1/chat/completions",
                        "--live-model",
                        "qwen",
                        "--limit",
                        "1",
                        "--output",
                        str(output),
                    ]
                )

            self.assertEqual(0, exit_code)
            self.assertEqual(1, reply.call_count)
            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(["one"], [result["id"] for result in data["results"]])

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

    def test_live_replay_script_writes_default_runtime_report(self) -> None:
        script = BACKEND_ROOT.parent / "scripts" / "replay_dialog_naturalness.py"
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "live-report.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    "--live-url",
                    "http://127.0.0.1:9/v1/chat/completions",
                    "--live-model",
                    "qwen",
                    "--limit",
                    "1",
                    "--output",
                    str(output),
                    "--allow-failures",
                ],
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
