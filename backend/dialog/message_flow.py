from __future__ import annotations

import time
from datetime import datetime

from dialog.text_helpers import attachment_text
from dialog.text_helpers import compact_str


def compose_user_request_text(user_text: str, attachments: list[dict]) -> str:
    text = user_text.strip() or "请看看这张图片。"
    image_lines = []
    for index, item in enumerate(attachments, start=1):
        if item.get("type") == "image":
            image_lines.append(f"图片{index}摘要：{item.get('summary') or '未生成摘要'}")
    if image_lines:
        text += "\n\n用户随消息发送了图片。你只能基于图片摘要理解图片，不要假装看到了摘要以外的细节：\n" + "\n".join(image_lines)
    return text


def memory_observation_text(user_text: str, attachments: list[dict], *, vision_memory_extract_enabled: bool) -> str:
    if not vision_memory_extract_enabled:
        return user_text
    image_summaries = [
        str(item.get("summary") or "").strip()
        for item in attachments or []
        if item.get("type") == "image" and item.get("summary")
    ]
    if not image_summaries:
        return user_text
    return user_text + "\n\n图片摘要（仅在通过记忆准入时才可记住）：\n" + "\n".join(image_summaries)


def build_llm_messages(conversation: dict, *, system_prompt: str) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": system_prompt}]
    for item in conversation.get("messages") or []:
        role = item.get("role")
        content = item.get("content")
        attachments_note = attachment_text(item.get("attachments") or [])
        if role in {"user", "assistant"} and (content or attachments_note):
            full_content = content or ""
            if attachments_note:
                full_content += "\n" + attachments_note
            messages.append({"role": role, "content": full_content.strip()})
    return messages


def draft_conversation(*, now_text: str | None = None) -> dict:
    now = now_text or time.strftime("%Y-%m-%d %H:%M:%S")
    return {
        "id": "",
        "title": "新的对话",
        "created_at": now,
        "updated_at": now,
        "archived": False,
        "favorite": False,
        "summary": "",
        "messages": [],
        "draft": True,
    }


def build_contextual_request_messages(
    messages: list[dict[str, str]],
    user_text: str,
    request_user_text: str,
    *,
    memory_context: str = "",
    context_summary: str = "",
    now_text: str | None = None,
) -> list[dict[str, str]]:
    request_messages = list(messages)
    now = now_text or datetime.now().strftime("%Y年%m月%d日 %A %H:%M")
    time_note = f"\n\n当前时间：{now}。你要自然地感知这个时间（比如晚上就聊晚上的话题，早上就聊早上的），但不要生硬地报时。"

    recent_user_msgs = [m.get("content", "") for m in request_messages[-6:] if m.get("role") == "user"]
    if len(recent_user_msgs) >= 2 and recent_user_msgs[-1]:
        last = compact_str(recent_user_msgs[-1])
        prev = compact_str(recent_user_msgs[-2])
        if last and prev and last == prev:
            time_note += "\n注意：用户刚才问了和上一轮完全一样的问题。你应该稍微不耐烦或用不同方式回答，而不是原句重复。"

    recent_assistant = [compact_str(m.get("content", "")) for m in request_messages[-8:] if m.get("role") == "assistant"]
    recent_assistant = [text for text in recent_assistant if text]
    if recent_assistant:
        time_note += (
            "\n\n最近你已经说过这些回复片段，请避免原句复用、固定开头和重复解释；"
            "除非用户明确要求复读，否则要换一种自然说法：\n"
            + "\n".join(f"- {text[:80]}" for text in recent_assistant[-3:])
        )

    old_content = request_messages[0].get("content", "")
    if context_summary:
        old_content += "\n\n会话压缩摘要（较早聊天的浓缩记录，可能不完整，但比遗忘更可靠）：\n" + context_summary
    if memory_context:
        old_content += "\n\n" + memory_context
    old_content += time_note
    request_messages[0] = {**request_messages[0], "content": old_content}

    request_messages.append({"role": "user", "content": request_user_text})
    return request_messages
