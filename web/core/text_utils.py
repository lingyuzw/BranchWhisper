from __future__ import annotations

import re


def compact_text(text: str, limit: int = 600) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "..."


def format_reply_paragraphs(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", str(text or ""), flags=re.S | re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_reply_messages(text: str, *, max_parts: int = 4, max_chars: int = 60) -> list[str]:
    text = format_reply_paragraphs(str(text or "")).strip()
    if not text:
        return []
    clauses = natural_reply_clauses(text)
    merged = merge_reply_clauses(clauses, max_chars=max_chars)
    if len(merged) <= max_parts:
        return merged
    head = merged[: max_parts - 1]
    tail = " ".join(merged[max_parts - 1 :]).strip()
    if tail:
        head.append(trim_reply_part(tail, max_chars * 2))
    return [item for item in head if item]


def natural_reply_clauses(text: str) -> list[str]:
    clauses: list[str] = []
    for line in re.split(r"\r?\n+", text):
        line = line.strip()
        if not line:
            continue
        start = 0
        for match in re.finditer(r"[。！？!?~～]+", line):
            end = match.end()
            part = line[start:end].strip()
            if part:
                clauses.append(part)
            start = end
        rest = line[start:].strip()
        if rest:
            clauses.extend(split_long_clause(rest))
    return clauses or [text]


def split_long_clause(text: str, *, soft_limit: int = 46) -> list[str]:
    text = text.strip()
    if len(text) <= soft_limit:
        return [text]
    pieces = [part.strip() for part in re.split(r"(?<=[，,、；;])", text) if part.strip()]
    if len(pieces) <= 1:
        return [trim_reply_part(text, soft_limit * 2)]
    return pieces


def merge_reply_clauses(clauses: list[str], *, max_chars: int) -> list[str]:
    merged: list[str] = []
    current = ""
    min_chars = min(18, max_chars)
    for clause in clauses:
        clause = clause.strip()
        if not clause:
            continue
        candidate = join_reply_parts(current, clause) if current else clause
        if current and len(candidate) > max_chars and len(current) >= min_chars:
            merged.append(current)
            current = clause
        else:
            current = candidate
    if current:
        merged.append(current)
    return [trim_reply_part(item, max_chars) if len(item) > max_chars + 8 else item for item in merged]


def trim_reply_part(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = max(
        text.rfind("。", 0, limit),
        text.rfind("！", 0, limit),
        text.rfind("？", 0, limit),
        text.rfind("!", 0, limit),
        text.rfind("?", 0, limit),
        text.rfind("，", 0, limit),
        text.rfind(",", 0, limit),
        text.rfind("、", 0, limit),
        text.rfind("；", 0, limit),
        text.rfind(";", 0, limit),
        text.rfind(" ", 0, limit),
    )
    if cut >= max(12, int(limit * 0.55)):
        return text[: cut + 1].strip()
    return text


def join_reply_parts(left: str, right: str) -> str:
    left = left.strip()
    right = right.strip()
    if not left:
        return right
    if not right:
        return left
    if re.search(r"[\u4e00-\u9fff。！？~～，、；：]$", left) and re.search(r"^[\u4e00-\u9fff“‘（《]", right):
        return left + right
    return f"{left} {right}".strip()


def is_story_request(text: str) -> bool:
    return any(keyword in text for keyword in ("故事", "睡前", "童话"))


def extract_repeat_text(text: str) -> str | None:
    prefixes = (
        "跟着我说",
        "跟我说",
        "跟我念",
        "照着我说",
        "复读",
        "重复",
        "请你重复",
        "请你跟着我说",
        "你跟着我说",
    )
    for prefix in prefixes:
        index = str(text or "").find(prefix)
        if index == -1:
            continue
        value = str(text or "")[index + len(prefix) :].strip().lstrip("\u3000 \t\r\n，,:：")
        return value or None
    return None
