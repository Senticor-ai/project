"""Tests for Google Calendar REST API client (google_calendar_api.py)."""

from unittest.mock import patch

import httpx
import pytest

from app.email.google_calendar_api import create_event

pytestmark = pytest.mark.unit


def _mock_response(status_code: int = 200, json_data: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=json_data or {},
        request=httpx.Request("POST", "https://example.com"),
    )


class TestCreateEvent:
    def test_posts_expected_payload_and_bearer_token(self):
        body = {
            "summary": "Quick meeting",
            "start": {"dateTime": "2026-03-01T10:15:00Z"},
            "end": {"dateTime": "2026-03-01T10:30:00Z"},
        }
        response = _mock_response(200, {"id": "evt-123"})

        with patch("app.email.google_calendar_api.httpx.post", return_value=response) as mock_post:
            result = create_event("token-123", body=body, calendar_id="primary")

        assert result["id"] == "evt-123"
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert call_kwargs.args[0] == "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        assert call_kwargs.kwargs["headers"]["Authorization"] == "Bearer token-123"
        assert call_kwargs.kwargs["json"] == body

    def test_url_encodes_non_primary_calendar_id(self):
        response = _mock_response(200, {"id": "evt-encoded"})
        with patch("app.email.google_calendar_api.httpx.post", return_value=response) as mock_post:
            create_event(
                "token-123",
                body={
                    "summary": "Quick meeting",
                    "start": {"dateTime": "2026-03-01T10:15:00Z"},
                    "end": {"dateTime": "2026-03-01T10:30:00Z"},
                },
                calendar_id="team@group.calendar.google.com",
            )

        call_kwargs = mock_post.call_args
        assert (
            call_kwargs.args[0]
            == "https://www.googleapis.com/calendar/v3/calendars/team%40group.calendar.google.com/events"
        )
