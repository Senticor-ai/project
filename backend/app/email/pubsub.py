"""Cloud Pub/Sub pull client for Gmail watch notifications.

Uses google-auth for service account credentials and httpx for REST calls.
No google-cloud-pubsub dependency.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

PUBSUB_API_BASE = "https://pubsub.googleapis.com/v1"
PUBSUB_SCOPES = ["https://www.googleapis.com/auth/pubsub"]
_TIMEOUT = 30


@dataclass
class PubSubMessage:
    """Parsed Gmail push notification from Pub/Sub."""

    ack_id: str
    email_address: str
    history_id: int
    publish_time: str


class PubSubClient:
    """Pub/Sub pull subscriber using httpx + google-auth."""

    def __init__(
        self,
        project_id: str,
        subscription_id: str,
        credentials_file: str,
    ):
        self.subscription_path = f"projects/{project_id}/subscriptions/{subscription_id}"
        self._credentials = Credentials.from_service_account_file(
            str(Path(credentials_file).resolve()),
            scopes=PUBSUB_SCOPES,
        )

    def _get_token(self) -> str:
        """Get a valid access token, refreshing if needed."""
        if not self._credentials.valid:
            self._credentials.refresh(GoogleAuthRequest())
        token: str | None = self._credentials.token
        if not token:
            raise RuntimeError("Failed to obtain Pub/Sub access token")
        return token

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._get_token()}"}

    def pull(self, max_messages: int = 100) -> list[PubSubMessage]:
        """Pull messages from the subscription.

        Returns parsed PubSubMessage objects. Messages that can't be parsed
        are logged and skipped (their ack_ids are still returned so they
        can be acknowledged to prevent redelivery).
        """
        response = httpx.post(
            f"{PUBSUB_API_BASE}/{self.subscription_path}:pull",
            headers=self._headers(),
            json={"maxMessages": max_messages},
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()

        received = data.get("receivedMessages", [])
        messages: list[PubSubMessage] = []

        for rm in received:
            ack_id = rm.get("ackId", "")
            msg = rm.get("message", {})
            publish_time = msg.get("publishTime", "")

            raw_data = msg.get("data", "")
            try:
                decoded = base64.b64decode(raw_data).decode("utf-8")
                payload: dict[str, Any] = json.loads(decoded)
                email_address = payload.get("emailAddress", "")
                history_id = int(payload.get("historyId", 0))

                if not email_address or not history_id:
                    logger.warning(
                        "Pub/Sub message missing emailAddress or historyId: %s",
                        decoded[:200],
                    )
                    # Still add with empty values so it can be acked
                    messages.append(
                        PubSubMessage(
                            ack_id=ack_id,
                            email_address=email_address,
                            history_id=history_id,
                            publish_time=publish_time,
                        )
                    )
                    continue

                messages.append(
                    PubSubMessage(
                        ack_id=ack_id,
                        email_address=email_address,
                        history_id=history_id,
                        publish_time=publish_time,
                    )
                )
            except Exception:
                logger.warning(
                    "Failed to parse Pub/Sub message data: %s",
                    raw_data[:200],
                    exc_info=True,
                )
                # Return with empty fields so we still ack it
                messages.append(
                    PubSubMessage(
                        ack_id=ack_id,
                        email_address="",
                        history_id=0,
                        publish_time=publish_time,
                    )
                )

        return messages

    def acknowledge(self, ack_ids: list[str]) -> None:
        """Acknowledge messages by their ack IDs."""
        if not ack_ids:
            return
        response = httpx.post(
            f"{PUBSUB_API_BASE}/{self.subscription_path}:acknowledge",
            headers=self._headers(),
            json={"ackIds": ack_ids},
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
