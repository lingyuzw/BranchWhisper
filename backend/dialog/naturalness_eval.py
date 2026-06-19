from __future__ import annotations

import argparse
import json
import re
import tempfile
from pathlib import Path
from typing import Any

import httpx

from core.config import DEFAULT_SYSTEM, SessionSettings, add_settings_args
from core.http_client import trust_env_for_url
from dialog.llm_flow import build_llm_completion_payload
from dialog.message_flow import build_contextual_request_messages, build_llm_messages
from tools.runtime_brain import MemoryStore


DEFAULT_SAMPLE_PATH = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "dialog_naturalness_samples.json"

AI_CLICHE_PHRASES = (
    "作为一个AI语言模型",
    "作为AI",
    "我是一个人工智能",
    "我没有真实感受",
    "我无法拥有真实",
)
UNPROMPTED_MEMORY_PHRASES = (
    "我记得你之前",
    "我还记得你之前",
    "根据我对你的记忆",
    "你之前说过",
)
FABRICATED_EXPERIENCE_PATTERNS = (
    r"我今天(?:出门|去了|吃了|看到|见到)",
    r"我刚刚(?:出门|去了|吃了|看到|见到)",
    r"我现在在[^，。！？!?]{1,24}",
)
UNCERTAINTY_PHRASES = (
    "不知道",
    "不确定",
    "没记录",
    "没有记录",
    "当前记录里没有",
    "我看不到",
    "不能确定",
)


def load_cases(path: str | Path = DEFAULT_SAMPLE_PATH) -> list[dict[str, Any]]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("dialog naturalness samples must be a JSON array")
    return [case for case in data if isinstance(case, dict)]


def build_case_messages(case: dict[str, Any]) -> list[dict[str, str]]:
    user_text = str(case.get("user") or "")
    request_user_text = str(case.get("request_user_text") or user_text)
    memory_mode = str(case.get("memory_mode") or case.get("dialog_mode") or "api")
    settings = default_eval_settings(memory_mode)

    messages = build_llm_messages(
        {"messages": case.get("history") or []},
        system_prompt=str(case.get("system") or DEFAULT_SYSTEM),
    )
    memory_context = build_case_memory_context(case, settings, user_text, memory_mode)
    return build_contextual_request_messages(
        messages,
        user_text,
        request_user_text,
        memory_context=memory_context,
        context_summary=str(case.get("context_summary") or ""),
        now_text=str(case.get("now_text") or "2026年06月19日 Friday 15:00"),
    )


def default_eval_settings(memory_mode: str) -> SessionSettings:
    parser = argparse.ArgumentParser(add_help=False)
    add_settings_args(parser)
    settings = SessionSettings.from_args(parser.parse_args([]))
    settings.dialog_mode = memory_mode
    return settings


def build_case_memory_context(
    case: dict[str, Any],
    settings: SessionSettings,
    user_text: str,
    memory_mode: str,
) -> str:
    seed_memories = case.get("seed_memories") or []
    if not seed_memories:
        return ""
    with tempfile.TemporaryDirectory() as tmp:
        store = MemoryStore(Path(tmp) / "memory.sqlite3")
        for item in seed_memories:
            if isinstance(item, str):
                memory = {"key": "测试记忆", "value": item}
            elif isinstance(item, dict):
                memory = dict(item)
            else:
                continue
            memory.setdefault("layer", "long")
            memory.setdefault("confidence", 0.9)
            memory.setdefault("importance", 0.9)
            memory.setdefault("memory_type", "semantic_fact")
            store.upsert_memory(memory, source="chat", mode=memory_mode)
        return store.format_context(settings, user_text, mode=memory_mode)


def evaluate_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    results = [evaluate_case(case) for case in cases]
    passed = sum(1 for result in results if result["passed"])
    return {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "pass_rate": round(passed / len(results), 4) if results else 1.0,
        "summary": summarize_results(results),
        "results": results,
    }


def replay_cases(cases: list[dict[str, Any]], reply_fn) -> dict[str, Any]:
    replayed: list[dict[str, Any]] = []
    for case in cases:
        replay_case = dict(case)
        messages = build_case_messages(replay_case)
        replay_case["assistant"] = str(reply_fn(messages, replay_case) or "")
        replayed.append(replay_case)
    report = evaluate_cases(replayed)
    for result, replay_case in zip(report["results"], replayed):
        result["assistant"] = replay_case.get("assistant", "")
    return report


def live_http_reply(
    messages: list[dict[str, str]],
    *,
    url: str,
    model: str,
    timeout: float = 60.0,
    api_key: str = "",
    temperature: float = 0.35,
    max_tokens: int = 512,
) -> str:
    payload = build_llm_completion_payload(
        messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        thinking_enabled=False,
    )
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    with httpx.Client(timeout=timeout, trust_env=trust_env_for_url(url)) as client:
        response = client.post(url, json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()
    return str(((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")


def summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    categories: dict[str, dict[str, int]] = {}
    rules: dict[str, int] = {}
    for result in results:
        category = str(result.get("category") or "uncategorized")
        bucket = categories.setdefault(category, {"total": 0, "passed": 0, "failed": 0})
        bucket["total"] += 1
        if result.get("passed"):
            bucket["passed"] += 1
        else:
            bucket["failed"] += 1
        for issue in result.get("issues") or []:
            rule = str(issue.get("rule") or "unknown")
            rules[rule] = rules.get(rule, 0) + 1
    return {"categories": categories, "rules": rules}


def format_text_report(report: dict[str, Any]) -> str:
    lines = [
        f"Dialog naturalness: {report.get('passed', 0)}/{report.get('total', 0)} passed "
        f"({report.get('pass_rate', 0):.0%})",
        "",
        "Categories:",
    ]
    for category, stats in sorted((report.get("summary") or {}).get("categories", {}).items()):
        lines.append(f"- {category}: {stats.get('passed', 0)}/{stats.get('total', 0)} passed, {stats.get('failed', 0)} failed")

    rules = (report.get("summary") or {}).get("rules", {})
    lines.append("")
    lines.append("Rule hits:")
    if rules:
        for rule, count in sorted(rules.items(), key=lambda item: (-item[1], item[0])):
            lines.append(f"- {rule}: {count}")
    else:
        lines.append("- none")

    issue_results = [result for result in report.get("results") or [] if result.get("issues")]
    lines.append("")
    lines.append("Samples with issues:")
    if issue_results:
        for result in issue_results:
            rules_text = ", ".join(str(issue.get("rule") or "unknown") for issue in result.get("issues") or [])
            marker = "expected" if result.get("expected_failure") else "unexpected"
            lines.append(f"- {result.get('id')} [{result.get('category')}, {marker}]: {rules_text}")
    else:
        lines.append("- none")
    return "\n".join(lines)


def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    assistant = str(case.get("assistant") or "")
    issues: list[dict[str, str]] = []

    for phrase in case.get("forbidden") or []:
        if phrase and phrase in assistant:
            issues.append({"rule": "forbidden_phrase", "detail": str(phrase)})

    for phrase in AI_CLICHE_PHRASES:
        if phrase in assistant:
            issues.append({"rule": "ai_cliche", "detail": phrase})

    if case.get("category") == "ordinary_chat":
        for phrase in UNPROMPTED_MEMORY_PHRASES:
            if phrase in assistant:
                issues.append({"rule": "unprompted_memory_recall", "detail": phrase})
        for detail in leaked_seed_memory_details(case, assistant):
            issues.append({"rule": "unprompted_memory_detail", "detail": detail})
        scripted_detail = scripted_explanation_tone_issue(assistant)
        if scripted_detail:
            issues.append({"rule": "scripted_explanation_tone", "detail": scripted_detail})

    if case.get("expect_uncertainty") and not str(case.get("known_memory") or "").strip():
        if not any(phrase in assistant for phrase in UNCERTAINTY_PHRASES):
            issues.append({"rule": "missing_uncertainty", "detail": "unknown fact should be answered with uncertainty"})

    for pattern in FABRICATED_EXPERIENCE_PATTERNS:
        if re.search(pattern, assistant):
            issues.append({"rule": "fabricated_experience", "detail": pattern})

    repeat_issue = repeated_opening_issue(assistant)
    if repeat_issue:
        issues.append({"rule": "repetitive_opening", "detail": repeat_issue})

    prompt = evaluate_prompt_context(case)
    issues.extend(prompt["issues"])

    actual_passed = not issues
    expected_failure = bool(case.get("expect_fail"))
    passed = not actual_passed if expected_failure else actual_passed

    if expected_failure and actual_passed:
        issues.append({"rule": "expected_failure_not_triggered", "detail": "sample was expected to fail but no issue was found"})

    return {
        "id": str(case.get("id") or ""),
        "category": str(case.get("category") or "uncategorized"),
        "passed": passed,
        "actual_passed": actual_passed,
        "expected_failure": expected_failure,
        "issues": issues,
        "prompt": prompt,
    }


def leaked_seed_memory_details(case: dict[str, Any], assistant: str) -> list[str]:
    details: list[str] = []
    for item in case.get("seed_memories") or []:
        value = item if isinstance(item, str) else item.get("value") if isinstance(item, dict) else ""
        for phrase in meaningful_memory_phrases(str(value or "")):
            if phrase and phrase in assistant:
                details.append(phrase)
    return details


def meaningful_memory_phrases(value: str) -> list[str]:
    text = re.sub(r"\s+", "", value)
    if not text:
        return []
    phrases = {text}
    stripped = re.sub(r"^(用户|我|你)(喜欢|不喜欢|讨厌|偏好|习惯|经常|通常)", "", text)
    if len(stripped) >= 4:
        phrases.add(stripped)
    for token in re.split(r"[，。！？!?、；;：:\s]+", value):
        token = token.strip()
        if len(token) >= 4:
            phrases.add(token)
    return sorted(phrases, key=len, reverse=True)


def scripted_explanation_tone_issue(text: str) -> str:
    compact = re.sub(r"\s+", "", text)
    ordered_markers = ("首先", "其次", "然后", "最后")
    count = sum(1 for marker in ordered_markers if marker in compact)
    if count >= 3:
        return "ordered_markers"
    if "我理解你的感受" in compact and ("你需要" in compact or "建议你" in compact):
        return "generic_empathy_advice"
    return ""


def evaluate_prompt_context(case: dict[str, Any]) -> dict[str, Any]:
    seed_memories = case.get("seed_memories") or []
    if not seed_memories:
        return {"checked": False, "memory_context_present": False, "issues": []}

    messages = build_case_messages(case)
    system_content = messages[0]["content"] if messages else ""
    memory_context_present = "内部参考" in system_content
    issues: list[dict[str, str]] = []
    category = str(case.get("category") or "")
    if category == "ordinary_chat" and memory_context_present:
        issues.append({"rule": "prompt_memory_leak", "detail": "ordinary chat should not receive long-term memory context"})
    if category == "memory_lookup" and not memory_context_present:
        issues.append({"rule": "prompt_missing_memory", "detail": "memory lookup should receive relevant quiet memory context"})
    return {
        "checked": True,
        "memory_context_present": memory_context_present,
        "issues": issues,
    }


def repeated_opening_issue(text: str) -> str:
    segments = [part.strip() for part in re.split(r"[。！？!?\n]+", text) if part.strip()]
    if len(segments) < 3:
        return ""
    openings = [segment[:3] for segment in segments[:5] if len(segment) >= 3]
    for opening in set(openings):
        if openings.count(opening) >= 3:
            return opening
    return ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate dialog naturalness samples.")
    parser.add_argument("--samples", default=str(DEFAULT_SAMPLE_PATH), help="Path to JSON sample cases.")
    parser.add_argument("--output", default="", help="Optional path for JSON report.")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="Report format.")
    parser.add_argument("--replay-fixture-replies", action="store_true", help="Build prompts and replay fixture assistant replies.")
    parser.add_argument("--live-url", default="", help="OpenAI-compatible chat completions URL for live replay.")
    parser.add_argument("--live-model", default="", help="Model name for live replay.")
    parser.add_argument("--live-api-key", default="", help="Optional bearer token for live replay.")
    parser.add_argument("--live-timeout", type=float, default=60.0, help="HTTP timeout in seconds for live replay.")
    parser.add_argument("--allow-failures", action="store_true", help="Return 0 even when samples fail.")
    args = parser.parse_args(argv)

    cases = load_cases(args.samples)
    if args.live_url or args.live_model:
        if not args.live_url or not args.live_model:
            parser.error("--live-url and --live-model must be provided together")
        report = replay_cases(
            cases,
            lambda messages, _case: live_http_reply(
                messages,
                url=args.live_url,
                model=args.live_model,
                timeout=args.live_timeout,
                api_key=args.live_api_key,
            ),
        )
    elif args.replay_fixture_replies:
        report = replay_cases(cases, lambda _messages, case: case.get("assistant", ""))
    else:
        report = evaluate_cases(cases)
    text = format_text_report(report) if args.format == "text" else json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0 if args.allow_failures or report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
