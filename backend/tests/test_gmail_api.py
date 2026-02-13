"""Tests for Gmail REST API client (gmail_api.py)."""

from unittest.mock import patch

import httpx
import pytest

from app.email.gmail_api import (
    history_list,
    message_get,
    message_modify,
    messages_list,
    stop_watch,
    watch,
)

pytestmark = pytest.mark.unit


def _mock_response(status_code: int = 200, json_data: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=json_data or {},
        request=httpx.Request("GET", "https://example.com"),
    )


class TestWatch:
    def test_watch_success(self):
        resp = _mock_response(200, {"historyId": "12345", "expiration": "1707836400000"})
        with patch("app.email.gmail_api.httpx.post", return_value=resp) as mock_post:
            result = watch("token123", "projects/my-project/topics/gmail-events")

        assert result["historyId"] == "12345"
        assert result["expiration"] == "1707836400000"
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert call_kwargs.kwargs["json"]["topicName"] == "projects/my-project/topics/gmail-events"
        assert call_kwargs.kwargs["json"]["labelIds"] == ["INBOX"]

    def test_watch_error_raises(self):
        resp = _mock_response(403, {"error": {"message": "Insufficient permissions"}})
        with patch("app.email.gmail_api.httpx.post", return_value=resp):
            with pytest.raises(httpx.HTTPStatusError):
                watch("token123", "projects/my-project/topics/gmail-events")


class TestStopWatch:
    def test_stop_watch_success(self):
        resp = _mock_response(204)
        with patch("app.email.gmail_api.httpx.post", return_value=resp):
            stop_watch("token123")

    def test_stop_watch_404_is_ok(self):
        resp = _mock_response(404)
        with patch("app.email.gmail_api.httpx.post", return_value=resp):
            stop_watch("token123")  # Should not raise

    def test_stop_watch_500_raises(self):
        resp = _mock_response(500, {"error": "internal"})
        with patch("app.email.gmail_api.httpx.post", return_value=resp):
            with pytest.raises(httpx.HTTPStatusError):
                stop_watch("token123")


class TestHistoryList:
    def test_history_list_single_page(self):
        resp = _mock_response(
            200,
            {
                "history": [
                    {"id": "100", "messagesAdded": [{"message": {"id": "msg1"}}]},
                    {"id": "101", "messagesAdded": [{"message": {"id": "msg2"}}]},
                ],
                "historyId": "102",
            },
        )
        with patch("app.email.gmail_api.httpx.get", return_value=resp):
            result = history_list("token123", 99)

        assert len(result["history"]) == 2
        assert result["historyId"] == "102"

    def test_history_list_pagination(self):
        page1 = _mock_response(
            200,
            {
                "history": [{"id": "100"}],
                "historyId": "101",
                "nextPageToken": "page2token",
            },
        )
        page2 = _mock_response(
            200,
            {
                "history": [{"id": "101"}],
                "historyId": "102",
            },
        )
        with patch("app.email.gmail_api.httpx.get", side_effect=[page1, page2]):
            result = history_list("token123", 99)

        assert len(result["history"]) == 2
        assert result["historyId"] == "102"

    def test_history_list_empty(self):
        resp = _mock_response(200, {"historyId": "99"})
        with patch("app.email.gmail_api.httpx.get", return_value=resp):
            result = history_list("token123", 99)

        assert result["history"] == []
        assert result["historyId"] == "99"

    def test_history_list_expired_raises_404(self):
        resp = _mock_response(404, {"error": {"message": "notFound"}})
        with patch("app.email.gmail_api.httpx.get", return_value=resp):
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                history_list("token123", 1)
            assert exc_info.value.response.status_code == 404


class TestMessageGet:
    def test_message_get_full(self):
        msg = {
            "id": "msg1",
            "threadId": "thread1",
            "labelIds": ["INBOX", "UNREAD"],
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "Test email"},
                    {"name": "From", "value": "sender@example.com"},
                ],
            },
            "internalDate": "1707836400000",
        }
        resp = _mock_response(200, msg)
        with patch("app.email.gmail_api.httpx.get", return_value=resp) as mock_get:
            result = message_get("token123", "msg1")

        assert result["id"] == "msg1"
        assert result["payload"]["headers"][0]["value"] == "Test email"
        call_kwargs = mock_get.call_args
        assert call_kwargs.kwargs["params"]["format"] == "full"

    def test_message_get_metadata_format(self):
        resp = _mock_response(200, {"id": "msg1"})
        with patch("app.email.gmail_api.httpx.get", return_value=resp) as mock_get:
            message_get("token123", "msg1", fmt="metadata")

        call_kwargs = mock_get.call_args
        assert call_kwargs.kwargs["params"]["format"] == "metadata"


class TestMessageModify:
    def test_mark_as_read(self):
        resp = _mock_response(200, {"id": "msg1", "labelIds": ["INBOX"]})
        with patch("app.email.gmail_api.httpx.post", return_value=resp) as mock_post:
            result = message_modify("token123", "msg1", remove_label_ids=["UNREAD"])

        assert "UNREAD" not in result.get("labelIds", [])
        call_kwargs = mock_post.call_args
        assert call_kwargs.kwargs["json"]["removeLabelIds"] == ["UNREAD"]

    def test_add_labels(self):
        resp = _mock_response(200, {"id": "msg1"})
        with patch("app.email.gmail_api.httpx.post", return_value=resp) as mock_post:
            message_modify("token123", "msg1", add_label_ids=["STARRED"])

        call_kwargs = mock_post.call_args
        assert call_kwargs.kwargs["json"]["addLabelIds"] == ["STARRED"]


class TestMessagesList:
    def test_list_with_query(self):
        resp = _mock_response(
            200,
            {
                "messages": [
                    {"id": "msg1", "threadId": "t1"},
                    {"id": "msg2", "threadId": "t2"},
                ],
            },
        )
        with patch("app.email.gmail_api.httpx.get", return_value=resp) as mock_get:
            result = messages_list("token123", query="in:inbox newer_than:7d")

        assert len(result) == 2
        call_kwargs = mock_get.call_args
        assert call_kwargs.kwargs["params"]["q"] == "in:inbox newer_than:7d"

    def test_list_pagination(self):
        page1 = _mock_response(
            200,
            {
                "messages": [{"id": "msg1", "threadId": "t1"}],
                "nextPageToken": "page2",
            },
        )
        page2 = _mock_response(
            200,
            {
                "messages": [{"id": "msg2", "threadId": "t2"}],
            },
        )
        with patch("app.email.gmail_api.httpx.get", side_effect=[page1, page2]):
            result = messages_list("token123", max_results=10)

        assert len(result) == 2

    def test_list_respects_max_results(self):
        resp = _mock_response(
            200,
            {
                "messages": [{"id": f"msg{i}", "threadId": f"t{i}"} for i in range(5)],
                "nextPageToken": "more",
            },
        )
        with patch("app.email.gmail_api.httpx.get", return_value=resp):
            result = messages_list("token123", max_results=3)

        assert len(result) == 3

    def test_list_empty(self):
        resp = _mock_response(200, {})
        with patch("app.email.gmail_api.httpx.get", return_value=resp):
            result = messages_list("token123")

        assert result == []
