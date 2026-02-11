"""Email sync orchestrator — fetch new emails via Gmail API and upsert as items.

Uses Gmail API history.list for incremental sync (changes since last historyId)
with full messages.list fallback when history has expired.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from ..config import settings
from ..db import db_conn, jsonb
from ..imports.shared import _hash_payload
from ..outbox import enqueue_event
from . import gmail_api
from .gmail_oauth import get_valid_gmail_token
from .transform import EmailMessage, build_email_item

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    """Counts returned after an email sync run."""

    synced: int = 0
    created: int = 0
    skipped: int = 0
    errors: int = 0


# ---------------------------------------------------------------------------
# Gmail API → EmailMessage bridge
# ---------------------------------------------------------------------------


def _get_header(headers: list[dict], name: str) -> str | None:
    """Extract a header value by name from Gmail API payload headers."""
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value")
    return None


def _extract_body(payload: dict, mime_type: str) -> str | None:
    """Recursively extract body of given MIME type from Gmail API payload."""
    import base64

    if payload.get("mimeType") == mime_type:
        data = (payload.get("body") or {}).get("data")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    for part in payload.get("parts", []):
        result = _extract_body(part, mime_type)
        if result:
            return result
    return None


def _parse_address(raw: str) -> tuple[str | None, str]:
    """Parse 'Display Name <email@example.com>' into (name, email)."""
    raw = raw.strip()
    if "<" in raw and raw.endswith(">"):
        name_part = raw[: raw.index("<")].strip().strip('"')
        email_part = raw[raw.index("<") + 1 : -1].strip()
        return (name_part or None, email_part)
    return (None, raw)


def _parse_recipients(raw_to: str | None, raw_cc: str | None) -> list[dict[str, str]]:
    """Parse To and Cc header values into recipient dicts."""
    recipients: list[dict[str, str]] = []
    for raw, rtype in [(raw_to, "to"), (raw_cc, "cc")]:
        if not raw:
            continue
        for addr in raw.split(","):
            addr = addr.strip()
            if not addr:
                continue
            name, email = _parse_address(addr)
            entry: dict[str, str] = {"email": email, "type": rtype}
            if name:
                entry["name"] = name
            recipients.append(entry)
    return recipients


def gmail_api_to_email_message(gmail_msg: dict) -> EmailMessage:
    """Convert a Gmail API message response to our EmailMessage dataclass.

    This bridges the Gmail API format to the existing transform pipeline.
    """
    payload = gmail_msg.get("payload", {})
    headers = payload.get("headers", [])

    # Parse sender
    from_raw = _get_header(headers, "From") or ""
    sender_name, sender_email = _parse_address(from_raw)

    # Parse recipients
    raw_to = _get_header(headers, "To")
    raw_cc = _get_header(headers, "Cc")
    recipients = _parse_recipients(raw_to, raw_cc)

    # Parse date
    internal_date_ms = gmail_msg.get("internalDate")
    received_at: datetime | None = None
    if internal_date_ms:
        received_at = datetime.fromtimestamp(int(internal_date_ms) / 1000, tz=UTC)

    # Extract body
    body_html = _extract_body(payload, "text/html")
    body_text = _extract_body(payload, "text/plain")

    # Message-ID header
    message_id = _get_header(headers, "Message-ID") or _get_header(headers, "Message-Id")

    return EmailMessage(
        uid=gmail_msg["id"],
        message_id=message_id,
        subject=_get_header(headers, "Subject"),
        sender_email=sender_email,
        sender_name=sender_name,
        recipients=recipients,
        received_at=received_at,
        body_text=body_text,
        body_html=body_html,
        attachments=[],
    )


# ---------------------------------------------------------------------------
# Core sync
# ---------------------------------------------------------------------------


def run_email_sync(
    *,
    connection_id: str,
    org_id: str,
    user_id: str,
) -> SyncResult:
    """Fetch new emails via Gmail API and upsert them as inbox items.

    Steps:
    1. Load connection row from DB
    2. Get valid OAuth token (refresh if needed)
    3. Load sync state (last_history_id for INBOX)
    4. Use history.list for incremental changes (or messages.list as fallback)
    5. For each new message: message.get → parse → build_email_item → upsert
    6. Update last_history_id in sync state
    7. Mark read via Gmail API if sync_mark_read is enabled
    8. Update connection metadata (last_sync_at, counts, clear errors)
    """
    result = SyncResult()

    # 1. Load connection
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM email_connections
                WHERE connection_id = %s AND org_id = %s AND is_active = true
                """,
                (connection_id, org_id),
            )
            connection = cur.fetchone()

    if not connection:
        raise ValueError(f"Active connection {connection_id} not found")

    try:
        # 2. Get valid token
        access_token = get_valid_gmail_token(connection, org_id)

        # 3. Load sync state
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT last_history_id
                    FROM email_sync_state
                    WHERE connection_id = %s AND folder_name = 'INBOX'
                    """,
                    (connection_id,),
                )
                sync_state = cur.fetchone()

        last_history_id = sync_state["last_history_id"] if sync_state else None

        # 4. Collect new message IDs
        new_message_ids: list[str] = []
        new_history_id: str | None = None

        if last_history_id:
            try:
                history_data = gmail_api.history_list(
                    access_token,
                    last_history_id,
                )
                new_history_id = history_data.get("historyId")

                # Extract unique message IDs from history
                seen_ids: set[str] = set()
                for entry in history_data.get("history", []):
                    for added in entry.get("messagesAdded", []):
                        msg_stub = added.get("message", {})
                        msg_id = msg_stub.get("id")
                        label_ids = msg_stub.get("labelIds", [])
                        if msg_id and msg_id not in seen_ids and "INBOX" in label_ids:
                            new_message_ids.append(msg_id)
                            seen_ids.add(msg_id)

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    logger.warning(
                        "History expired for connection %s, falling back to full list",
                        connection_id,
                    )
                    last_history_id = None  # trigger full sync below
                else:
                    raise

        if last_history_id is None:
            # Full sync fallback: list recent inbox messages
            msg_stubs = gmail_api.messages_list(
                access_token,
                query="in:inbox newer_than:7d",
                max_results=100,
            )
            new_message_ids = [m["id"] for m in msg_stubs]
            # We'll get the historyId from the first fetched message

        if not new_message_ids:
            _update_connection_success(connection_id, org_id, 0)
            return result

        # 5. Fetch full messages, transform, and upsert
        gmail_msg_ids_for_mark_read: list[str] = []
        result.synced = len(new_message_ids)

        with db_conn() as conn:
            for msg_id in new_message_ids:
                try:
                    gmail_msg = gmail_api.message_get(access_token, msg_id)

                    # Update history ID from first fetched message
                    if new_history_id is None:
                        new_history_id = str(gmail_msg.get("historyId", ""))

                    email_msg = gmail_api_to_email_message(gmail_msg)
                    canonical_id, entity = build_email_item(email_msg, source="gmail")

                    # Inject gmailMessageId into sourceMetadata for mark-read support
                    source_meta = entity.get("sourceMetadata", {})
                    raw = source_meta.get("raw", {})
                    raw["gmailMessageId"] = msg_id
                    source_meta["raw"] = raw
                    entity["sourceMetadata"] = source_meta

                    content_hash = _hash_payload(entity)

                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO items (
                                org_id, created_by_user_id, canonical_id,
                                schema_jsonld, source, content_hash,
                                created_at, updated_at
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (org_id, canonical_id) DO NOTHING
                            RETURNING item_id
                            """,
                            (
                                org_id,
                                user_id,
                                canonical_id,
                                jsonb(entity),
                                "gmail",
                                content_hash,
                                datetime.now(UTC),
                                datetime.now(UTC),
                            ),
                        )
                        row = cur.fetchone()

                    if row:
                        result.created += 1
                        gmail_msg_ids_for_mark_read.append(msg_id)
                    else:
                        result.skipped += 1

                except Exception:
                    logger.warning("Failed to upsert email msg_id=%s", msg_id, exc_info=True)
                    result.errors += 1

            conn.commit()

        # 6. Update sync state with new history ID
        if new_history_id:
            _update_sync_state(connection_id, int(new_history_id))

        # 7. Mark read in Gmail if configured
        if connection["sync_mark_read"] and gmail_msg_ids_for_mark_read:
            for gm_id in gmail_msg_ids_for_mark_read:
                try:
                    gmail_api.message_modify(
                        access_token,
                        gm_id,
                        remove_label_ids=["UNREAD"],
                    )
                except Exception:
                    logger.warning(
                        "Failed to mark email %s as read",
                        gm_id,
                        exc_info=True,
                    )

        # 8. Update connection success
        _update_connection_success(connection_id, org_id, result.synced)

    except Exception as exc:
        logger.exception("Email sync failed for connection %s", connection_id)
        _update_connection_error(connection_id, org_id, str(exc))
        raise

    return result


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _update_sync_state(connection_id: str, last_history_id: int) -> None:
    """Update or insert the sync state for INBOX."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_history_id)
                VALUES (%s, 'INBOX', %s)
                ON CONFLICT (connection_id, folder_name)
                DO UPDATE SET last_history_id = EXCLUDED.last_history_id
                """,
                (connection_id, last_history_id),
            )
        conn.commit()


def _update_connection_success(connection_id: str, org_id: str, message_count: int) -> None:
    """Update connection after successful sync."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET last_sync_at = now(),
                    last_sync_message_count = %s,
                    last_sync_error = NULL,
                    updated_at = now()
                WHERE connection_id = %s AND org_id = %s
                """,
                (message_count, connection_id, org_id),
            )
        conn.commit()


def _update_connection_error(connection_id: str, org_id: str, error_message: str) -> None:
    """Update connection after failed sync."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET last_sync_error = %s,
                    updated_at = now()
                WHERE connection_id = %s AND org_id = %s
                """,
                (error_message[:500], connection_id, org_id),
            )
        conn.commit()


# ---------------------------------------------------------------------------
# Watch management
# ---------------------------------------------------------------------------


def register_watch(connection_id: str, org_id: str) -> dict | None:
    """Register Gmail API push notifications for a connection.

    Returns the watch response dict or None if watch is not enabled.
    """
    if not settings.gmail_watch_enabled:
        return None

    topic = settings.gmail_pubsub_topic
    if not topic:
        logger.warning("gmail_pubsub_topic not configured, skipping watch registration")
        return None

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM email_connections
                WHERE connection_id = %s AND org_id = %s AND is_active = true
                """,
                (connection_id, org_id),
            )
            connection = cur.fetchone()

    if not connection:
        logger.warning("Connection %s not found for watch registration", connection_id)
        return None

    access_token = get_valid_gmail_token(connection, org_id)
    watch_result = gmail_api.watch(access_token, topic)

    # Store watch metadata
    expiration_ms = int(watch_result.get("expiration", "0"))
    watch_expiration = (
        datetime.fromtimestamp(expiration_ms / 1000, tz=UTC) if expiration_ms else None
    )
    watch_history_id = watch_result.get("historyId")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET watch_expiration = %s,
                    watch_history_id = %s,
                    updated_at = now()
                WHERE connection_id = %s AND org_id = %s
                """,
                (watch_expiration, watch_history_id, connection_id, org_id),
            )
        conn.commit()

    # Also update sync state with the watch history ID if we don't have one yet
    if watch_history_id:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO email_sync_state (connection_id, folder_name, last_history_id)
                    VALUES (%s, 'INBOX', %s)
                    ON CONFLICT (connection_id, folder_name)
                    DO UPDATE SET last_history_id = COALESCE(
                        email_sync_state.last_history_id,
                        EXCLUDED.last_history_id
                    )
                    """,
                    (connection_id, int(watch_history_id)),
                )
            conn.commit()

    logger.info(
        "Registered watch for connection %s, expires %s",
        connection_id,
        watch_expiration,
    )
    return watch_result


def stop_watch_for_connection(connection_id: str, org_id: str) -> None:
    """Stop Gmail API push notifications for a connection."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM email_connections
                WHERE connection_id = %s AND org_id = %s AND is_active = true
                """,
                (connection_id, org_id),
            )
            connection = cur.fetchone()

    if not connection:
        return

    try:
        access_token = get_valid_gmail_token(connection, org_id)
        gmail_api.stop_watch(access_token)
    except Exception:
        logger.warning("Failed to stop watch for connection %s", connection_id, exc_info=True)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET watch_expiration = NULL,
                    watch_history_id = NULL,
                    updated_at = now()
                WHERE connection_id = %s AND org_id = %s
                """,
                (connection_id, org_id),
            )
        conn.commit()


# ---------------------------------------------------------------------------
# Periodic reconciliation
# ---------------------------------------------------------------------------


def enqueue_due_syncs() -> int:
    """Find email connections that are due for sync and enqueue events.

    A connection is due when:
    - is_active = true
    - sync_interval_minutes > 0
    - last_sync_at IS NULL OR last_sync_at + interval < now()

    Returns the number of events enqueued.
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT connection_id, org_id, user_id
                FROM email_connections
                WHERE is_active = true
                  AND sync_interval_minutes > 0
                  AND (
                    last_sync_at IS NULL
                    OR last_sync_at + (sync_interval_minutes || ' minutes')::interval < now()
                  )
                """,
            )
            rows = cur.fetchall()

    count = 0
    for row in rows:
        enqueue_event(
            "email_sync_job",
            {
                "connection_id": str(row["connection_id"]),
                "org_id": str(row["org_id"]),
                "user_id": str(row["user_id"]),
            },
        )
        count += 1

    if count:
        logger.info("Enqueued %d email sync jobs", count)
    return count


def mark_email_read(item_row: dict, org_id: str) -> None:
    """Mark the original email as read in Gmail via API.

    Called when a gmail-sourced item is archived. Extracts the Gmail message ID
    from sourceMetadata and uses the connection's credentials to modify labels.

    Silently returns on any error (missing data, no connection, API failure).
    """
    schema = item_row.get("schema_jsonld") or {}
    source_meta = schema.get("sourceMetadata") or {}
    raw = source_meta.get("raw") or {}
    gmail_message_id = raw.get("gmailMessageId")
    if not gmail_message_id:
        logger.debug("No gmailMessageId in item %s, skipping mark-read", item_row.get("item_id"))
        return

    # Find the user's active email connection
    user_id = str(item_row.get("created_by_user_id", ""))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM email_connections
                WHERE org_id = %s AND user_id = %s AND is_active = true
                LIMIT 1
                """,
                (org_id, user_id),
            )
            connection = cur.fetchone()

    if not connection:
        logger.debug(
            "No active email connection for org=%s user=%s, skipping mark-read",
            org_id,
            user_id,
        )
        return

    try:
        access_token = get_valid_gmail_token(connection, org_id)
        gmail_api.message_modify(
            access_token,
            gmail_message_id,
            remove_label_ids=["UNREAD"],
        )
        logger.info(
            "Marked email %s as read for item %s",
            gmail_message_id,
            item_row.get("item_id"),
        )
    except Exception:
        logger.warning(
            "Failed to mark email as read for item %s",
            item_row.get("item_id"),
            exc_info=True,
        )
