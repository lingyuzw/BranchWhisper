from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from api.statistics import create_statistics_router


class StaticStore:
    def __init__(self, payload):
        self.payload = payload

    def list_profiles(self):
        return self.payload

    def list(self):
        return self.payload

    def list_integrations(self):
        return self.payload

    def list_events(self):
        return self.payload


class AggregateProactiveStore:
    def __init__(self, counts):
        self.counts = counts
        self.list_events_called = False

    def event_counts(self):
        return self.counts

    def list_events(self):
        self.list_events_called = True
        return {
            "events": [{"id": f"sample-{index}"} for index in range(80)],
            "tasks": [{"id": f"sample-{index}", "status": "pending"} for index in range(80)],
        }


class ConversationStore:
    def __init__(self, summaries, loaded):
        self.summaries = summaries
        self.loaded = loaded
        self.list_archived_args = []

    def list(self, archived=None):
        self.list_archived_args.append(archived)
        return self.summaries

    def load(self, conversation_id):
        return self.loaded.get(conversation_id)


class FailingStore:
    def list_profiles(self):
        raise RuntimeError("profiles disk failed at /home/me/secret/api_key.txt")


def make_client(**state) -> TestClient:
    app = FastAPI()
    for key, value in state.items():
        setattr(app.state, key, value)
    app.include_router(create_statistics_router())
    return TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000))


class StatisticsApiTests(unittest.TestCase):
    def test_get_statistics_aggregates_counts_from_fake_stores(self) -> None:
        conversation_store = ConversationStore(
            [
                {"id": "c1", "archived": False, "message_count": 3},
                {"id": "c2", "archived": True, "message_count": 4},
            ],
            {},
        )
        client = make_client(
            bot_profiles=StaticStore(
                {
                    "profiles": [
                        {"id": "default", "bridge_enabled": True},
                        {"id": "quiet", "bridge_enabled": False},
                    ]
                }
            ),
            conversation_store=conversation_store,
            sticker_store=StaticStore(
                {
                    "stickers": [
                        {"id": "s1", "enabled": True},
                        {"id": "s2", "enabled": False},
                        {"id": "s3"},
                    ]
                }
            ),
            integration_manager=StaticStore({"integrations": [{"id": "wx", "enabled": True, "status": "stopped"}]}),
            reminder_store=StaticStore(
                [
                    {"id": "r1", "status": "pending"},
                    {"id": "r2", "status": "done"},
                ]
            ),
            proactive_store=StaticStore(
                {
                    "events": [{"id": "e1"}, {"id": "e2"}, {"id": "e3"}, {"id": "e4"}],
                    "tasks": [
                        {"id": "t1", "status": "pending"},
                        {"id": "t2", "status": "done"},
                        {"id": "t3", "status": "done"},
                        {"id": "t4", "status": "failed"},
                    ],
                }
            ),
        )

        response = client.get("/api/statistics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertIn("generated_at", payload)
        self.assertEqual(
            payload["summary"],
            {
                "bots": 2,
                "conversations": 2,
                "messages": 7,
                "stickers": 3,
                "integrations": 1,
                "bridges": 1,
                "reminders": 2,
                "proactive_events": 4,
                "proactive_tasks": 4,
                "model_calls": 0,
                "tokens": 0,
            },
        )
        self.assertEqual(payload["slices"]["bots"], {"count": 2, "enabled": 1, "status": "ok", "source": "bot_profiles.list_profiles"})
        self.assertEqual(payload["slices"]["conversations"]["archived"], 1)
        self.assertEqual(payload["slices"]["conversations"]["active"], 1)
        self.assertEqual(payload["slices"]["messages"]["count"], 7)
        self.assertEqual(conversation_store.list_archived_args, ["", ""])
        self.assertEqual(payload["slices"]["stickers"]["enabled"], 2)
        self.assertEqual(payload["slices"]["stickers"]["disabled"], 1)
        self.assertEqual(payload["slices"]["integrations"]["bridges"], 1)
        self.assertEqual(payload["slices"]["integrations"]["running"], 0)
        self.assertEqual(payload["slices"]["reminders"]["pending"], 1)
        self.assertEqual(payload["slices"]["proactive"]["failed"], 1)

    def test_get_statistics_uses_proactive_aggregate_counts_when_available(self) -> None:
        proactive_store = AggregateProactiveStore(
            {"events": 125, "tasks": 125, "pending": 100, "done": 20, "failed": 5}
        )
        client = make_client(proactive_store=proactive_store)

        response = client.get("/api/statistics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["proactive_events"], 125)
        self.assertEqual(payload["summary"]["proactive_tasks"], 125)
        self.assertEqual(payload["slices"]["proactive"]["events"], 125)
        self.assertEqual(payload["slices"]["proactive"]["pending"], 100)
        self.assertEqual(payload["slices"]["proactive"]["done"], 20)
        self.assertEqual(payload["slices"]["proactive"]["failed"], 5)
        self.assertEqual(payload["slices"]["proactive"]["source"], "proactive_store.event_counts")
        self.assertFalse(proactive_store.list_events_called)

    def test_message_count_uses_summary_and_load_fallback(self) -> None:
        client = make_client(
            conversation_store=ConversationStore(
                [
                    {"id": "summary", "message_count": 5},
                    {"id": "fallback"},
                    {"id": "missing"},
                ],
                {
                    "fallback": {"id": "fallback", "messages": [{"role": "user"}, {"role": "assistant"}]},
                    "missing": None,
                },
            )
        )

        response = client.get("/api/statistics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["messages"], 7)
        self.assertEqual(payload["slices"]["messages"]["count"], 7)
        self.assertEqual(payload["slices"]["messages"]["status"], "ok")
        self.assertEqual(payload["slices"]["messages"]["source"], "conversation_store.message_count")

    def test_missing_optional_stores_return_unavailable_zero_slices(self) -> None:
        client = make_client()

        response = client.get("/api/statistics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["bots"], 0)
        self.assertEqual(payload["summary"]["conversations"], 0)
        self.assertEqual(payload["summary"]["messages"], 0)
        for name, slice_payload in payload["slices"].items():
            if name == "model_usage":
                continue
            self.assertEqual(slice_payload["status"], "unavailable", name)
            self.assertIn("error", slice_payload, name)

    def test_failing_optional_store_returns_unavailable_slice_without_crashing(self) -> None:
        sensitive_detail = "/home/me/secret/api_key.txt"
        client = make_client(
            bot_profiles=FailingStore(),
            conversation_store=ConversationStore([{"id": "c1", "message_count": 2}], {}),
        )

        response = client.get("/api/statistics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["bots"], 0)
        self.assertEqual(payload["summary"]["conversations"], 1)
        self.assertEqual(payload["slices"]["bots"]["status"], "unavailable")
        self.assertEqual(payload["slices"]["bots"]["error"], "unavailable")
        self.assertEqual(payload["slices"]["bots"]["error_type"], "RuntimeError")
        self.assertNotIn("profiles disk failed", response.text)
        self.assertNotIn(sensitive_detail, response.text)
        self.assertEqual(payload["slices"]["conversations"]["status"], "ok")

    def test_model_calls_and_tokens_are_zero_and_not_tracked(self) -> None:
        client = make_client()

        response = client.get("/api/statistics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["model_calls"], 0)
        self.assertEqual(payload["summary"]["tokens"], 0)
        self.assertEqual(
            payload["slices"]["model_usage"],
            {"model_calls": 0, "tokens": 0, "status": "not_tracked", "source": "not_tracked"},
        )


if __name__ == "__main__":
    unittest.main()
