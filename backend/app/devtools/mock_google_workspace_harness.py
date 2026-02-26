"""Deterministic mock Gmail + Google Calendar service for dev + e2e tests."""

from __future__ import annotations

import argparse
import base64
import copy
import socket
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field


def _get_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
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
    calendar_deleted_events: list[dict[str, Any]] = field(default_factory=list)


class SeedGmailMessageRequest(BaseModel):
    message_id: str
    subject: str
    body_text: str
    sender: str
    to: str
    history_id: str
    label_ids: list[str] = Field(default_factory=lambda: ["INBOX", "UNREAD"])
    internal_date_ms: str | None = None


class SeedHistoryRequest(BaseModel):
    message_ids: list[str]
    history_id: str


class SeedCalendarEventsRequest(BaseModel):
    calendar_id: str
    events: list[dict[str, Any]]
    next_sync_token: str = "sync-default"


def _build_app(state: _MockWorkspaceState, lock: threading.Lock) -> FastAPI:
    app = FastAPI(title="Mock Google Workspace Harness")

    @app.get("/__health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/__state")
    async def debug_state() -> dict[str, Any]:
        with lock:
            return {
                "gmail_messages": copy.deepcopy(state.gmail_messages),
                "gmail_history": copy.deepcopy(state.gmail_history),
                "gmail_history_id": state.gmail_history_id,
                "gmail_sent_messages": copy.deepcopy(state.gmail_sent_messages),
                "gmail_modify_calls": copy.deepcopy(state.gmail_modify_calls),
                "calendar_events": copy.deepcopy(state.calendar_events),
                "calendar_next_sync_tokens": copy.deepcopy(state.calendar_next_sync_tokens),
                "calendar_created_events": copy.deepcopy(state.calendar_created_events),
                "calendar_updated_events": copy.deepcopy(state.calendar_updated_events),
                "calendar_deleted_events": copy.deepcopy(state.calendar_deleted_events),
            }

    @app.post("/__reset")
    async def reset() -> dict[str, bool]:
        with lock:
            state.gmail_messages = {}
            state.gmail_history = []
            state.gmail_history_id = "10001"
            state.gmail_sent_messages = []
            state.gmail_modify_calls = []
            state.calendar_events = {}
            state.calendar_next_sync_tokens = {}
            state.calendar_created_events = []
            state.calendar_updated_events = []
            state.calendar_deleted_events = []
        return {"ok": True}

    @app.post("/__seed/gmail/message")
    async def seed_gmail_message(payload: SeedGmailMessageRequest) -> dict[str, str]:
        message_id = payload.message_id
        thread_id = f"thread-{message_id}"
        message = {
            "id": message_id,
            "threadId": thread_id,
            "labelIds": list(payload.label_ids),
            "historyId": payload.history_id,
            "internalDate": payload.internal_date_ms
            or str(int(datetime.now(UTC).timestamp() * 1000)),
            "payload": {
                "mimeType": "multipart/alternative",
                "headers": [
                    {"name": "Subject", "value": payload.subject},
                    {"name": "From", "value": payload.sender},
                    {"name": "To", "value": payload.to},
                    {"name": "Message-ID", "value": f"<{message_id}@mock.localhost>"},
                ],
                "parts": [
                    {
                        "mimeType": "text/plain",
                        "body": {"data": _encode_text_payload(payload.body_text)},
                    }
                ],
            },
        }
        with lock:
            state.gmail_messages[message_id] = message
        return {"ok": "true", "message_id": message_id}

    @app.post("/__seed/gmail/history")
    async def seed_gmail_history(payload: SeedHistoryRequest) -> dict[str, str]:
        history: list[dict[str, Any]] = []
        with lock:
            for idx, message_id in enumerate(payload.message_ids):
                labels = state.gmail_messages.get(message_id, {}).get(
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
            state.gmail_history = history
            state.gmail_history_id = payload.history_id
        return {"ok": "true", "history_id": payload.history_id}

    @app.post("/__seed/calendar/events")
    async def seed_calendar_events(payload: SeedCalendarEventsRequest) -> dict[str, str]:
        with lock:
            state.calendar_events[payload.calendar_id] = copy.deepcopy(payload.events)
            state.calendar_next_sync_tokens[payload.calendar_id] = payload.next_sync_token
        return {"ok": "true", "calendar_id": payload.calendar_id}

    @app.post("/gmail/v1/users/me/watch")
    async def gmail_watch() -> dict[str, str]:
        expiration = int((datetime.now(UTC) + timedelta(days=7)).timestamp() * 1000)
        with lock:
            history_id = state.gmail_history_id
        return {
            "historyId": history_id,
            "expiration": str(expiration),
        }

    @app.post("/gmail/v1/users/me/stop")
    async def gmail_stop() -> dict[str, bool]:
        return {"ok": True}

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
        with lock:
            calendar_ids = list(state.calendar_events.keys()) or ["primary"]
        return {
            "items": [
                {
                    "id": calendar_id,
                    "summary": "Primary" if calendar_id == "primary" else calendar_id,
                    "primary": calendar_id == "primary",
                    "accessRole": "owner",
                }
                for calendar_id in calendar_ids
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

    @app.get("/calendar/v3/calendars/{calendar_id}/events/{event_id}")
    async def calendar_get_event(calendar_id: str, event_id: str) -> dict[str, Any]:
        with lock:
            events = state.calendar_events.get(calendar_id, [])
            for event in events:
                if str(event.get("id")) == event_id:
                    return copy.deepcopy(event)
        raise HTTPException(status_code=404, detail="Event not found")

    @app.patch("/calendar/v3/calendars/{calendar_id}/events/{event_id}")
    async def calendar_update_event(
        calendar_id: str,
        event_id: str,
        request: Request,
    ) -> dict[str, Any]:
        payload = await request.json()
        with lock:
            events = state.calendar_events.setdefault(calendar_id, [])
            updated_event = {"id": event_id, **payload}
            replaced = False
            for idx, existing in enumerate(events):
                if str(existing.get("id")) == event_id:
                    merged = copy.deepcopy(existing)
                    merged.update(payload)
                    updated_event = {"id": event_id, **merged}
                    events[idx] = copy.deepcopy(updated_event)
                    replaced = True
                    break
            if not replaced:
                events.append(copy.deepcopy(updated_event))
            state.calendar_updated_events.append(
                {
                    "calendar_id": calendar_id,
                    "event_id": event_id,
                    "body": copy.deepcopy(payload),
                    "response": copy.deepcopy(updated_event),
                }
            )
        return updated_event

    @app.delete("/calendar/v3/calendars/{calendar_id}/events/{event_id}")
    async def calendar_delete_event(calendar_id: str, event_id: str) -> dict[str, Any]:
        with lock:
            events = state.calendar_events.setdefault(calendar_id, [])
            remaining = [
                copy.deepcopy(event)
                for event in events
                if str(event.get("id")) != event_id
            ]
            deleted = len(remaining) != len(events)
            state.calendar_events[calendar_id] = remaining
            state.calendar_deleted_events.append(
                {
                    "calendar_id": calendar_id,
                    "event_id": event_id,
                    "deleted": deleted,
                }
            )
        if not deleted:
            raise HTTPException(status_code=404, detail="Event not found")
        return {"id": event_id}

    return app


class MockGoogleWorkspaceHarness:
    """In-process runner used by tests and manual local workflows."""

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

    @property
    def calendar_updated_events(self) -> list[dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._state.calendar_updated_events)

    @property
    def calendar_deleted_events(self) -> list[dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._state.calendar_deleted_events)

    def stop(self) -> None:
        self._server.should_exit = True
        self._thread.join(timeout=5)

    def reset(self) -> None:
        with self._lock:
            self._state.gmail_messages = {}
            self._state.gmail_history = []
            self._state.gmail_history_id = "10001"
            self._state.gmail_sent_messages = []
            self._state.gmail_modify_calls = []
            self._state.calendar_events = {}
            self._state.calendar_next_sync_tokens = {}
            self._state.calendar_created_events = []
            self._state.calendar_updated_events = []
            self._state.calendar_deleted_events = []

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
    def start(
        cls,
        *,
        host: str = "127.0.0.1",
        port: int | None = None,
    ) -> MockGoogleWorkspaceHarness:
        state = _MockWorkspaceState()
        lock = threading.Lock()
        app = _build_app(state, lock)

        resolved_port = port or _get_free_port(host)
        config = uvicorn.Config(
            app,
            host=host,
            port=resolved_port,
            log_level="warning",
            access_log=False,
            ws="none",
        )
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()

        base_url = f"http://{host}:{resolved_port}"
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


def create_app() -> FastAPI:
    """Standalone app factory for `python -m ...mock_google_workspace_harness`."""
    return _build_app(_MockWorkspaceState(), threading.Lock())


def main() -> None:
    parser = argparse.ArgumentParser(description="Run mock Gmail/Calendar harness")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8891)
    args = parser.parse_args()

    uvicorn.run(
        create_app(),
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=False,
        ws="none",
    )


if __name__ == "__main__":
    main()
