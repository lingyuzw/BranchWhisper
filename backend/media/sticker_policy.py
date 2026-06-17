from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any


STICKER_ACTIVITY = {
    "off": {"probability": 0.0, "cooldown": 999999, "daily_limit": 0, "max_streak": 0},
    "low": {"probability": 0.18, "cooldown": 480, "daily_limit": 8, "max_streak": 1},
    "standard": {"probability": 0.36, "cooldown": 240, "daily_limit": 20, "max_streak": 1},
    "active": {"probability": 0.62, "cooldown": 90, "daily_limit": 60, "max_streak": 2},
    "very_active": {"probability": 0.82, "cooldown": 45, "daily_limit": 120, "max_streak": 2},
}

STICKER_TAG_RULES = [
    ("早安", r"早安|早上好|起床啦|起床了"),
    ("晚安", r"晚安|睡觉了|困死|睡不着|哄睡"),
    ("吃饭", r"饿死|好饿|干饭|火锅|奶茶|馋"),
    ("安慰", r"难受|不开心|委屈|烦死|压力好大|崩溃|抱抱|哭了|emo"),
    ("开心", r"哈哈哈+|笑死|笑疯|好耶|太棒了|开心死|夸夸"),
    ("挑衅", r"打一架|打架|揍你|欠揍|想打|来打|单挑|不服|挑衅"),
    ("互怼", r"怼|骂|sb|傻逼|笨蛋|笨死|滚|阴阳怪气"),
    ("无语", r"无语|离谱|服了|绷不住|尴尬|汗流浃背"),
    ("疑惑", r"啥意思|什么鬼|为啥啊|为什么啊|怎么会这样|真的假的|真的假的啊"),
    ("鼓励", r"加油|努力|考试|面试|工作|项目|训练|冲呀|稳住"),
    ("撒娇", r"想你|陪我|理我|哄我|贴贴"),
]

SERIOUS_TEXT_RE = re.compile(r"(报错|失败|异常|HTTP|Traceback|代码|接口|配置|安装|日志|测试失败|无法连接|图片理解失败|连接尝试失败|All connection attempts failed)", re.I)
TOOL_TEXT_RE = re.compile(r"(天气|新闻|搜索|股价|汇率|地图|路线|网址|网页|查询结果|API)", re.I)
PLAIN_TEXT_RE = re.compile(
    r"(推荐|首歌|歌名|歌曲|音乐|听听|看看|等下|等会|稍后|回头|时间|慢慢|品|收到|知道|了解|好的|行|可以|嗯嗯|好吧|那行|谢谢|辛苦)",
    re.I,
)
STRONG_STICKER_SIGNAL_RE = re.compile(
    r"(哈哈哈+|笑死|笑疯|好耶|抱抱|哭了|呜呜|贴贴|晚安|早安|难受|崩溃|无语|离谱|服了|绷不住|打一架|单挑|不服|笨蛋|傻逼|什么鬼|真的假的)",
    re.I,
)


@dataclass
class StickerRuntimeState:
    last_sent_at: float = 0.0
    last_sticker_id: str = ""
    streak: int = 0
    sent_today: int = 0
    day: str = ""


class StickerPolicy:
    def __init__(self) -> None:
        self.sessions: dict[str, StickerRuntimeState] = {}

    def choose_intent(self, settings: Any, *, session_id: str, user_text: str, reply_text: str, source: str = "web") -> dict:
        return self._choose_intent(settings, session_id=session_id, user_text=user_text, reply_text=reply_text, source=source)

    def simulate(self, settings: Any, *, session_id: str, user_text: str, reply_text: str = "", source: str = "web", ignore_limits: bool = False) -> dict:
        intent = self._choose_intent(
            settings,
            session_id=session_id,
            user_text=user_text,
            reply_text=reply_text,
            source=source,
            mutate=False,
            ignore_limits=ignore_limits,
        )
        intent["session_id"] = session_id or "default"
        intent["source"] = source or "web"
        return intent

    def _choose_intent(
        self,
        settings: Any,
        *,
        session_id: str,
        user_text: str,
        reply_text: str,
        source: str = "web",
        mutate: bool = True,
        ignore_limits: bool = False,
    ) -> dict:
        if not getattr(settings, "stickers_enabled", True):
            return {"send": False, "reason": "disabled"}
        activity = str(getattr(settings, "sticker_activity", "active") or "active")
        if activity == "custom":
            config = {
                "probability": float(getattr(settings, "sticker_custom_probability", 0.65) or 0.65),
                "cooldown": int(getattr(settings, "sticker_cooldown_sec", 90) or 90),
                "daily_limit": int(getattr(settings, "sticker_daily_limit", 60) or 60),
                "max_streak": int(getattr(settings, "sticker_max_streak", 2) or 2),
            }
        else:
            config = STICKER_ACTIVITY.get(activity, STICKER_ACTIVITY["active"])
        if config["probability"] <= 0:
            return {"send": False, "reason": "off"}

        text = f"{user_text}\n{reply_text}"
        if "[图片]" in user_text and ("图片理解失败" in text or "All connection attempts failed" in text):
            return {"send": False, "reason": "image_vision_failed"}
        if SERIOUS_TEXT_RE.search(text) or TOOL_TEXT_RE.search(user_text):
            return {"send": False, "reason": "serious_or_tool"}
        if PLAIN_TEXT_RE.search(user_text) and not STRONG_STICKER_SIGNAL_RE.search(text):
            return {"send": False, "reason": "plain_context"}

        now = time.time()
        day = time.strftime("%Y-%m-%d")
        if mutate:
            state = self.sessions.setdefault(session_id or "default", StickerRuntimeState(day=day))
        else:
            state = self.sessions.get(session_id or "default") or StickerRuntimeState(day=day)
        if state.day != day:
            if mutate:
                state.day = day
                state.sent_today = 0
                state.streak = 0
            else:
                state = StickerRuntimeState(day=day)
        if not ignore_limits:
            if state.sent_today >= config["daily_limit"]:
                return {"send": False, "reason": "daily_limit", "config": config, "state": self.state_snapshot(state)}
            if now - state.last_sent_at < config["cooldown"]:
                return {"send": False, "reason": "cooldown", "config": config, "state": self.state_snapshot(state)}
            if state.streak >= config["max_streak"]:
                return {"send": False, "reason": "streak", "config": config, "state": self.state_snapshot(state)}

        tag = self.infer_tag(user_text, reply_text)
        if not tag:
            return {"send": False, "reason": "no_semantic_tag", "config": config, "state": self.state_snapshot(state)}
        if not self.has_strong_signal(text, tag):
            return {"send": False, "reason": "weak_context", "tag": tag, "config": config, "state": self.state_snapshot(state)}
        score = self.score(text, tag)
        if score < config["probability"]:
            return {"send": False, "reason": "probability", "tag": tag, "score": score, "config": config, "state": self.state_snapshot(state)}
        return {"send": True, "tag": tag, "reason": "matched", "avoid_id": state.last_sticker_id, "score": score, "config": config, "state": self.state_snapshot(state)}

    def state_snapshot(self, state: StickerRuntimeState) -> dict:
        return {
            "last_sent_at": state.last_sent_at,
            "last_sticker_id": state.last_sticker_id,
            "streak": state.streak,
            "sent_today": state.sent_today,
            "day": state.day,
        }

    def mark_sent(self, session_id: str, sticker_id: str) -> None:
        state = self.sessions.setdefault(session_id or "default", StickerRuntimeState(day=time.strftime("%Y-%m-%d")))
        state.last_sent_at = time.time()
        state.last_sticker_id = sticker_id
        state.streak += 1
        state.sent_today += 1

    def mark_text_only(self, session_id: str) -> None:
        state = self.sessions.setdefault(session_id or "default", StickerRuntimeState(day=time.strftime("%Y-%m-%d")))
        state.streak = 0

    def infer_tag(self, user_text: str, reply_text: str) -> str:
        text = f"{user_text}\n{reply_text}"
        for tag, pattern in STICKER_TAG_RULES:
            if re.search(pattern, text, re.I):
                return tag
        return ""

    def has_strong_signal(self, text: str, tag: str) -> bool:
        if tag in {"早安", "晚安", "安慰", "挑衅", "互怼", "无语", "撒娇"}:
            return True
        return bool(STRONG_STICKER_SIGNAL_RE.search(text))

    def score(self, text: str, tag: str) -> float:
        value = 0.2
        if tag:
            value += 0.18
        if tag in {"挑衅", "互怼"}:
            value += 0.18
        if tag in {"安慰", "晚安", "早安", "无语", "撒娇"}:
            value += 0.12
        if tag == "开心":
            value += 0.12
        if re.search(r"[!！~～]|哈哈|笑死|好耶|抱抱|呜|哎呀", text):
            value += 0.26
        if len(text) <= 80:
            value += 0.08
        return min(1.0, value)
