"""Gmail REST API v1 client — thin httpx wrappers.

Uses the same pattern as gmail_oauth.py: direct httpx calls with Bearer token auth.
No google-api-python-client dependency.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_TIMEOUT = 30


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def watch(access_token: str, topic_name: str) -> dict[str, Any]:
    """Register push notifications for the user's INBOX.

    Returns {"historyId": "...", "expiration": "..."} where expiration is
    epoch milliseconds (string). Google guarantees at most 7-day expiry.
    """
    response = httpx.post(
        f"{GMAIL_API_BASE}/watch",
        headers=_headers(access_token),
        json={
            "topicName": topic_name,
            "labelIds": ["INBOX"],
        },
        timeout=_TIMEOUT,
    )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    return result


def stop_watch(access_token: str) -> None:
    """Stop push notifications for the user's mailbox."""
    response = httpx.post(
        f"{GMAIL_API_BASE}/stop",
        headers=_headers(access_token),
        timeout=_TIMEOUT,
    )
    # 404 means no active watch — not an error
    if response.status_code == 404:
        logger.debug("No active watch to stop")
        return
    response.raise_for_status()


def history_list(
    access_token: str,
    start_history_id: int,
    *,
    history_types: list[str] | None = None,
    max_results: int = 500,
) -> dict[str, Any]:
    """List history changes since the given history ID.

    Returns the full response including "history" list and "historyId".
    Handles pagination internally, returning all results combined.

    Raises httpx.HTTPStatusError on failure. Caller should handle 404
    (history expired) specially.
    """
    if history_types is None:
        history_types = ["messageAdded", "labelRemoved"]

    all_history: list[dict[str, Any]] = []
    latest_history_id: str = str(start_history_id)
    page_token: str | None = None

    while True:
        params: dict[str, Any] = {
            "startHistoryId": str(start_history_id),
            "maxResults": max_results,
        }
        for _ht in history_types:
            params.setdefault("historyTypes", [])
        if history_types:
            params["historyTypes"] = history_types
        if page_token:
            params["pageToken"] = page_token

        response = httpx.get(
            f"{GMAIL_API_BASE}/history",
            headers=_headers(access_token),
            params=params,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()

        all_history.extend(data.get("history", []))
        latest_history_id = data.get("historyId", latest_history_id)
        page_token = data.get("nextPageToken")

        if not page_token:
            break

    return {"history": all_history, "historyId": latest_history_id}


def message_get(
    access_token: str,
    message_id: str,
    *,
    fmt: str = "full",
) -> dict[str, Any]:
    """Get a single message by ID.

    fmt: "full" (default), "metadata", "minimal", or "raw".
    """
    response = httpx.get(
        f"{GMAIL_API_BASE}/messages/{message_id}",
        headers=_headers(access_token),
        params={"format": fmt},
        timeout=_TIMEOUT,
    )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    return result


def message_modify(
    access_token: str,
    message_id: str,
    *,
    add_label_ids: list[str] | None = None,
    remove_label_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Modify labels on a message (e.g., mark as read by removing UNREAD)."""
    body: dict[str, Any] = {}
    if add_label_ids:
        body["addLabelIds"] = add_label_ids
    if remove_label_ids:
        body["removeLabelIds"] = remove_label_ids

    response = httpx.post(
        f"{GMAIL_API_BASE}/messages/{message_id}/modify",
        headers=_headers(access_token),
        json=body,
        timeout=_TIMEOUT,
    )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    return result


def messages_list(
    access_token: str,
    *,
    query: str = "",
    max_results: int = 100,
) -> list[dict[str, str]]:
    """List message IDs matching a query (for full sync fallback).

    Returns list of {"id": "...", "threadId": "..."} dicts.
    Handles pagination, up to max_results total.
    """
    results: list[dict[str, str]] = []
    page_token: str | None = None

    while len(results) < max_results:
        params: dict[str, Any] = {
            "maxResults": min(100, max_results - len(results)),
        }
        if query:
            params["q"] = query
        if page_token:
            params["pageToken"] = page_token

        response = httpx.get(
            f"{GMAIL_API_BASE}/messages",
            headers=_headers(access_token),
            params=params,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()

        messages = data.get("messages", [])
        results.extend(messages)
        page_token = data.get("nextPageToken")

        if not page_token:
            break

    return results[:max_results]


def send_reply(
    access_token: str,
    *,
    thread_id: str | None,
    to: str,
    subject: str,
    body: str,
    in_reply_to_message_id: str | None = None,
) -> dict[str, Any]:
    """Send a plain-text reply via Gmail API."""
    headers = [
        f"To: {to}",
        f"Subject: {subject}",
        "Content-Type: text/plain; charset=UTF-8",
    ]
    if in_reply_to_message_id:
        headers.append(f"In-Reply-To: {in_reply_to_message_id}")
        headers.append(f"References: {in_reply_to_message_id}")
    raw_email = "\r\n".join(headers) + "\r\n\r\n" + body
    encoded = base64.urlsafe_b64encode(raw_email.encode("utf-8")).decode("ascii")
    payload: dict[str, Any] = {"raw": encoded}
    if thread_id:
        payload["threadId"] = thread_id

    response = httpx.post(
        f"{GMAIL_API_BASE}/messages/send",
        headers=_headers(access_token),
        json=payload,
        timeout=_TIMEOUT,
    )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    return result
