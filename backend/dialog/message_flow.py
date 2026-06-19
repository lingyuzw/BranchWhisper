from __future__ import annotations


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
