from __future__ import annotations

STORY_KEYWORDS = ("\u6545\u4e8b", "\u7761\u524d", "\u7ae5\u8bdd")
CONTEXT_RECALL_KEYWORDS = (
    "\u4e0a\u53e5",
    "\u4e0a\u4e00\u53e5",
    "\u521a\u624d\u8bf4",
    "\u4f60\u8bf4\u4e86\u4ec0\u4e48",
    "\u4e0a\u6b21\u8bf4",
    "\u524d\u9762\u8bf4",
    "\u6211\u521a\u624d\u8bf4",
    "\u8bb0\u5f97\u6211",
    "\u8bb0\u5f97\u4f60",
)
REPEAT_PREFIXES = (
    "\u8ddf\u7740\u6211\u8bf4",
    "\u8ddf\u6211\u8bf4",
    "\u8ddf\u6211\u5ff5",
    "\u7167\u7740\u6211\u8bf4",
    "\u590d\u8bfb",
    "\u91cd\u590d",
    "\u8bf7\u4f60\u91cd\u590d",
    "\u8bf7\u4f60\u8ddf\u7740\u6211\u8bf4",
    "\u4f60\u8ddf\u7740\u6211\u8bf4",
)


def compact_str(s: str) -> str:
    return "".join(s.split())[:200]


def attachment_text(attachments: list[dict]) -> str:
    parts = []
    for item in attachments or []:
        if item.get("type") == "image":
            parts.append(f"[图片] {item.get('summary') or item.get('url') or ''}".strip())
        elif item.get("type") == "sticker":
            parts.append(f"[表情包:{item.get('tag') or item.get('name') or '默认'}]")
    return " ".join(parts)


def is_story_request(text: str) -> bool:
    return any(keyword in text for keyword in STORY_KEYWORDS)


def build_request_user_text(text: str, previous_assistant: str | None = None) -> str:
    context_note = ""
    if previous_assistant and is_context_recall_request(text):
        context_note = (
            "\n\nContext note for this turn only: your immediately previous assistant reply was: "
            f"{previous_assistant}"
        )

    if not is_story_request(text):
        return text + context_note

    return (
        text
        + "\n\nTask: The user is asking for a bedtime/story. "
        "Directly tell a warm, coherent Chinese story for voice reading. "
        "Start with one short Chinese sentence under 8 Chinese characters. "
        "Then continue the story in 100 to 180 Chinese characters. "
        "Do not start with a permission phrase such as 'sure' or 'of course'. "
        "Do not give sleep advice, do not ask the user a question, "
        "do not evaluate your own story, and do not output END."
        + context_note
    )


def extract_repeat_text(text: str) -> str | None:
    for prefix in REPEAT_PREFIXES:
        index = text.find(prefix)
        if index == -1:
            continue
        value = text[index + len(prefix) :].strip()
        value = value.lstrip("\u3000 \t\r\n\uff0c,:\uff1a")
        return value or None
    return None


def is_context_recall_request(text: str) -> bool:
    return any(keyword in text for keyword in CONTEXT_RECALL_KEYWORDS)


def last_assistant_content(messages: list[dict[str, str]]) -> str | None:
    for message in reversed(messages):
        if message.get("role") == "assistant" and message.get("content"):
            return message["content"]
    return None
