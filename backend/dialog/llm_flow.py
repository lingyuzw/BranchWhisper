from __future__ import annotations


def build_llm_completion_payload(
    messages: list[dict[str, str]],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
    thinking_enabled: bool,
) -> dict:
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if thinking_enabled:
        payload["enable_thinking"] = True
    return payload


def build_llm_stream_payload(
    messages: list[dict[str, str]],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
    dialog_mode: str,
    thinking_enabled: bool,
    allow_thinking: bool,
    seed: int,
) -> dict:
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if dialog_mode == "local":
        payload.update(
            {
                "top_p": 0.95,
                "repeat_penalty": 1.18,
                "dry_multiplier": 0.8,
                "dry_base": 1.75,
                "dry_allowed_length": 2,
                "dry_penalty_last_n": -1,
                "seed": seed,
            }
        )
    if allow_thinking and thinking_enabled:
        payload["enable_thinking"] = True
    return payload
