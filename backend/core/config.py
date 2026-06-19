from __future__ import annotations

import json
import os
import argparse
from dataclasses import asdict, dataclass
from pathlib import Path

from core.io_utils import write_json_file

MASKED_SECRET_CHARS = "*"
DEFAULT_TTS_VOLUME = 0.88
DEFAULT_TTS_FADE_MS = 5
DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
DEFAULT_OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"
DEFAULT_OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"
DEFAULT_DASHSCOPE_MULTIMODAL_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
DEFAULT_API_LLM_MODEL = "qwen-plus"
DEFAULT_STICKER_VISION_MODEL = "qwen3-vl-plus"

DEFAULT_SYSTEM = (
    "你用“满穗”的轻量聊天风格和用户对话：自然、直接、有一点活气，"
    "但不要表演人设，不要主动讲角色背景，也不要把自己说成现实中正在做某件事的人。\n\n"
    "回复规则：\n"
    "- 始终中文回复，优先短句；简单聊天就短，需要解释时再展开。\n"
    "- 短句也要接住用户的具体意思，不要只回复好、行、我在这类空泛确认。\n"
    "- 像正常人聊天：少套话，少总结，不要客服腔，不要固定口癖，不要连续追问。\n"
    "- 可以有判断、调侃和轻微情绪，但不要油腻、夸张、卖萌或强行可爱。\n"
    "- 不知道就说不知道；不确定就说明不确定；没有记录就说没有记录。不要装懂，不要把猜测说成事实。\n"
    "- 不要编造当前现实行动、实时位置或真实经历；不要输出括号动作描写。\n"
    "- 用户要求重复时，只重复用户给出的文本，不额外发挥。\n\n"
    "记忆使用：\n"
    "- 最近聊天记录是工作记忆，用户问刚才说了什么时按记录回答。\n"
    "- 长期记忆只在当前问题明确相关时静默参考，不要主动复述长期记忆。\n"
    "- 普通闲聊不要为了显得熟悉而提长期记忆；只有用户明确问偏好、身份、习惯或过去记录时再使用。\n"
    "- 如果长期记忆和用户当前说法冲突，以用户当前纠正为准。"
)


@dataclass
class SessionSettings:
    asr_provider_mode: str
    asr_mode: str
    asr_url: str
    asr_model: str
    asr_timeout: float
    asr_max_tokens: int
    api_asr_provider: str
    api_asr_url: str
    api_asr_model: str
    api_asr_api_key: str
    api_asr_language: str
    api_asr_timeout: float
    llm_url: str
    llm_model: str
    llm_api_key: str
    dialog_mode: str
    api_llm_url: str
    api_llm_model: str
    api_llm_api_key: str
    api_temperature: float
    api_max_tokens: int
    api_history_turns: int
    thinking_enabled: bool
    temperature: float
    max_tokens: int
    history_turns: int
    system: str
    ui_font_scale: float
    web_user_name: str
    web_user_avatar_url: str
    web_assistant_name: str
    web_assistant_avatar_url: str
    memory_enabled: bool
    memory_extract_enabled: bool
    memory_admission_enabled: bool
    memory_min_importance: float
    memory_short_to_mid_days: int
    memory_short_to_mid_count: int
    memory_mid_to_long_days: int
    memory_mid_to_long_count: int
    memory_short_delete_days: int
    memory_mid_downgrade_days: int
    memory_long_downgrade_days: int
    memory_max_context_items: int
    context_compaction_enabled: bool
    context_window_tokens: int
    context_compaction_ratio: float
    context_keep_recent_turns: int
    context_summary_max_chars: int
    context_summary_max_layers: int
    vision_enabled: bool
    vision_url: str
    vision_model: str
    vision_timeout: float
    vision_max_image_mb: float
    vision_memory_extract_enabled: bool
    sticker_vision_enabled: bool
    sticker_vision_url: str
    sticker_vision_model: str
    sticker_vision_api_key: str
    sticker_vision_timeout: float
    sticker_vision_max_tokens: int
    stickers_enabled: bool
    sticker_activity: str
    sticker_cooldown_sec: int
    sticker_daily_limit: int
    sticker_max_streak: int
    sticker_custom_probability: float
    tools_enabled: bool
    tools_auto_call: bool
    tools_timeout: float
    tools_max_result_chars: int
    tts_provider_mode: str
    tts_model: str
    tts_url: str
    tts_sample_rate: int
    tts_speed: float
    tts_seed: int
    tts_volume: float
    tts_fade_ms: int
    tts_enabled: bool
    api_tts_provider: str
    api_tts_url: str
    api_tts_model: str
    api_tts_api_key: str
    api_tts_voice_mode: str
    api_tts_voice: str
    api_tts_voice_id: str
    api_tts_voice_name: str
    api_tts_voice_profile_id: str
    api_tts_instructions: str
    api_tts_format: str
    api_tts_sample_rate: int
    api_tts_speed: float
    api_tts_latency_mode: str
    vad_threshold: float
    vad_min_silence_ms: int
    vad_speech_pad_ms: int
    pre_speech_ms: int
    min_utterance_ms: int
    max_utterance_sec: float

    @classmethod
    def from_args(cls, args) -> "SessionSettings":
        return cls(
            asr_provider_mode=args.asr_provider_mode,
            asr_mode=args.asr_mode,
            asr_url=args.asr_url,
            asr_model=args.asr_model,
            asr_timeout=args.asr_timeout,
            asr_max_tokens=args.asr_max_tokens,
            api_asr_provider=args.api_asr_provider,
            api_asr_url=args.api_asr_url,
            api_asr_model=args.api_asr_model,
            api_asr_api_key=args.api_asr_api_key,
            api_asr_language=args.api_asr_language,
            api_asr_timeout=args.api_asr_timeout,
            llm_url=args.llm_url,
            llm_model=args.llm_model,
            llm_api_key=args.llm_api_key,
            dialog_mode=args.dialog_mode,
            api_llm_url=args.api_llm_url,
            api_llm_model=args.api_llm_model,
            api_llm_api_key=args.api_llm_api_key,
            api_temperature=args.api_temperature,
            api_max_tokens=args.api_max_tokens,
            api_history_turns=args.api_history_turns,
            thinking_enabled=args.thinking_enabled,
            temperature=args.temperature,
            max_tokens=args.max_tokens,
            history_turns=args.history_turns,
            system=args.system,
            ui_font_scale=args.ui_font_scale,
            web_user_name=args.web_user_name,
            web_user_avatar_url=args.web_user_avatar_url,
            web_assistant_name=args.web_assistant_name,
            web_assistant_avatar_url=args.web_assistant_avatar_url,
            memory_enabled=args.memory_enabled,
            memory_extract_enabled=args.memory_extract_enabled,
            memory_admission_enabled=args.memory_admission_enabled,
            memory_min_importance=args.memory_min_importance,
            memory_short_to_mid_days=args.memory_short_to_mid_days,
            memory_short_to_mid_count=args.memory_short_to_mid_count,
            memory_mid_to_long_days=args.memory_mid_to_long_days,
            memory_mid_to_long_count=args.memory_mid_to_long_count,
            memory_short_delete_days=args.memory_short_delete_days,
            memory_mid_downgrade_days=args.memory_mid_downgrade_days,
            memory_long_downgrade_days=args.memory_long_downgrade_days,
            memory_max_context_items=args.memory_max_context_items,
            context_compaction_enabled=args.context_compaction_enabled,
            context_window_tokens=args.context_window_tokens,
            context_compaction_ratio=args.context_compaction_ratio,
            context_keep_recent_turns=args.context_keep_recent_turns,
            context_summary_max_chars=args.context_summary_max_chars,
            context_summary_max_layers=args.context_summary_max_layers,
            vision_enabled=args.vision_enabled,
            vision_url=args.vision_url,
            vision_model=args.vision_model,
            vision_timeout=args.vision_timeout,
            vision_max_image_mb=args.vision_max_image_mb,
            vision_memory_extract_enabled=args.vision_memory_extract_enabled,
            sticker_vision_enabled=args.sticker_vision_enabled,
            sticker_vision_url=args.sticker_vision_url,
            sticker_vision_model=args.sticker_vision_model,
            sticker_vision_api_key=args.sticker_vision_api_key,
            sticker_vision_timeout=args.sticker_vision_timeout,
            sticker_vision_max_tokens=args.sticker_vision_max_tokens,
            stickers_enabled=args.stickers_enabled,
            sticker_activity=args.sticker_activity,
            sticker_cooldown_sec=args.sticker_cooldown_sec,
            sticker_daily_limit=args.sticker_daily_limit,
            sticker_max_streak=args.sticker_max_streak,
            sticker_custom_probability=args.sticker_custom_probability,
            tools_enabled=args.tools_enabled,
            tools_auto_call=args.tools_auto_call,
            tools_timeout=args.tools_timeout,
            tools_max_result_chars=args.tools_max_result_chars,
            tts_provider_mode=args.tts_provider_mode,
            tts_model=args.tts_model,
            tts_url=args.tts_url,
            tts_sample_rate=args.tts_sample_rate,
            tts_speed=args.tts_speed,
            tts_seed=args.tts_seed,
            tts_volume=args.tts_volume,
            tts_fade_ms=args.tts_fade_ms,
            tts_enabled=args.tts_enabled,
            api_tts_provider=args.api_tts_provider,
            api_tts_url=args.api_tts_url,
            api_tts_model=args.api_tts_model,
            api_tts_api_key=args.api_tts_api_key,
            api_tts_voice_mode=args.api_tts_voice_mode,
            api_tts_voice=args.api_tts_voice,
            api_tts_voice_id=args.api_tts_voice_id,
            api_tts_voice_name=args.api_tts_voice_name,
            api_tts_voice_profile_id=args.api_tts_voice_profile_id,
            api_tts_instructions=args.api_tts_instructions,
            api_tts_format=args.api_tts_format,
            api_tts_sample_rate=args.api_tts_sample_rate,
            api_tts_speed=args.api_tts_speed,
            api_tts_latency_mode=args.api_tts_latency_mode,
            vad_threshold=args.vad_threshold,
            vad_min_silence_ms=args.vad_min_silence_ms,
            vad_speech_pad_ms=args.vad_speech_pad_ms,
            pre_speech_ms=args.pre_speech_ms,
            min_utterance_ms=args.min_utterance_ms,
            max_utterance_sec=args.max_utterance_sec,
        )

    def update_from_dict(self, data: dict) -> None:
        allowed = set(asdict(self))
        for key, value in data.items():
            if key not in allowed or value is None:
                continue
            if value == "" and key not in {"web_user_avatar_url", "web_assistant_avatar_url"}:
                continue
            current = getattr(self, key)
            try:
                if isinstance(current, bool):
                    parsed = parse_bool_value(value)
                    if parsed is None:
                        continue
                    value = parsed
                elif isinstance(current, int):
                    value = int(value)
                elif isinstance(current, float):
                    value = float(value)
                if key == "ui_font_scale":
                    value = max(0.85, min(1.35, float(value)))
                if key == "context_compaction_ratio":
                    value = max(0.4, min(0.95, float(value)))
                if key == "sticker_activity":
                    value = str(value) if str(value) in {"off", "low", "standard", "active", "very_active", "custom"} else "active"
                if key == "sticker_custom_probability":
                    value = max(0.0, min(1.0, float(value)))
                if key == "dialog_mode":
                    value = str(value) if str(value) in {"local", "api"} else "local"
                if key in {"asr_provider_mode", "tts_provider_mode"}:
                    value = str(value) if str(value) in {"local", "api"} else "local"
                if key == "api_asr_provider":
                    value = normalize_provider(value, {"openai", "dashscope", "deepgram", "groq", "custom_openai"}, "openai")
                if key == "api_tts_provider":
                    value = normalize_provider(value, {"openai", "dashscope", "elevenlabs", "custom_openai"}, "openai")
                if key == "api_tts_voice_mode":
                    value = str(value) if str(value) in {"builtin", "cloned", "manual"} else "builtin"
                if key == "api_tts_format":
                    value = str(value) if str(value) in {"pcm", "wav", "mp3"} else "pcm"
                if key == "api_tts_latency_mode":
                    value = str(value) if str(value) in {"quality", "balanced", "fast"} else "balanced"
                if key == "sticker_vision_max_tokens":
                    value = max(128, min(4096, int(value)))
            except (TypeError, ValueError):
                continue
            setattr(self, key, value)


def parse_bool_value(value) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on", "enabled"}:
            return True
        if normalized in {"false", "0", "no", "n", "off", "disabled"}:
            return False
    return None


def normalize_provider(value, allowed: set[str], fallback: str) -> str:
    normalized = str(value or "").strip().lower().replace("-", "_")
    return normalized if normalized in allowed else fallback


def load_persisted_settings(settings: SessionSettings, path: Path) -> SessionSettings:
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                settings.update_from_dict(data)
        except Exception:
            pass
    migrate_legacy_defaults(settings)
    return settings


def migrate_legacy_defaults(settings: SessionSettings) -> None:
    if int(getattr(settings, "max_tokens", 0) or 0) == 220:
        settings.max_tokens = 512
    if int(getattr(settings, "api_max_tokens", 0) or 0) == 220:
        settings.api_max_tokens = 512
    if not str(getattr(settings, "api_llm_url", "") or "").strip():
        settings.api_llm_url = DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL
    if not str(getattr(settings, "api_llm_model", "") or "").strip():
        settings.api_llm_model = DEFAULT_API_LLM_MODEL
    if not str(getattr(settings, "sticker_vision_url", "") or "").strip():
        settings.sticker_vision_url = DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL
    if not str(getattr(settings, "sticker_vision_model", "") or "").strip():
        settings.sticker_vision_model = DEFAULT_STICKER_VISION_MODEL
    if not str(getattr(settings, "api_asr_url", "") or "").strip():
        settings.api_asr_url = DEFAULT_OPENAI_TRANSCRIPTIONS_URL
    if not str(getattr(settings, "api_asr_model", "") or "").strip():
        settings.api_asr_model = "gpt-4o-mini-transcribe"
    if not str(getattr(settings, "api_tts_url", "") or "").strip():
        settings.api_tts_url = DEFAULT_OPENAI_TTS_URL
    if not str(getattr(settings, "api_tts_model", "") or "").strip():
        settings.api_tts_model = "gpt-4o-mini-tts"
    if str(getattr(settings, "api_asr_provider", "") or "") == "dashscope" and "services/audio/asr/transcription" in str(getattr(settings, "api_asr_url", "") or ""):
        settings.api_asr_url = DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL
        if str(getattr(settings, "api_asr_model", "") or "").startswith("paraformer"):
            settings.api_asr_model = "qwen3-asr-flash"
    if str(getattr(settings, "api_tts_provider", "") or "") == "dashscope" and not str(getattr(settings, "api_tts_url", "") or "").strip():
        settings.api_tts_url = DEFAULT_DASHSCOPE_MULTIMODAL_URL


def save_persisted_settings(settings: SessionSettings, path: Path) -> None:
    payload = asdict(settings)
    write_json_file(path, payload)
    try:
        verified = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"settings save verification failed for {path}: {exc}") from exc
    if verified != payload:
        raise RuntimeError(f"settings save verification failed for {path}: saved payload differs from memory")


def mask_secret(value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    if len(value) <= 10:
        return f"{value[:3]}{MASKED_SECRET_CHARS * 8}"
    return f"{value[:7]}{MASKED_SECRET_CHARS * 23}{value[-4:]}"


def public_settings(settings: SessionSettings) -> dict:
    data = asdict(settings)
    api_key = str(data.pop("llm_api_key", "") or "")
    remote_api_key = str(data.pop("api_llm_api_key", "") or "")
    api_asr_api_key = str(data.pop("api_asr_api_key", "") or "")
    api_tts_api_key = str(data.pop("api_tts_api_key", "") or "")
    sticker_vision_api_key = str(data.pop("sticker_vision_api_key", "") or "")
    data["llm_api_key"] = ""
    data["llm_api_key_set"] = bool(api_key.strip())
    data["llm_api_key_masked"] = mask_secret(api_key)
    data["api_llm_api_key"] = ""
    data["api_llm_api_key_set"] = bool(remote_api_key.strip())
    data["api_llm_api_key_masked"] = mask_secret(remote_api_key)
    data["api_asr_api_key"] = ""
    data["api_asr_api_key_set"] = bool(api_asr_api_key.strip())
    data["api_asr_api_key_masked"] = mask_secret(api_asr_api_key)
    data["api_tts_api_key"] = ""
    data["api_tts_api_key_set"] = bool(api_tts_api_key.strip())
    data["api_tts_api_key_masked"] = mask_secret(api_tts_api_key)
    data["sticker_vision_api_key"] = ""
    data["sticker_vision_api_key_set"] = bool(sticker_vision_api_key.strip())
    data["sticker_vision_api_key_masked"] = mask_secret(sticker_vision_api_key)
    return data


def update_llm_api_key(settings: SessionSettings, payload: dict) -> None:
    update_secret_field(settings, payload, "llm_api_key")
    update_secret_field(settings, payload, "api_llm_api_key")
    update_secret_field(settings, payload, "sticker_vision_api_key")


def update_audio_api_keys(settings: SessionSettings, payload: dict) -> None:
    update_secret_field(settings, payload, "api_asr_api_key")
    update_secret_field(settings, payload, "api_tts_api_key")


def update_secret_field(settings: SessionSettings, payload: dict, key: str) -> None:
    if key not in payload:
        return
    raw = payload.pop(key)
    if raw is None:
        return
    value = str(raw).strip()
    if not value or MASKED_SECRET_CHARS in value:
        return
    setattr(settings, key, value)


def active_dialog_mode(settings: SessionSettings) -> str:
    return "api" if str(getattr(settings, "dialog_mode", "local")) == "api" else "local"


def memory_mode(settings: SessionSettings) -> str:
    return active_dialog_mode(settings)


def active_llm_url(settings: SessionSettings) -> str:
    if active_dialog_mode(settings) == "api":
        return settings.api_llm_url or settings.llm_url
    return settings.llm_url


def active_llm_model(settings: SessionSettings) -> str:
    if active_dialog_mode(settings) == "api":
        return settings.api_llm_model or settings.llm_model
    return settings.llm_model


def active_llm_api_key(settings: SessionSettings) -> str:
    if active_dialog_mode(settings) == "api":
        return settings.api_llm_api_key
    return settings.llm_api_key


def active_temperature(settings: SessionSettings) -> float:
    if active_dialog_mode(settings) == "api":
        return float(settings.api_temperature)
    return float(settings.temperature)


def active_max_tokens(settings: SessionSettings) -> int:
    if active_dialog_mode(settings) == "api":
        return int(settings.api_max_tokens)
    return int(settings.max_tokens)


def active_history_turns(settings: SessionSettings) -> int:
    if active_dialog_mode(settings) == "api":
        return int(settings.api_history_turns)
    return int(settings.history_turns)


def llm_headers(settings: SessionSettings) -> dict[str, str]:
    api_key = str(active_llm_api_key(settings) or "").strip()
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}


def active_asr_provider_mode(settings: SessionSettings) -> str:
    return "api" if str(getattr(settings, "asr_provider_mode", "local")) == "api" else "local"


def active_asr_provider(settings: SessionSettings) -> str:
    if active_asr_provider_mode(settings) == "api":
        return normalize_provider(getattr(settings, "api_asr_provider", "openai"), {"openai", "dashscope", "deepgram", "groq", "custom_openai"}, "openai")
    return "local"


def active_asr_url(settings: SessionSettings) -> str:
    if active_asr_provider_mode(settings) == "api":
        return str(getattr(settings, "api_asr_url", "") or settings.asr_url)
    return settings.asr_url


def active_asr_model(settings: SessionSettings) -> str:
    if active_asr_provider_mode(settings) == "api":
        return str(getattr(settings, "api_asr_model", "") or settings.asr_model)
    return settings.asr_model


def active_asr_api_key(settings: SessionSettings) -> str:
    if active_asr_provider_mode(settings) == "api":
        return str(getattr(settings, "api_asr_api_key", "") or "")
    return ""


def active_asr_timeout(settings: SessionSettings) -> float:
    if active_asr_provider_mode(settings) == "api":
        return float(getattr(settings, "api_asr_timeout", settings.asr_timeout) or settings.asr_timeout)
    return float(settings.asr_timeout)


def active_tts_provider_mode(settings: SessionSettings) -> str:
    return "api" if str(getattr(settings, "tts_provider_mode", "local")) == "api" else "local"


def active_tts_provider(settings: SessionSettings) -> str:
    if active_tts_provider_mode(settings) == "api":
        return normalize_provider(getattr(settings, "api_tts_provider", "openai"), {"openai", "dashscope", "elevenlabs", "custom_openai"}, "openai")
    return "local"


def active_tts_url(settings: SessionSettings) -> str:
    if active_tts_provider_mode(settings) == "api":
        return str(getattr(settings, "api_tts_url", "") or settings.tts_url)
    return settings.tts_url


def active_tts_model(settings: SessionSettings) -> str:
    if active_tts_provider_mode(settings) == "api":
        return str(getattr(settings, "api_tts_model", "") or getattr(settings, "tts_model", "cosyvoice"))
    return str(getattr(settings, "tts_model", "cosyvoice"))


def active_tts_api_key(settings: SessionSettings) -> str:
    if active_tts_provider_mode(settings) == "api":
        return str(getattr(settings, "api_tts_api_key", "") or "")
    return ""


def enable_default_capabilities(settings: SessionSettings) -> None:
    """Compatibility hook kept for older launch scripts.

    Defaults are already supplied by command-line arguments and persisted
    settings. This function must not overwrite saved user choices on restart.
    """
    return None


def add_settings_args(parser) -> None:
    parser.add_argument("--asr-provider-mode", choices=["local", "api"], default="local")
    parser.add_argument("--asr-mode", choices=["transcription", "chat"], default="transcription")
    parser.add_argument("--asr-url", default="http://127.0.0.1:8001/v1/audio/transcriptions")
    parser.add_argument("--asr-model", default="qwen3-asr")
    parser.add_argument("--asr-timeout", type=float, default=120)
    parser.add_argument("--asr-max-tokens", type=int, default=256)
    parser.add_argument("--api-asr-provider", choices=["openai", "dashscope", "deepgram", "groq", "custom_openai"], default="openai")
    parser.add_argument("--api-asr-url", default=os.environ.get("BRANCHWHISPER_API_ASR_URL", DEFAULT_OPENAI_TRANSCRIPTIONS_URL))
    parser.add_argument("--api-asr-model", default=os.environ.get("BRANCHWHISPER_API_ASR_MODEL", "gpt-4o-mini-transcribe"))
    parser.add_argument("--api-asr-api-key", default=os.environ.get("BRANCHWHISPER_API_ASR_API_KEY", ""))
    parser.add_argument("--api-asr-language", default="zh")
    parser.add_argument("--api-asr-timeout", type=float, default=60)

    parser.add_argument("--llm-url", default="http://127.0.0.1:8080/v1/chat/completions")
    parser.add_argument("--llm-model", default="qwen3.5-9b")
    parser.add_argument(
        "--llm-api-key",
        default=os.environ.get("BRANCHWHISPER_LLM_API_KEY", os.environ.get("BUDING_LLM_API_KEY", "")),
    )
    parser.add_argument("--dialog-mode", choices=["local", "api"], default="local")
    parser.add_argument("--api-llm-url", default=os.environ.get("BRANCHWHISPER_API_LLM_URL", DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL))
    parser.add_argument("--api-llm-model", default=os.environ.get("BRANCHWHISPER_API_LLM_MODEL", DEFAULT_API_LLM_MODEL))
    parser.add_argument("--api-llm-api-key", default=os.environ.get("BRANCHWHISPER_API_LLM_API_KEY", ""))
    parser.add_argument("--api-temperature", type=float, default=0.35)
    parser.add_argument("--api-max-tokens", type=int, default=512)
    parser.add_argument("--api-history-turns", type=int, default=8)
    parser.add_argument("--thinking-enabled", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--temperature", type=float, default=0.35)
    parser.add_argument("--max-tokens", type=int, default=512)
    parser.add_argument("--history-turns", type=int, default=8)
    parser.add_argument("--system", default=DEFAULT_SYSTEM)
    parser.add_argument("--ui-font-scale", type=float, default=1.0)
    parser.add_argument("--web-user-name", default="我")
    parser.add_argument("--web-user-avatar-url", default="")
    parser.add_argument("--web-assistant-name", default="枝语")
    parser.add_argument("--web-assistant-avatar-url", default="")

    parser.add_argument("--memory-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--memory-extract-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--memory-admission-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--memory-min-importance", type=float, default=0.55)
    parser.add_argument("--memory-short-to-mid-days", type=int, default=60)
    parser.add_argument("--memory-short-to-mid-count", type=int, default=3)
    parser.add_argument("--memory-mid-to-long-days", type=int, default=180)
    parser.add_argument("--memory-mid-to-long-count", type=int, default=5)
    parser.add_argument("--memory-short-delete-days", type=int, default=180)
    parser.add_argument("--memory-mid-downgrade-days", type=int, default=180)
    parser.add_argument("--memory-long-downgrade-days", type=int, default=365)
    parser.add_argument("--memory-max-context-items", type=int, default=12)

    parser.add_argument("--context-compaction-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--context-window-tokens", type=int, default=8192)
    parser.add_argument("--context-compaction-ratio", type=float, default=0.70)
    parser.add_argument("--context-keep-recent-turns", type=int, default=10)
    parser.add_argument("--context-summary-max-chars", type=int, default=1200)
    parser.add_argument("--context-summary-max-layers", type=int, default=3)

    parser.add_argument("--vision-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--vision-url", default="http://127.0.0.1:8081/v1/chat/completions")
    parser.add_argument("--vision-model", default="qwen-vl")
    parser.add_argument("--vision-timeout", type=float, default=45.0)
    parser.add_argument("--vision-max-image-mb", type=float, default=8.0)
    parser.add_argument("--vision-memory-extract-enabled", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--sticker-vision-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--sticker-vision-url", default=os.environ.get("BRANCHWHISPER_STICKER_VISION_URL", DEFAULT_DASHSCOPE_CHAT_COMPLETIONS_URL))
    parser.add_argument("--sticker-vision-model", default=os.environ.get("BRANCHWHISPER_STICKER_VISION_MODEL", DEFAULT_STICKER_VISION_MODEL))
    parser.add_argument("--sticker-vision-api-key", default="")
    parser.add_argument("--sticker-vision-timeout", type=float, default=45.0)
    parser.add_argument("--sticker-vision-max-tokens", type=int, default=420)

    parser.add_argument("--stickers-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--sticker-activity", choices=["off", "low", "standard", "active", "very_active", "custom"], default="active")
    parser.add_argument("--sticker-cooldown-sec", type=int, default=90)
    parser.add_argument("--sticker-daily-limit", type=int, default=60)
    parser.add_argument("--sticker-max-streak", type=int, default=2)
    parser.add_argument("--sticker-custom-probability", type=float, default=0.65)

    parser.add_argument("--tools-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--tools-auto-call", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--tools-timeout", type=float, default=12.0)
    parser.add_argument("--tools-max-result-chars", type=int, default=4000)

    parser.add_argument("--tts-provider-mode", choices=["local", "api"], default="local")
    parser.add_argument("--tts-model", default="cosyvoice")
    parser.add_argument("--tts-url", default="http://127.0.0.1:50000/tts")
    parser.add_argument("--tts-sample-rate", type=int, default=24000)
    parser.add_argument("--tts-speed", type=float, default=1.08)
    parser.add_argument("--tts-seed", type=int, default=42)
    parser.add_argument("--tts-volume", type=float, default=DEFAULT_TTS_VOLUME)
    parser.add_argument("--tts-fade-ms", type=int, default=DEFAULT_TTS_FADE_MS)
    parser.add_argument("--tts-enabled", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--api-tts-provider", choices=["openai", "dashscope", "elevenlabs", "custom_openai"], default="openai")
    parser.add_argument("--api-tts-url", default=os.environ.get("BRANCHWHISPER_API_TTS_URL", DEFAULT_OPENAI_TTS_URL))
    parser.add_argument("--api-tts-model", default=os.environ.get("BRANCHWHISPER_API_TTS_MODEL", "gpt-4o-mini-tts"))
    parser.add_argument("--api-tts-api-key", default=os.environ.get("BRANCHWHISPER_API_TTS_API_KEY", ""))
    parser.add_argument("--api-tts-voice-mode", choices=["builtin", "cloned", "manual"], default="builtin")
    parser.add_argument("--api-tts-voice", default="coral")
    parser.add_argument("--api-tts-voice-id", default="")
    parser.add_argument("--api-tts-voice-name", default="")
    parser.add_argument("--api-tts-voice-profile-id", default="")
    parser.add_argument("--api-tts-instructions", default="自然、亲近、像微信语音，不要播音腔。")
    parser.add_argument("--api-tts-format", choices=["pcm", "wav", "mp3"], default="pcm")
    parser.add_argument("--api-tts-sample-rate", type=int, default=24000)
    parser.add_argument("--api-tts-speed", type=float, default=1.0)
    parser.add_argument("--api-tts-latency-mode", choices=["quality", "balanced", "fast"], default="balanced")

    parser.add_argument("--vad-device", choices=["cpu", "cuda", "auto"], default="cpu")
    parser.add_argument("--vad-threshold", type=float, default=0.50)
    parser.add_argument("--vad-min-silence-ms", type=int, default=350)
    parser.add_argument("--vad-speech-pad-ms", type=int, default=120)
    parser.add_argument("--pre-speech-ms", type=int, default=250)
    parser.add_argument("--min-utterance-ms", type=int, default=250)
    parser.add_argument("--max-utterance-sec", type=float, default=15.0)
