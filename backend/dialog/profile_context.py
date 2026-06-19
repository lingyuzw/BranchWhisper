from __future__ import annotations

from core.config import (
    active_asr_model,
    active_asr_provider,
    active_dialog_mode,
    active_llm_model,
    active_tts_model,
    active_tts_provider,
)


def trace_profile_context(settings, role: str) -> dict[str, str]:
    role = str(role or "").strip().lower()
    if role == "asr":
        return {
            "profile_role": "asr",
            "profile_name": f"{active_asr_provider(settings)}:{active_asr_model(settings)}",
        }
    if role == "llm":
        return {
            "profile_role": "llm",
            "profile_name": f"{active_dialog_mode(settings)}:{active_llm_model(settings)}",
        }
    if role == "tts":
        return {
            "profile_role": "tts",
            "profile_name": f"{active_tts_provider(settings)}:{active_tts_model(settings)}",
        }
    return {"profile_role": "", "profile_name": ""}
