from __future__ import annotations

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


DEFAULT_PROACTIVE_CONFIG: dict[str, Any] = {
    "enabled": False,
    "ask_followup_enabled": True,
    "followup_level": "restrained",
    "quiet_hours_enabled": True,
    "quiet_start": "23:00",
    "quiet_end": "08:00",
    "daily_limit": 3,
    "channels": {"web": True, "weixin": False},
    "tone": "warm",
    "greetings": {
        "enabled": False,
        "good_morning": {
            "enabled": True,
            "window_start": "07:00",
            "window_end": "09:30",
            "with_weather": True,
            "with_reminders": True,
            "message": "",
        },
        "noon": {
            "enabled": False,
            "window_start": "12:00",
            "window_end": "13:30",
            "with_weather": False,
            "with_reminders": True,
            "message": "",
        },
        "good_night": {
            "enabled": False,
            "window_start": "22:00",
            "window_end": "23:20",
            "with_weather": False,
            "with_reminders": False,
            "message": "",
        },
        "long_absence": {"enabled": False, "after_hours": 48},
    },
    "triggers": {
        "reminders": True,
        "service_alerts": True,
        "weather": True,
        "news_watch": False,
        "emotion_care": False,
        "long_goal_followup": False,
    },
}


FOLLOWUP_RULES = [
    {
        "id": "missing_weather_city",
        "keywords": ("天气", "下雨", "气温", "温度"),
        "missing_patterns": ("天气", "下雨", "气温", "温度", "今天", "现在", "查一下", "怎么样", "如何"),
        "question": "你想查哪个城市？",
    },
    {
        "id": "missing_reminder_time",
        "keywords": ("提醒", "叫我", "记得"),
        "requires_time": True,
        "question": "你想让我什么时候提醒？",
    },
    {
        "id": "missing_route_point",
        "keywords": ("怎么走", "路线", "导航", "到", "去"),
        "requires_route": True,
        "question": "你想从哪里出发，到哪里去？",
    },
    {
        "id": "missing_recipient",
        "keywords": ("发给", "告诉他", "告诉她", "转发"),
        "requires_recipient": True,
        "question": "你想发给谁？",
    },
    {
        "id": "dangerous_confirm",
        "keywords": ("删除", "清空", "覆盖", "重置", "停用"),
        "question": "这个操作会改动现有数据，你确认要继续吗？",
    },
]

GREETING_MESSAGE_POOLS: dict[str, list[str]] = {
    "good_morning": [
        "醒啦？",
        "早。",
        "起了没？",
        "早啊，还困吗？",
        "醒了就吱一声。",
        "早，别赖太久。",
        "起床了吗？",
        "早饭别省。",
        "今天开机了吗？",
        "早。先缓一下。",
    ],

    "noon": [
        "吃饭没？",
        "中午了。",
        "该吃饭了。",
        "上午还行吗？",
        "先去吃点东西。",
        "吃饭吃饭。",
        "中午歇会儿。",
        "现在能喘口气了吗？",
        "饭点到了。",
    ],

    "good_night": [
        "该睡了。",
        "别刷了，睡觉。",
        "晚安。",
        "手机放下。",
        "今天先这样吧。",
        "困了就别硬撑。",
        "睡吧，明天再说。",
        "别熬太晚。",
        "去睡觉。",
        "晚安，别想太多。",
    ],

    "long_absence": [
        "人呢？",
        "忙完没？",
        "还在吗？",
        "今天怎么样？",
        "怎么没声了。",
        "你那边还好吗？",
        "冒个泡。",
        "刚想起来看看你。",
        "在忙还是在发呆？",
        "有空说句话。",
    ],
}

def deep_merge(base: dict, patch: dict) -> dict:
    result = dict(base)
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def today_text() -> str:
    return time.strftime("%Y-%m-%d")


def compact(text: str, limit: int = 240) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "..."


def parse_clock(value: str) -> tuple[int, int]:
    parts = str(value or "00:00").split(":", 1)
    try:
        hour = max(0, min(23, int(parts[0])))
        minute = max(0, min(59, int(parts[1] if len(parts) > 1 else 0)))
    except ValueError:
        return (0, 0)
    return hour, minute


def date_text(value: datetime | None = None) -> str:
    return (value or datetime.now()).strftime("%Y-%m-%d")


def datetime_text(value: datetime | None = None) -> str:
    return (value or datetime.now()).strftime("%Y-%m-%d %H:%M:%S")


def parse_datetime_text(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def in_time_window(now: datetime, start: str, end: str) -> bool:
    sh, sm = parse_clock(start)
    eh, em = parse_clock(end)
    current = now.hour * 60 + now.minute
    begin = sh * 60 + sm
    finish = eh * 60 + em
    if begin <= finish:
        return begin <= current <= finish
    return current >= begin or current <= finish


def daily_choice(values: list[str], key: str, now: datetime | None = None) -> str:
    if not values:
        return ""
    day = date_text(now)
    seed = sum(ord(ch) for ch in f"{key}:{day}")
    return values[seed % len(values)]


class ProactiveStore:
    def __init__(self, config_path: Path, db_path: Path):
        self.config_path = config_path
        self.db_path = db_path
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.config_path.exists():
            self.save_config(DEFAULT_PROACTIVE_CONFIG)
        self.init_db()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    @contextmanager
    def session(self):
        conn = self.connect()
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init_db(self) -> None:
        with self.session() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS proactive_events (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'web',
                    status TEXT NOT NULL DEFAULT 'pending',
                    conversation_id TEXT NOT NULL DEFAULT '',
                    platform_id TEXT NOT NULL DEFAULT '',
                    sender_id TEXT NOT NULL DEFAULT '',
                    due_at TEXT NOT NULL DEFAULT '',
                    fired_at TEXT NOT NULL DEFAULT '',
                    last_error TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def load_config(self) -> dict:
        try:
            data = json.loads(self.config_path.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        return deep_merge(DEFAULT_PROACTIVE_CONFIG, data)

    def public_config(self) -> dict:
        return self.load_config()

    def save_config(self, data: dict) -> dict:
        payload = deep_merge(DEFAULT_PROACTIVE_CONFIG, data or {})
        tmp = self.config_path.with_suffix(self.config_path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.config_path)
        return payload

    def update_config(self, patch: dict) -> dict:
        return self.save_config(deep_merge(self.load_config(), patch or {}))

    def list_events(self, status: str = "", limit: int = 80) -> list[dict]:
        query = "SELECT * FROM proactive_events"
        params: list[Any] = []
        if status:
            query += " WHERE status=?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(max(1, min(200, int(limit))))
        with self.session() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def create_event(self, payload: dict) -> dict:
        now = now_text()
        item = {
            "id": uuid.uuid4().hex[:12],
            "kind": str(payload.get("kind") or "manual"),
            "title": compact(str(payload.get("title") or "主动消息"), 120),
            "content": compact(str(payload.get("content") or ""), 1000),
            "channel": str(payload.get("channel") or "web"),
            "status": str(payload.get("status") or "pending"),
            "conversation_id": str(payload.get("conversation_id") or ""),
            "platform_id": str(payload.get("platform_id") or ""),
            "sender_id": str(payload.get("sender_id") or ""),
            "due_at": str(payload.get("due_at") or now),
            "fired_at": str(payload.get("fired_at") or ""),
            "last_error": str(payload.get("last_error") or ""),
            "created_at": now,
            "updated_at": now,
        }
        with self.session() as conn:
            conn.execute(
                """
                INSERT INTO proactive_events (
                    id,kind,title,content,channel,status,conversation_id,platform_id,sender_id,
                    due_at,fired_at,last_error,created_at,updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                [
                    item["id"],
                    item["kind"],
                    item["title"],
                    item["content"],
                    item["channel"],
                    item["status"],
                    item["conversation_id"],
                    item["platform_id"],
                    item["sender_id"],
                    item["due_at"],
                    item["fired_at"],
                    item["last_error"],
                    item["created_at"],
                    item["updated_at"],
                ],
            )
        return item

    def update_event(self, event_id: str, patch: dict) -> dict | None:
        existing = self.get_event(event_id)
        if not existing:
            return None
        allowed = {"status", "last_error", "fired_at", "conversation_id"}
        item = dict(existing)
        for key in allowed:
            if key in patch:
                item[key] = str(patch[key])
        item["updated_at"] = now_text()
        with self.session() as conn:
            conn.execute(
                """
                UPDATE proactive_events SET status=?, last_error=?, fired_at=?, conversation_id=?, updated_at=?
                WHERE id=?
                """,
                [item["status"], item["last_error"], item["fired_at"], item["conversation_id"], item["updated_at"], event_id],
            )
        return self.get_event(event_id)

    def dismiss_event(self, event_id: str) -> bool:
        return bool(self.update_event(event_id, {"status": "dismissed"}))

    def delete_event(self, event_id: str) -> bool:
        with self.session() as conn:
            cursor = conn.execute("DELETE FROM proactive_events WHERE id=?", [event_id])
            return bool(cursor.rowcount)

    def get_event(self, event_id: str) -> dict | None:
        with self.session() as conn:
            row = conn.execute("SELECT * FROM proactive_events WHERE id=?", [event_id]).fetchone()
        return dict(row) if row else None

    def has_event_today(self, kind: str) -> bool:
        return self.has_event_on_date(kind, today_text())

    def has_event_on_date(self, kind: str, date_prefix: str) -> bool:
        prefix = str(date_prefix or today_text())[:10]
        with self.session() as conn:
            row = conn.execute(
                "SELECT id FROM proactive_events WHERE kind=? AND (created_at LIKE ? OR due_at LIKE ?) LIMIT 1",
                [kind, f"{prefix}%", f"{prefix}%"],
            ).fetchone()
        return bool(row)

    def due_pending_events(self) -> list[dict]:
        now = now_text()
        with self.session() as conn:
            rows = conn.execute(
                "SELECT * FROM proactive_events WHERE status='pending' AND due_at<=? ORDER BY due_at ASC",
                [now],
            ).fetchall()
        return [dict(row) for row in rows]

    def default_greeting_message(self, key: str, now: datetime | None = None) -> str:
        return daily_choice(GREETING_MESSAGE_POOLS.get(key) or [], key, now) or "我来找你说句话。"

    def greeting_note_message(self, spec: dict) -> str:
        notes = []
        if spec.get("with_weather"):
            notes.append("天气我会按已配置的默认地区一起参考。")
        if spec.get("with_reminders"):
            notes.append("有提醒的话，我也会一起看着。")
        return "\n".join(notes)

    def maybe_create_greetings(self, now: datetime | None = None) -> list[dict]:
        config = self.load_config()
        if not config.get("enabled") or not (config.get("greetings") or {}).get("enabled"):
            return []
        now = now or datetime.now()
        created = []
        greetings = config.get("greetings") or {}
        specs = [
            ("good_morning", "早安"),
            ("noon", "午间问候"),
            ("good_night", "晚安"),
        ]
        for key, title in specs:
            spec = greetings.get(key) or {}
            if not spec.get("enabled"):
                continue
            if self.has_event_on_date(f"greeting:{key}", date_text(now)):
                continue
            if not in_time_window(now, str(spec.get("window_start") or "00:00"), str(spec.get("window_end") or "23:59")):
                continue
            message = str(spec.get("message") or self.default_greeting_message(key, now))
            notes = self.greeting_note_message(spec)
            if notes:
                message = f"{message}\n{notes}"
            created.append(
                self.create_event(
                    {
                        "kind": f"greeting:{key}",
                        "title": title,
                        "content": message,
                        "channel": self.default_channel(config),
                        "status": "pending",
                        "due_at": datetime_text(now),
                    }
                )
            )
        return created

    def maybe_create_long_absence(self, last_activity_at: str, now: datetime | None = None) -> dict | None:
        config = self.load_config()
        greetings = config.get("greetings") or {}
        spec = greetings.get("long_absence") or {}
        if not config.get("enabled") or not greetings.get("enabled") or not spec.get("enabled"):
            return None
        now = now or datetime.now()
        if self.in_quiet_hours(config, now):
            return None
        last_at = parse_datetime_text(last_activity_at)
        if not last_at:
            return None
        try:
            after_hours = max(1.0, float(spec.get("after_hours") or 48))
        except (TypeError, ValueError):
            after_hours = 48.0
        if now - last_at < timedelta(hours=after_hours):
            return None
        if self.has_event_on_date("greeting:long_absence", date_text(now)):
            return None
        message = str(spec.get("message") or self.default_greeting_message("long_absence", now))
        return self.create_event(
            {
                "kind": "greeting:long_absence",
                "title": "主动搭话",
                "content": message,
                "channel": self.default_channel(config),
                "status": "pending",
                "due_at": datetime_text(now),
            }
        )

    def default_channel(self, config: dict | None = None) -> str:
        config = config or self.load_config()
        channels = config.get("channels") or {}
        if channels.get("weixin") and channels.get("web"):
            return "all"
        if channels.get("weixin"):
            return "weixin"
        return "web"

    def in_quiet_hours(self, config: dict | None = None, now: datetime | None = None) -> bool:
        config = config or self.load_config()
        if not config.get("quiet_hours_enabled", True):
            return False
        return in_time_window(now or datetime.now(), str(config.get("quiet_start") or "23:00"), str(config.get("quiet_end") or "08:00"))


class FollowupPolicy:
    def __init__(self, proactive_store: ProactiveStore):
        self.proactive_store = proactive_store
        self.recent_questions: list[tuple[float, str]] = []

    def maybe_question(self, user_text: str) -> dict | None:
        config = self.proactive_store.load_config()
        if not config.get("ask_followup_enabled", True):
            return None
        level = str(config.get("followup_level") or "restrained")
        if level == "off":
            return None
        text = str(user_text or "").strip()
        if not text:
            return None
        lowered = text.lower()
        for rule in FOLLOWUP_RULES:
            if not any(keyword in text for keyword in rule["keywords"]):
                continue
            if rule.get("requires_time") and self.has_time(text):
                continue
            if rule.get("requires_route") and self.has_route_points(text):
                continue
            if rule.get("requires_recipient") and self.has_recipient(text):
                continue
            if rule["id"] == "missing_weather_city" and self.has_weather_city(text, rule["missing_patterns"]):
                continue
            if rule["id"] == "dangerous_confirm" and any(word in lowered for word in ("确认", "确定", "yes", "ok")):
                continue
            question = rule["question"]
            if self.recently_asked(question):
                continue
            self.remember_question(question)
            return {"id": rule["id"], "question": question}
        return None

    def recently_asked(self, question: str) -> bool:
        now = time.time()
        self.recent_questions = [(ts, q) for ts, q in self.recent_questions if now - ts < 180]
        return any(q == question for _, q in self.recent_questions)

    def remember_question(self, question: str) -> None:
        self.recent_questions.append((time.time(), question))
        self.recent_questions = self.recent_questions[-12:]

    def has_time(self, text: str) -> bool:
        return any(word in text for word in ("今天", "明天", "后天", "早上", "上午", "中午", "下午", "晚上", "点", ":", "："))

    def has_route_points(self, text: str) -> bool:
        return ("到" in text or "去" in text) and any(word in text for word in ("从", "出发", "回", "路线"))

    def has_recipient(self, text: str) -> bool:
        return any(word in text for word in ("微信", "朋友", "妈妈", "爸爸", "同事", "群", "@"))

    def has_weather_city(self, text: str, noise: tuple[str, ...]) -> bool:
        value = text
        for word in noise:
            value = value.replace(word, "")
        return bool(value.strip(" ，。？！?"))
