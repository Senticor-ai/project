"""Tests for Cloud Pub/Sub pull client (pubsub.py)."""

import base64
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.email.pubsub import PubSubClient, PubSubMessage

pytestmark = pytest.mark.unit


@pytest.fixture
def mock_credentials():
    """Mock google-auth credentials."""
    creds = MagicMock()
    creds.valid = True
    creds.token = "sa-token-123"
    return creds


@pytest.fixture
def client(mock_credentials):
    """PubSubClient with mocked credentials."""
    with patch(
        "app.email.pubsub.Credentials.from_service_account_file",
        return_value=mock_credentials,
    ):
        return PubSubClient(
            project_id="my-project",
            subscription_id="gmail-notifications-pull",
            credentials_file="/fake/path.json",
        )


def _mock_response(status_code: int = 200, json_data: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=json_data or {},
        request=httpx.Request("POST", "https://example.com"),
    )


def _encode_notification(email: str, history_id: int) -> str:
    """Base64-encode a Gmail Pub/Sub notification payload."""
    return base64.b64encode(
        json.dumps({"emailAddress": email, "historyId": history_id}).encode()
    ).decode()


class TestPull:
    def test_pull_parses_notifications(self, client):
        resp = _mock_response(200, {
            "receivedMessages": [
                {
                    "ackId": "ack-1",
                    "message": {
                        "data": _encode_notification("user@gmail.com", 12345),
                        "messageId": "pubsub-msg-1",
                        "publishTime": "2026-02-11T10:00:00Z",
                    },
                },
                {
                    "ackId": "ack-2",
                    "message": {
                        "data": _encode_notification("other@gmail.com", 67890),
                        "messageId": "pubsub-msg-2",
                        "publishTime": "2026-02-11T10:01:00Z",
                    },
                },
            ],
        })
        with patch("app.email.pubsub.httpx.post", return_value=resp):
            messages = client.pull()

        assert len(messages) == 2
        assert messages[0] == PubSubMessage(
            ack_id="ack-1",
            email_address="user@gmail.com",
            history_id=12345,
            publish_time="2026-02-11T10:00:00Z",
        )
        assert messages[1].email_address == "other@gmail.com"
        assert messages[1].history_id == 67890

    def test_pull_empty_response(self, client):
        resp = _mock_response(200, {})
        with patch("app.email.pubsub.httpx.post", return_value=resp):
            messages = client.pull()

        assert messages == []

    def test_pull_invalid_data_still_returns_for_ack(self, client):
        resp = _mock_response(200, {
            "receivedMessages": [
                {
                    "ackId": "ack-bad",
                    "message": {
                        "data": base64.b64encode(b"not json").decode(),
                        "publishTime": "2026-02-11T10:00:00Z",
                    },
                },
            ],
        })
        with patch("app.email.pubsub.httpx.post", return_value=resp):
            messages = client.pull()

        assert len(messages) == 1
        assert messages[0].ack_id == "ack-bad"
        assert messages[0].email_address == ""
        assert messages[0].history_id == 0

    def test_pull_missing_fields_still_parseable(self, client):
        # Valid JSON but missing emailAddress
        data = base64.b64encode(json.dumps({"historyId": 123}).encode()).decode()
        resp = _mock_response(200, {
            "receivedMessages": [
                {
                    "ackId": "ack-partial",
                    "message": {"data": data, "publishTime": "2026-02-11T10:00:00Z"},
                },
            ],
        })
        with patch("app.email.pubsub.httpx.post", return_value=resp):
            messages = client.pull()

        assert len(messages) == 1
        assert messages[0].email_address == ""
        assert messages[0].history_id == 123

    def test_pull_uses_correct_subscription_path(self, client):
        resp = _mock_response(200, {})
        with patch("app.email.pubsub.httpx.post", return_value=resp) as mock_post:
            client.pull(max_messages=50)

        url = mock_post.call_args.args[0]
        assert "projects/my-project/subscriptions/gmail-notifications-pull:pull" in url
        assert mock_post.call_args.kwargs["json"]["maxMessages"] == 50


class TestAcknowledge:
    def test_acknowledge_sends_ack_ids(self, client):
        resp = _mock_response(200)
        with patch("app.email.pubsub.httpx.post", return_value=resp) as mock_post:
            client.acknowledge(["ack-1", "ack-2"])

        call_kwargs = mock_post.call_args.kwargs
        assert call_kwargs["json"]["ackIds"] == ["ack-1", "ack-2"]
        url = mock_post.call_args.args[0]
        assert ":acknowledge" in url

    def test_acknowledge_empty_list_noop(self, client):
        with patch("app.email.pubsub.httpx.post") as mock_post:
            client.acknowledge([])

        mock_post.assert_not_called()

    def test_acknowledge_error_raises(self, client):
        resp = _mock_response(500, {"error": "internal"})
        with patch("app.email.pubsub.httpx.post", return_value=resp):
            with pytest.raises(httpx.HTTPStatusError):
                client.acknowledge(["ack-1"])


class TestCredentials:
    def test_refreshes_expired_token(self, mock_credentials):
        mock_credentials.valid = False
        mock_credentials.token = "refreshed-token"

        with patch(
            "app.email.pubsub.Credentials.from_service_account_file",
            return_value=mock_credentials,
        ):
            client = PubSubClient("proj", "sub", "/fake/creds.json")

        resp = _mock_response(200, {})
        with patch("app.email.pubsub.httpx.post", return_value=resp):
            client.pull()

        mock_credentials.refresh.assert_called_once()
