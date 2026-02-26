"""Seed a deterministic urgent schedule scenario into the mock workspace harness."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta

import httpx


def _iso_z(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed urgent schedule message + busy calendar slot in mock harness.",
    )
    parser.add_argument(
        "--harness-base",
        default="http://127.0.0.1:8891",
        help="Base URL of mock_google_workspace_harness",
    )
    parser.add_argument(
        "--message-id",
        default="msg-urgent-schedule-1",
        help="Mock Gmail message id",
    )
    parser.add_argument(
        "--history-id",
        default="10001",
        help="Gmail history id to emit",
    )
    parser.add_argument(
        "--busy-in-minutes",
        type=int,
        default=5,
        help="Minutes from now when existing busy event starts",
    )
    parser.add_argument(
        "--busy-duration-minutes",
        type=int,
        default=30,
        help="Busy event duration",
    )
    args = parser.parse_args()

    busy_start = datetime.now(UTC) + timedelta(minutes=max(args.busy_in_minutes, 1))
    busy_end = busy_start + timedelta(minutes=max(args.busy_duration_minutes, 1))

    with httpx.Client(base_url=args.harness_base, timeout=10.0) as client:
        response = client.post(
            "/__seed/calendar/events",
            json={
                "calendar_id": "primary",
                "next_sync_token": "sync-primary-1",
                "events": [
                    {
                        "id": "evt-busy-primary-1",
                        "summary": "Already booked",
                        "status": "confirmed",
                        "start": {"dateTime": _iso_z(busy_start)},
                        "end": {"dateTime": _iso_z(busy_end)},
                        "attendees": [{"email": "contact@example.com"}],
                        "organizer": {"email": "me@example.com"},
                    }
                ],
            },
        )
        response.raise_for_status()

        response = client.post(
            "/__seed/gmail/message",
            json={
                "message_id": args.message_id,
                "subject": "Urgent: can we schedule a meeting ASAP?",
                "body_text": "Need a quick sync as soon as possible.",
                "sender": "Colleague <contact@example.com>",
                "to": "Me <me@example.com>",
                "history_id": args.history_id,
                "label_ids": ["INBOX", "UNREAD"],
            },
        )
        response.raise_for_status()

        response = client.post(
            "/__seed/gmail/history",
            json={
                "message_ids": [args.message_id],
                "history_id": args.history_id,
            },
        )
        response.raise_for_status()

    print("Seeded urgent schedule scenario")
    print(f"message_id={args.message_id}")
    print(f"history_id={args.history_id}")
    print(f"busy_start={_iso_z(busy_start)}")
    print(f"busy_end={_iso_z(busy_end)}")


if __name__ == "__main__":
    main()
