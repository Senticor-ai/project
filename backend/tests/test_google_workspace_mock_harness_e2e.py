"""Deterministic black-box e2e test for Gmail + Calendar proposal flow."""

from __future__ import annotations

import base64
import copy
import socket
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI, HTTPException, Request

from app.db import db_conn, jsonb


def _get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _encode_text_payload(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii")


def _decode_raw_rfc822(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii")).decode(
        "utf-8",
        errors="replace",
    )


def _parse_rfc822(raw: str) -> tuple[dict[str, str], str]:
    headers_block, separator, body = raw.partition("\r\n\r\n")
    if not separator:
        headers_block, _, body = raw.partition("\n\n")
    headers: dict[str, str] = {}
    for line in headers_block.splitlines():
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        headers[name.strip()] = value.strip()
    return headers, body


def _parse_iso_z(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


@dataclass
class _MockWorkspaceState:
    gmail_messages: dict[str, dict[str, Any]] = field(default_factory=dict)
    gmail_history: list[dict[str, Any]] = field(default_factory=list)
    gmail_history_id: str = "10001"
    gmail_sent_messages: list[dict[str, Any]] = field(default_factory=list)
    gmail_modify_calls: list[dict[str, Any]] = field(default_factory=list)
    calendar_events: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    calendar_next_sync_tokens: dict[str, str] = field(default_factory=dict)
    calendar_created_events: list[dict[str, Any]] = field(default_factory=list)
    calendar_updated_events: list[dict[str, Any]] = field(default_factory=list)


class MockGoogleWorkspaceHarness:
    """Local HTTP server that mimics the Gmail + Google Calendar APIs."""

    def __init__(
        self,
        *,
        base_url: str,
        state: _MockWorkspaceState,
        lock: threading.Lock,
        server: uvicorn.Server,
        thread: threading.Thread,
    ) -> None:
        self.base_url = base_url
        self._state = state
        self._lock = lock
        self._server = server
        self._thread = thread

    @property
    def gmail_api_base(self) -> str:
        return f"{self.base_url}/gmail/v1/users/me"

    @property
    def calendar_api_base(self) -> str:
        return f"{self.base_url}/calendar/v3"

    @property
    def gmail_sent_messages(self) -> list[dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._state.gmail_sent_messages)

    @property
    def calendar_created_events(self) -> list[dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._state.calendar_created_events)

    def stop(self) -> None:
        self._server.should_exit = True
        self._thread.join(timeout=5)

    def seed_gmail_message(
        self,
        *,
        message_id: str,
        subject: str,
        body_text: str,
        sender: str,
        to: str,
        history_id: str,
        label_ids: list[str] | None = None,
        internal_date_ms: str | None = None,
    ) -> None:
        thread_id = f"thread-{message_id}"
        message = {
            "id": message_id,
            "threadId": thread_id,
            "labelIds": label_ids or ["INBOX", "UNREAD"],
            "historyId": history_id,
            "internalDate": internal_date_ms
            or str(int(datetime.now(UTC).timestamp() * 1000)),
            "payload": {
                "mimeType": "multipart/alternative",
                "headers": [
                    {"name": "Subject", "value": subject},
                    {"name": "From", "value": sender},
                    {"name": "To", "value": to},
                    {"name": "Message-ID", "value": f"<{message_id}@mock.localhost>"},
                ],
                "parts": [
                    {
                        "mimeType": "text/plain",
                        "body": {"data": _encode_text_payload(body_text)},
                    }
                ],
            },
        }
        with self._lock:
            self._state.gmail_messages[message_id] = message

    def set_history_from_messages(
        self,
        *,
        message_ids: list[str],
        history_id: str,
    ) -> None:
        history: list[dict[str, Any]] = []
        with self._lock:
            for idx, message_id in enumerate(message_ids):
                labels = self._state.gmail_messages.get(message_id, {}).get(
                    "labelIds",
                    ["INBOX", "UNREAD"],
                )
                history.append(
                    {
                        "id": str(10_000 + idx),
                        "messagesAdded": [
                            {
                                "message": {
                                    "id": message_id,
                                    "labelIds": labels,
                                }
                            }
                        ],
                    }
                )
            self._state.gmail_history = history
            self._state.gmail_history_id = history_id

    def seed_calendar_events(
        self,
        *,
        calendar_id: str,
        events: list[dict[str, Any]],
        next_sync_token: str,
    ) -> None:
        with self._lock:
            self._state.calendar_events[calendar_id] = copy.deepcopy(events)
            self._state.calendar_next_sync_tokens[calendar_id] = next_sync_token

    @classmethod
    def start(cls) -> MockGoogleWorkspaceHarness:
        state = _MockWorkspaceState()
        lock = threading.Lock()
        app = FastAPI()

        @app.get("/__health")
        async def health() -> dict[str, str]:
            return {"status": "ok"}

        @app.get("/gmail/v1/users/me/history")
        async def gmail_history() -> dict[str, Any]:
            with lock:
                return {
                    "history": copy.deepcopy(state.gmail_history),
                    "historyId": state.gmail_history_id,
                }

        @app.get("/gmail/v1/users/me/messages")
        async def gmail_messages_list(maxResults: int = 100) -> dict[str, Any]:
            with lock:
                messages = [
                    {
                        "id": str(msg["id"]),
                        "threadId": str(msg["threadId"]),
                    }
                    for msg in state.gmail_messages.values()
                ]
            return {"messages": messages[:maxResults]}

        @app.get("/gmail/v1/users/me/messages/{message_id}")
        async def gmail_message_get(message_id: str) -> dict[str, Any]:
            with lock:
                message = state.gmail_messages.get(message_id)
                if message is None:
                    raise HTTPException(status_code=404, detail="Message not found")
                return copy.deepcopy(message)

        @app.post("/gmail/v1/users/me/messages/{message_id}/modify")
        async def gmail_message_modify(message_id: str, request: Request) -> dict[str, Any]:
            payload = await request.json()
            add_labels = payload.get("addLabelIds") or []
            remove_labels = payload.get("removeLabelIds") or []
            with lock:
                message = state.gmail_messages.get(message_id)
                if message is None:
                    raise HTTPException(status_code=404, detail="Message not found")
                labels = list(message.get("labelIds") or [])
                for label in add_labels:
                    if label not in labels:
                        labels.append(label)
                for label in remove_labels:
                    if label in labels:
                        labels.remove(label)
                message["labelIds"] = labels
                state.gmail_modify_calls.append(
                    {
                        "message_id": message_id,
                        "add_label_ids": list(add_labels),
                        "remove_label_ids": list(remove_labels),
                        "label_ids_after": list(labels),
                    }
                )
                return copy.deepcopy(message)

        @app.post("/gmail/v1/users/me/messages/send")
        async def gmail_send(request: Request) -> dict[str, Any]:
            payload = await request.json()
            encoded_raw = str(payload.get("raw") or "")
            if not encoded_raw:
                raise HTTPException(status_code=400, detail="Missing raw message")
            decoded_raw = _decode_raw_rfc822(encoded_raw)
            headers, body = _parse_rfc822(decoded_raw)
            with lock:
                sent_id = f"sent-{len(state.gmail_sent_messages) + 1}"
                state.gmail_sent_messages.append(
                    {
                        "id": sent_id,
                        "thread_id": payload.get("threadId"),
                        "to": headers.get("To"),
                        "subject": headers.get("Subject"),
                        "body": body,
                        "raw": decoded_raw,
                    }
                )
            return {"id": sent_id}

        @app.get("/calendar/v3/users/me/calendarList")
        async def calendar_list() -> dict[str, Any]:
            return {
                "items": [
                    {
                        "id": "primary",
                        "summary": "Primary",
                        "primary": True,
                        "accessRole": "owner",
                    }
                ]
            }

        @app.get("/calendar/v3/calendars/{calendar_id}/events")
        async def calendar_events(calendar_id: str) -> dict[str, Any]:
            with lock:
                items = copy.deepcopy(state.calendar_events.get(calendar_id, []))
                token = state.calendar_next_sync_tokens.get(calendar_id, "sync-default")
            return {"items": items, "nextSyncToken": token}

        @app.post("/calendar/v3/calendars/{calendar_id}/events")
        async def calendar_create_event(calendar_id: str, request: Request) -> dict[str, Any]:
            payload = await request.json()
            with lock:
                event_id = str(payload.get("id") or f"created-{len(state.calendar_created_events) + 1}")
                created = {"id": event_id, **payload}
                state.calendar_created_events.append(
                    {
                        "calendar_id": calendar_id,
                        "body": copy.deepcopy(payload),
                        "response": copy.deepcopy(created),
                    }
                )
                state.calendar_events.setdefault(calendar_id, []).append(copy.deepcopy(created))
            return created

        @app.patch("/calendar/v3/calendars/{calendar_id}/events/{event_id}")
        async def calendar_update_event(
            calendar_id: str,
            event_id: str,
            request: Request,
        ) -> dict[str, Any]:
            payload = await request.json()
            with lock:
                updated = {"id": event_id, **payload}
                state.calendar_updated_events.append(
                    {
                        "calendar_id": calendar_id,
                        "event_id": event_id,
                        "body": copy.deepcopy(payload),
                    }
                )
                events = state.calendar_events.setdefault(calendar_id, [])
                replaced = False
                for idx, existing in enumerate(events):
                    if str(existing.get("id")) == event_id:
                        events[idx] = copy.deepcopy(updated)
                        replaced = True
                        break
                if not replaced:
                    events.append(copy.deepcopy(updated))
            return updated

        port = _get_free_port()
        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            access_log=False,
            ws="none",
        )
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{port}"

        for _ in range(50):
            try:
                response = httpx.get(f"{base_url}/__health", timeout=0.2)
                if response.status_code == 200:
                    break
            except Exception:
                time.sleep(0.1)
        else:
            server.should_exit = True
            thread.join(timeout=5)
            raise RuntimeError("Mock Google Workspace harness failed to start")

        return cls(
            base_url=base_url,
            state=state,
            lock=lock,
            server=server,
            thread=thread,
        )


@pytest.fixture()
def mock_google_workspace_harness():
    harness = MockGoogleWorkspaceHarness.start()
    try:
        yield harness
    finally:
        harness.stop()


def _seed_connection_with_history(*, org_id: str, user_id: str, last_history_id: int) -> str:
    connection_id = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_connections
                    (connection_id, org_id, user_id, email_address, display_name,
                     encrypted_access_token, encrypted_refresh_token, token_expires_at,
                     is_active, sync_interval_minutes, sync_mark_read, calendar_sync_enabled,
                     calendar_selected_ids, calendar_sync_tokens)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, 0, false, true, %s, %s)
                """,
                (
                    connection_id,
                    org_id,
                    user_id,
                    "mock-user@example.com",
                    "Mock User",
                    "enc-access",
                    "enc-refresh",
                    datetime(2027, 1, 1, tzinfo=UTC),
                    jsonb(["primary"]),
                    jsonb({}),
                ),
            )
            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_history_id)
                VALUES (%s, 'INBOX', %s)
                """,
                (connection_id, last_history_id),
            )
        conn.commit()
    return connection_id


def test_urgent_schedule_flow_black_box_with_mock_google_workspace(
    auth_client,
    monkeypatch,
    mock_google_workspace_harness,
):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    connection_id = _seed_connection_with_history(
        org_id=org_id,
        user_id=user_id,
        last_history_id=10_000,
    )

    message_id = "msg-urgent-schedule-1"
    mock_google_workspace_harness.seed_gmail_message(
        message_id=message_id,
        subject="Urgent: can we schedule a meeting ASAP?",
        body_text="Need a quick sync as soon as possible.",
        sender="Colleague <contact@example.com>",
        to="Me <me@example.com>",
        history_id="10001",
    )
    mock_google_workspace_harness.set_history_from_messages(
        message_ids=[message_id],
        history_id="10001",
    )

    busy_start = datetime.now(UTC) + timedelta(minutes=5)
    busy_end = busy_start + timedelta(minutes=30)
    mock_google_workspace_harness.seed_calendar_events(
        calendar_id="primary",
        next_sync_token="sync-primary-1",
        events=[
            {
                "id": "evt-busy-primary-1",
                "summary": "Already booked",
                "status": "confirmed",
                "start": {"dateTime": busy_start.isoformat().replace("+00:00", "Z")},
                "end": {"dateTime": busy_end.isoformat().replace("+00:00", "Z")},
                "attendees": [{"email": "contact@example.com"}],
                "organizer": {"email": "me@example.com"},
            }
        ],
    )

    monkeypatch.setattr(
        "app.email.gmail_api.GMAIL_API_BASE",
        mock_google_workspace_harness.gmail_api_base,
    )
    monkeypatch.setattr(
        "app.email.google_calendar_api.GCAL_API_BASE",
        mock_google_workspace_harness.calendar_api_base,
    )
    monkeypatch.setattr(
        "app.email.sync.get_valid_gmail_token",
        lambda *_args, **_kwargs: "mock-access-token",
    )
    monkeypatch.setattr(
        "app.email.routes.get_valid_gmail_token",
        lambda *_args, **_kwargs: "mock-access-token",
    )

    sync_res = auth_client.post(f"/email/connections/{connection_id}/sync")
    assert sync_res.status_code == 200
    sync_payload = sync_res.json()
    assert sync_payload["synced"] == 1
    assert sync_payload["created"] == 1
    assert sync_payload["errors"] == 0
    assert sync_payload["calendar_created"] >= 1
    assert sync_payload["calendar_errors"] == 0

    proposals_res = auth_client.get("/email/proposals")
    assert proposals_res.status_code == 200
    proposals = proposals_res.json()
    assert proposals
    proposal = proposals[0]
    assert proposal["proposal_type"] == "Proposal.PersonalRequest"
    assert proposal["status"] == "pending"
    assert proposal["requires_confirmation"] is True

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT payload
                FROM connector_action_proposals
                WHERE proposal_id = %s
                  AND org_id = %s
                """,
                (proposal["proposal_id"], org_id),
            )
            row = cur.fetchone()
            assert row is not None
            payload = row["payload"]

    event_start = _parse_iso_z(payload["event_start"])
    event_end = _parse_iso_z(payload["event_end"])
    assert event_end - event_start == timedelta(minutes=15)
    assert event_start >= busy_end
    assert payload["urgency"] == "urgent"

    confirm_res = auth_client.post(f"/email/proposals/{proposal['proposal_id']}/confirm")
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "confirmed"

    created_events = mock_google_workspace_harness.calendar_created_events
    assert len(created_events) == 1
    created_call = created_events[0]
    assert created_call["calendar_id"] == "primary"
    assert created_call["body"]["start"]["dateTime"] == payload["event_start"]
    assert created_call["body"]["end"]["dateTime"] == payload["event_end"]

    sent_messages = mock_google_workspace_harness.gmail_sent_messages
    assert len(sent_messages) == 1
    sent_reply = sent_messages[0]
    assert sent_reply["thread_id"] == f"thread-{message_id}"
    assert sent_reply["to"] == "contact@example.com"
    assert "next available 15-minute slot" in sent_reply["body"].lower()
