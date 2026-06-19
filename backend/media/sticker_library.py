from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any

from core.io_utils import write_json_file
from media.assets import normalize_channel, normalize_channels, safe_tag
from media.sticker_processing import ProcessedStickerImage, save_sticker_image
from media.sticker_vision import default_sticker_analysis, normalize_analysis


APPROVED_STATUS = "approved"
PENDING_STATUS = "pending"
FAILED_STATUS = "failed"
DISABLED_STATUS = "disabled"
REVIEW_STATUSES = {APPROVED_STATUS, PENDING_STATUS, FAILED_STATUS, DISABLED_STATUS}
TAG_ALIASES = {
    "挑衅": ["挑衅", "打一架", "打架", "想打", "单挑", "欠揍", "不服"],
    "互怼": ["互怼", "怼", "骂", "阴阳怪气", "欠欠", "sb", "傻", "笨"],
    "开心": ["开心", "哈哈", "笑死", "好笑", "绷不住", "乐", "搞笑", "可爱", "萌", "微笑", "cute", "smug"],
    "无语": ["无语", "离谱", "服了", "尴尬", "沉默", "无奈", "silent", "reject"],
    "安慰": ["安慰", "抱抱", "委屈", "难受", "心疼", "治愈", "泪眼", "sad", "撒娇"],
    "疑惑": ["疑惑", "什么", "为啥", "为什么", "真的假的", "懵", "看不见", "confused"],
    "鼓励": ["鼓励", "加油", "打气", "稳住", "冲呀"],
    "撒娇": ["撒娇", "贴贴", "求关注", "抱抱", "想你", "cute", "萌"],
    "早安": ["早安", "早上好", "起床", "可爱", "cute"],
    "晚安": ["晚安", "睡觉", "困", "可爱", "sad", "cute"],
    "吃饭": ["吃饭", "干饭", "美食", "香喝辣", "奶茶", "馋"],
}
TAG_FALLBACK_EMOTIONS = {
    "开心": {"cute", "smug"},
    "安慰": {"sad", "cute"},
    "疑惑": {"confused", "shock"},
    "无语": {"silent", "reject", "confused"},
    "挑衅": {"angry", "smug"},
    "互怼": {"angry", "smug"},
    "鼓励": {"cute"},
    "撒娇": {"cute", "sad"},
    "早安": {"cute"},
    "晚安": {"cute", "sad"},
    "吃饭": {"smug", "cute"},
}


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def public_runtime_path(path: Path) -> str:
    parts = path.as_posix().split("/runtime/", 1)
    return f"/runtime/{parts[1]}" if len(parts) == 2 else str(path)


def emotion_prefix(value: str) -> str:
    value = re.sub(r"[^0-9a-zA-Z_\-]", "", str(value or "").lower())
    return value or "sticker"


def sticker_display_name(analysis: dict, fallback: str = "") -> str:
    return sticker_semantic_name(analysis, fallback=fallback, existing_names=set())


def clean_name_part(value: str, fallback: str = "素材") -> str:
    text = re.sub(r"\s+", "", str(value or "").strip(" _-，。！？!?"))
    text = re.sub(r"[^0-9A-Za-z_\-\u4e00-\u9fff]+", "", text)
    return (text[:12] or fallback)[:12]


def first_semantic_value(values: list[str], blocked: set[str]) -> str:
    for value in values:
        text = clean_name_part(value, "")
        if text and text.lower() not in blocked:
            return text
    return ""


def sticker_semantic_name(analysis: dict, fallback: str = "", existing_names: set[str] | None = None) -> str:
    tags = [str(item).strip() for item in analysis.get("tags") or [] if str(item).strip()]
    scene = [str(item).strip() for item in analysis.get("scene") or [] if str(item).strip()]
    caption = str(analysis.get("caption") or "").strip()
    ocr_text = str(analysis.get("ocr_text") or "").strip()
    emotion = clean_name_part(str(analysis.get("emotion") or ""), "")
    blocked = {"表情包", "素材", "图片", "默认", "sticker", "laugh", "cute", "smug", "angry", "sad", "shock"}
    subject = first_semantic_value([*tags, *scene, caption, ocr_text, fallback], blocked) or "素材"
    feature = first_semantic_value([emotion, *scene, *tags, caption, ocr_text], {subject.lower(), *blocked}) or "未识别"
    base = f"表情包_{subject}_{feature}"
    existing_names = existing_names or set()
    for index in range(1, 10000):
        candidate = f"{base}_{index:03d}"
        if candidate not in existing_names:
            return candidate[:80]
    return f"{base}_{uuid.uuid4().hex[:6]}"[:80]


def clean_display_name(value: str, fallback: str = "未分类_素材") -> str:
    text = re.sub(r"\s+", "", str(value or "").strip(" _-，。！？!?"))
    text = re.sub(r"[^0-9A-Za-z_\-\u4e00-\u9fff]+", "", text)
    return text[:64] or fallback


def unique_sticker_name(name: str, existing_names: set[str] | None = None) -> str:
    base = clean_display_name(name)
    existing_names = existing_names or set()
    if base not in existing_names:
        return base[:80]
    for index in range(2, 10000):
        candidate = f"{base}_{index:03d}"
        if candidate not in existing_names:
            return candidate[:80]
    return f"{base}_{uuid.uuid4().hex[:6]}"[:80]


def sticker_file_stem(sticker_id: str, analysis: dict, fallback: str = "") -> str:
    emotion = emotion_prefix(str(analysis.get("emotion") or "sticker"))
    candidates = []
    candidates.extend(str(item).strip() for item in analysis.get("tags") or [] if str(item).strip())
    candidates.extend(str(item).strip() for item in analysis.get("scene") or [] if str(item).strip())
    caption = str(analysis.get("caption") or "").strip()
    if caption:
        candidates.append(caption)
    if fallback:
        candidates.append(fallback)
    semantic = next((item for item in candidates if item), sticker_id)
    semantic = re.sub(r"\s+", "-", semantic)
    semantic = re.sub(r"[^0-9A-Za-z_\-\u4e00-\u9fff]+", "", semantic)[:24] or sticker_id
    return f"{emotion}_{semantic}_{sticker_id}"


class StickerLibrary:
    def __init__(
        self,
        *,
        index_path: Path,
        original_dir: Path,
        processed_dir: Path,
        send_dir: Path,
        thumbnail_dir: Path,
    ) -> None:
        self.index_path = index_path
        self.original_dir = original_dir
        self.processed_dir = processed_dir
        self.send_dir = send_dir
        self.thumbnail_dir = thumbnail_dir
        for path in (index_path.parent, original_dir, processed_dir, send_dir, thumbnail_dir):
            path.mkdir(parents=True, exist_ok=True)
        if not index_path.exists():
            self.save([])

    def list(self, *, status: str = "", emotion: str = "", query: str = "") -> list[dict]:
        items = self.load()
        status = str(status or "").strip()
        emotion = str(emotion or "").strip()
        query = str(query or "").strip().lower()
        if status:
            items = [item for item in items if item.get("review_status") == status]
        if emotion:
            items = [item for item in items if item.get("emotion") == emotion]
        if query:
            items = [item for item in items if query in self.search_blob(item)]
        return items

    def load(self) -> list[dict]:
        try:
            data = json.loads(self.index_path.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                return []
        except Exception:
            return []
        return [self.normalize(item) for item in data if isinstance(item, dict)]

    def save(self, items: list[dict]) -> None:
        write_json_file(self.index_path, [self.normalize(item) for item in items])

    def normalize(self, item: dict[str, Any]) -> dict:
        status = str(item.get("review_status") or (APPROVED_STATUS if item.get("legacy_approved") else PENDING_STATUS))
        if status not in REVIEW_STATUSES:
            status = PENDING_STATUS
        enabled = item.get("enabled") is not False and status == APPROVED_STATUS
        tags = self.normalize_text_list(item.get("tags") or ([item.get("tag")] if item.get("tag") else []))
        scene = self.normalize_text_list(item.get("scene"))
        avoid = self.normalize_text_list(item.get("avoid"))
        return {
            "id": str(item.get("id") or f"stk_{uuid.uuid4().hex[:12]}"),
            "name": str(item.get("name") or item.get("id") or "表情包")[:80],
            "tag": safe_tag(str(item.get("tag") or (tags[0] if tags else item.get("emotion") or "默认"))),
            "emotion": emotion_prefix(str(item.get("emotion") or item.get("tag") or "laugh")),
            "intensity": max(1, min(5, int(item.get("intensity") or 3))),
            "tags": tags,
            "scene": scene,
            "avoid": avoid,
            "caption": str(item.get("caption") or "")[:360],
            "ocr_text": str(item.get("ocr_text") or "")[:240],
            "description": str(item.get("description") or "")[:360],
            "confidence": float(item.get("confidence") or 0.0),
            "source_hash": str(item.get("source_hash") or ""),
            "mime": str(item.get("mime") or "image/png"),
            "file_stem": str(item.get("file_stem") or ""),
            "original_name": str(item.get("original_name") or ""),
            "file": str(item.get("file") or item.get("url") or ""),
            "path": str(item.get("path") or ""),
            "send_file": str(item.get("send_file") or item.get("path") or ""),
            "send_path": str(item.get("send_path") or item.get("path") or ""),
            "thumbnail": str(item.get("thumbnail") or item.get("url") or ""),
            "thumbnail_path": str(item.get("thumbnail_path") or ""),
            "original_file": str(item.get("original_file") or ""),
            "original_path": str(item.get("original_path") or ""),
            "url": str(item.get("url") or item.get("thumbnail") or item.get("file") or ""),
            "review_status": status,
            "enabled": enabled,
            "channels": normalize_channels(item.get("channels") or "all"),
            "error": str(item.get("error") or "")[:500],
            "created_at": str(item.get("created_at") or now_text()),
            "updated_at": str(item.get("updated_at") or ""),
            "last_used_at": str(item.get("last_used_at") or ""),
            "use_count": int(item.get("use_count") or 0),
        }

    def normalize_text_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip()[:40] for item in value if str(item).strip()][:10]
        if isinstance(value, str) and value.strip():
            return [item.strip()[:40] for item in re.split(r"[,，/、\s]+", value) if item.strip()][:10]
        return []

    def search_blob(self, item: dict) -> str:
        return " ".join(
            [
                str(item.get("name") or ""),
                str(item.get("tag") or ""),
                str(item.get("emotion") or ""),
                str(item.get("caption") or ""),
                str(item.get("ocr_text") or ""),
                " ".join(item.get("tags") or []),
                " ".join(item.get("scene") or []),
            ]
        ).lower()

    def find_by_hash(self, source_hash: str) -> dict | None:
        source_hash = str(source_hash or "")
        if not source_hash:
            return None
        return next((item for item in self.load() if item.get("source_hash") == source_hash), None)

    def create_pending(
        self,
        *,
        processed: ProcessedStickerImage,
        analysis: dict | None = None,
        channels: str | list[str] = "all",
        name: str = "",
        error: str = "",
    ) -> dict:
        analysis = normalize_analysis(analysis or default_sticker_analysis())
        sticker_id = self.next_id(analysis["emotion"])
        item = {
            "id": sticker_id,
            "name": name or sticker_id,
            "tag": analysis["tags"][0] if analysis["tags"] else analysis["emotion"],
            "emotion": analysis["emotion"],
            "intensity": analysis["intensity"],
            "tags": analysis["tags"],
            "scene": analysis["scene"],
            "avoid": analysis["avoid"],
            "caption": analysis["caption"],
            "ocr_text": analysis["ocr_text"],
            "description": analysis["description"],
            "confidence": analysis["confidence"],
            "source_hash": processed.source_hash,
            "mime": processed.mime,
            "file": public_runtime_path(processed.processed_path),
            "path": str(processed.processed_path),
            "send_file": public_runtime_path(processed.send_path),
            "send_path": str(processed.send_path),
            "thumbnail": public_runtime_path(processed.thumbnail_path),
            "thumbnail_path": str(processed.thumbnail_path),
            "original_file": public_runtime_path(processed.original_path),
            "original_path": str(processed.original_path),
            "url": public_runtime_path(processed.thumbnail_path),
            "review_status": FAILED_STATUS if error else PENDING_STATUS,
            "enabled": False,
            "channels": normalize_channels(channels),
            "error": error,
            "created_at": now_text(),
            "updated_at": now_text(),
        }
        items = self.load()
        items.insert(0, item)
        self.save(items)
        return self.normalize(item)

    def next_id(self, emotion: str) -> str:
        prefix = emotion_prefix(emotion)
        used = {item.get("id") for item in self.load()}
        for index in range(1, 10000):
            candidate = f"{prefix}_{index:03d}"
            if candidate not in used:
                return candidate
        return f"{prefix}_{uuid.uuid4().hex[:8]}"

    def add_upload(self, *, data_url: str, name: str = "", channels: str | list[str] = "all", analysis: dict | None = None, error: str = "") -> dict:
        processed = save_sticker_image(
            data_url=data_url,
            original_dir=self.original_dir,
            processed_dir=self.processed_dir,
            send_dir=self.send_dir,
            thumbnail_dir=self.thumbnail_dir,
            name_hint=name,
        )
        duplicate = self.find_by_hash(processed.source_hash)
        if duplicate:
            return {**duplicate, "duplicate": True}
        return self.create_pending(processed=processed, analysis=analysis, channels=channels, name=name, error=error)

    def unclassified_name(self) -> str:
        existing_names = {str(item.get("name") or "") for item in self.load()}
        return unique_sticker_name(f"未分类_素材_{time.strftime('%Y%m%d_%H%M%S')}", existing_names)

    def update(self, sticker_id: str, patch: dict) -> dict:
        items = self.load()
        for index, item in enumerate(items):
            if item.get("id") != sticker_id:
                continue
            sanitized = self.sanitize_patch(patch)
            if "name" in sanitized:
                existing_names = {str(existing.get("name") or "") for existing in items if existing.get("id") != sticker_id}
                sanitized["name"] = unique_sticker_name(str(sanitized.get("name") or ""), existing_names)
            updated = {**item, **sanitized, "updated_at": now_text()}
            items[index] = self.normalize(updated)
            self.save(items)
            return items[index]
        raise KeyError(sticker_id)

    def sanitize_patch(self, patch: dict) -> dict:
        allowed = {
            "name",
            "tag",
            "emotion",
            "intensity",
            "tags",
            "scene",
            "avoid",
            "caption",
            "ocr_text",
            "description",
            "confidence",
            "review_status",
            "enabled",
            "channels",
            "error",
            "file_stem",
            "original_name",
        }
        return {key: value for key, value in (patch or {}).items() if key in allowed}

    def rename_files(self, sticker: dict, stem: str) -> dict:
        stem = re.sub(r"\s+", "-", str(stem or "").strip())
        stem = re.sub(r"[^0-9A-Za-z_\-\u4e00-\u9fff]+", "", stem)[:80]
        if not stem:
            return sticker
        updates: dict[str, str] = {"file_stem": stem}
        path_pairs = (
            ("original_path", "original_file"),
            ("path", "file"),
            ("send_path", "send_file"),
            ("thumbnail_path", "thumbnail"),
        )
        for path_key, public_key in path_pairs:
            current = Path(str(sticker.get(path_key) or ""))
            if not current.exists():
                continue
            target = current.with_name(f"{stem}{current.suffix}")
            if target == current:
                continue
            counter = 2
            while target.exists():
                target = current.with_name(f"{stem}_{counter}{current.suffix}")
                counter += 1
            current.rename(target)
            updates[path_key] = str(target)
            updates[public_key] = public_runtime_path(target)
        if updates.get("thumbnail"):
            updates["url"] = updates["thumbnail"]
        elif updates.get("file"):
            updates["url"] = updates["file"]
        items = self.load()
        sticker_id = str(sticker.get("id") or "")
        for index, item in enumerate(items):
            if item.get("id") == sticker_id:
                items[index] = self.normalize({**item, **updates, "updated_at": now_text()})
                self.save(items)
                return items[index]
        raise KeyError(sticker_id)

    def apply_analysis(self, sticker_id: str, analysis: dict, *, name: str = "", error: str = "") -> dict:
        normalized = normalize_analysis(analysis or default_sticker_analysis())
        current = next((item for item in self.load() if item.get("id") == sticker_id), None)
        if not current:
            raise KeyError(sticker_id)
        existing_names = {str(item.get("name") or "") for item in self.load() if item.get("id") != sticker_id}
        display_name = name or sticker_semantic_name(normalized, current.get("name") or sticker_id, existing_names)
        updated = self.update(
            sticker_id,
            {
                **normalized,
                "name": display_name,
                "tag": normalized["tags"][0] if normalized["tags"] else normalized["emotion"],
                "review_status": PENDING_STATUS,
                "enabled": False,
                "error": error,
                "original_name": current.get("original_name") or current.get("name") or "",
            },
        )
        return self.rename_files(updated, sticker_file_stem(sticker_id, normalized, display_name))

    def approve(self, sticker_id: str) -> dict:
        return self.update(sticker_id, {"review_status": APPROVED_STATUS, "enabled": True, "error": ""})

    def delete(self, sticker_id: str) -> bool:
        items = self.load()
        target = next((item for item in items if item.get("id") == sticker_id), None)
        if not target:
            return False
        for key in ("path", "send_path", "thumbnail_path"):
            try:
                Path(target.get(key) or "").unlink(missing_ok=True)
            except OSError:
                pass
        self.save([item for item in items if item.get("id") != sticker_id])
        return True

    def choose(self, tag: str = "", avoid_id: str = "", channel: str = "web", *, allow_fallback: bool = False) -> dict | None:
        channel = normalize_channel(channel)
        items = [
            item
            for item in self.load()
            if item.get("enabled") and item.get("review_status") == APPROVED_STATUS and self.channel_matches(item, channel)
        ]
        if tag:
            matched_items = [item for item in items if item.get("id") != avoid_id and self.match_score(item, tag) > 0]
            if matched_items:
                items = matched_items
            elif allow_fallback:
                fallback_items = [item for item in items if item.get("id") != avoid_id]
                items = fallback_items
            else:
                items = []
        else:
            items = [item for item in items if item.get("id") != avoid_id]
        if not items:
            return None
        items.sort(key=lambda item: (-self.selection_score(item, tag, allow_fallback=allow_fallback), int(item.get("use_count") or 0), item.get("last_used_at") or "", item.get("id") or ""))
        return items[0]

    def channel_matches(self, item: dict, channel: str) -> bool:
        channels = item.get("channels") or []
        return "all" in channels or channel in channels

    def selection_score(self, item: dict, tag: str, *, allow_fallback: bool = False) -> int:
        score = self.match_score(item, tag)
        if score or not allow_fallback or not tag:
            return score or 1
        emotion = str(item.get("emotion") or "").lower()
        if emotion in TAG_FALLBACK_EMOTIONS.get(str(tag or "").strip(), set()):
            score += 2
        return score or 1

    def match_score(self, item: dict, tag: str) -> int:
        tag = str(tag or "").strip()
        if not tag:
            return 1
        aliases = [tag, *TAG_ALIASES.get(tag, [])]
        haystack_parts = [
            item.get("tag"),
            item.get("emotion"),
            item.get("name"),
            item.get("caption"),
            item.get("ocr_text"),
            " ".join(str(x) for x in item.get("tags", []) if x),
            " ".join(str(x) for x in item.get("scene", []) if x),
            item.get("description") if not isinstance(item.get("description"), list) else " ".join(str(x) for x in item.get("description", []) if x),
        ]
        haystack = " ".join(str(x or "") for x in haystack_parts).lower()
        score = 0
        if str(item.get("tag") or "") == tag or str(item.get("emotion") or "") == tag:
            score += 6
        for alias in aliases:
            alias = str(alias or "").strip().lower()
            if alias and alias in haystack:
                score += 3 if len(alias) > 1 else 1
        return score

    def selection_diagnostics(self, tag: str = "", channel: str = "web") -> dict:
        channel = normalize_channel(channel)
        loaded = self.load()
        approved = [item for item in loaded if item.get("review_status") == APPROVED_STATUS]
        enabled = [item for item in approved if item.get("enabled")]
        channel_items = [item for item in enabled if self.channel_matches(item, channel)]
        tag = str(tag or "").strip()
        matched = [item for item in channel_items if not tag or self.match_score(item, tag) > 0]
        examples = sorted(
            channel_items,
            key=lambda item: (-self.selection_score(item, tag, allow_fallback=True), int(item.get("use_count") or 0), item.get("last_used_at") or ""),
        )[:5]
        if not loaded:
            reason = "empty_library"
        elif not approved:
            reason = "no_approved"
        elif not enabled:
            reason = "no_enabled"
        elif not channel_items:
            reason = "channel_mismatch"
        elif tag and not matched:
            reason = "tag_mismatch"
        else:
            reason = "ok"
        return {
            "reason": reason,
            "tag": tag,
            "channel": channel,
            "total": len(loaded),
            "approved": len(approved),
            "enabled": len(enabled),
            "channel_candidates": len(channel_items),
            "tag_matches": len(matched),
            "examples": [
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "tag": item.get("tag"),
                    "emotion": item.get("emotion"),
                    "score": self.match_score(item, tag),
                }
                for item in examples
            ],
        }

    def mark_used(self, sticker_id: str) -> dict | None:
        items = self.load()
        found = None
        for item in items:
            if item.get("id") == sticker_id:
                item["last_used_at"] = now_text()
                item["use_count"] = int(item.get("use_count") or 0) + 1
                found = item
                break
        if found:
            self.save(items)
        return found

    def mark_used_many(self, sticker_ids: list[str]) -> list[dict]:
        changed = []
        for sticker_id in sticker_ids:
            item = self.mark_used(str(sticker_id or ""))
            if item:
                changed.append(item)
        return changed
