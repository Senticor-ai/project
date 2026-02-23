"""Tests for chat conversation persistence (queries.py)."""

from __future__ import annotations

import uuid

from app.chat.queries import (
    get_conversation_messages,
    get_or_create_conversation,
    save_message,
)


class TestGetOrCreateConversation:
    def test_creates_new_conversation(self, auth_context):
        org_id, user_id = auth_context
        conv = get_or_create_conversation(org_id, user_id, "conv-new-1")
        assert conv["conversation_id"] is not None
        assert conv["org_id"] == uuid.UUID(org_id)
        assert conv["external_id"] == "conv-new-1"

    def test_returns_existing_on_same_external_id(self, auth_context):
        org_id, user_id = auth_context
        conv1 = get_or_create_conversation(org_id, user_id, "conv-dup")
        conv2 = get_or_create_conversation(org_id, user_id, "conv-dup")
        assert conv1["conversation_id"] == conv2["conversation_id"]

    def test_different_external_ids_create_different_conversations(self, auth_context):
        org_id, user_id = auth_context
        conv1 = get_or_create_conversation(org_id, user_id, "conv-a")
        conv2 = get_or_create_conversation(org_id, user_id, "conv-b")
        assert conv1["conversation_id"] != conv2["conversation_id"]


class TestSaveAndFetchMessages:
    def test_save_and_fetch_round_trip(self, auth_context):
        org_id, user_id = auth_context
        conv = get_or_create_conversation(org_id, user_id, "conv-msgs")

        save_message(conv["conversation_id"], "user", "Hallo Copilot")
        save_message(conv["conversation_id"], "assistant", "Hallo! Wie kann ich helfen?")

        msgs = get_conversation_messages(conv["conversation_id"])
        assert len(msgs) == 2
        assert msgs[0]["role"] == "user"
        assert msgs[0]["content"] == "Hallo Copilot"
        assert msgs[1]["role"] == "assistant"
        assert msgs[1]["content"] == "Hallo! Wie kann ich helfen?"

    def test_messages_ordered_chronologically(self, auth_context):
        org_id, user_id = auth_context
        conv = get_or_create_conversation(org_id, user_id, "conv-order")

        save_message(conv["conversation_id"], "user", "first")
        save_message(conv["conversation_id"], "assistant", "second")
        save_message(conv["conversation_id"], "user", "third")

        msgs = get_conversation_messages(conv["conversation_id"])
        contents = [m["content"] for m in msgs]
        assert contents == ["first", "second", "third"]

    def test_fetch_messages_with_limit(self, auth_context):
        org_id, user_id = auth_context
        conv = get_or_create_conversation(org_id, user_id, "conv-limit")

        for i in range(5):
            save_message(conv["conversation_id"], "user", f"msg-{i}")

        msgs = get_conversation_messages(conv["conversation_id"], limit=2)
        assert len(msgs) == 2
        # Should return the LAST 2 messages (most recent)
        assert msgs[0]["content"] == "msg-3"
        assert msgs[1]["content"] == "msg-4"

    def test_save_assistant_with_tool_calls(self, auth_context):
        org_id, user_id = auth_context
        conv = get_or_create_conversation(org_id, user_id, "conv-tools")

        tool_calls = [{"name": "create_action", "arguments": {"name": "Test", "bucket": "next"}}]
        save_message(conv["conversation_id"], "assistant", "Hier mein Vorschlag:", tool_calls)

        msgs = get_conversation_messages(conv["conversation_id"])
        assert len(msgs) == 1
        assert msgs[0]["tool_calls"] == tool_calls

    def test_user_message_has_no_tool_calls(self, auth_context):
        org_id, user_id = auth_context
        conv = get_or_create_conversation(org_id, user_id, "conv-no-tools")

        save_message(conv["conversation_id"], "user", "Hallo")
        msgs = get_conversation_messages(conv["conversation_id"])
        assert msgs[0]["tool_calls"] is None

    def test_messages_scoped_to_conversation(self, auth_context):
        org_id, user_id = auth_context
        conv1 = get_or_create_conversation(org_id, user_id, "conv-scope-1")
        conv2 = get_or_create_conversation(org_id, user_id, "conv-scope-2")

        save_message(conv1["conversation_id"], "user", "in conv1")
        save_message(conv2["conversation_id"], "user", "in conv2")

        msgs1 = get_conversation_messages(conv1["conversation_id"])
        msgs2 = get_conversation_messages(conv2["conversation_id"])
        assert len(msgs1) == 1
        assert msgs1[0]["content"] == "in conv1"
        assert len(msgs2) == 1
        assert msgs2[0]["content"] == "in conv2"
