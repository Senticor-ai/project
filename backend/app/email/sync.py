"""Email sync orchestrator — fetch new emails via IMAP and upsert as items.

Follows the same upsert pattern as imports/nirvana/orchestrator.py.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from ..db import db_conn, jsonb
from ..imports.shared import _hash_payload
from ..outbox import enqueue_event
from .gmail_oauth import GMAIL_IMAP_HOST, GMAIL_IMAP_PORT, get_valid_gmail_token
from .imap_client import ImapClient
from .transform import build_email_item

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    """Counts returned after an email sync run."""

    synced: int = 0
    created: int = 0
    skipped: int = 0
    errors: int = 0


def run_email_sync(
    *,
    connection_id: str,
    org_id: str,
    user_id: str,
) -> SyncResult:
    """Fetch new emails from IMAP and upsert them as inbox items.

    Steps:
    1. Load connection row from DB
    2. Get valid OAuth token (refresh if needed)
    3. Create ImapClient with OAuth2 auth
    4. Load sync state (last_seen_uid for INBOX)
    5. Fetch new messages since last UID
    6. Transform each to JSON-LD via transform.py
    7. Upsert into items table (canonical_id deduplication)
    8. Update sync state (new last_seen_uid)
    9. Update connection metadata (last_sync_at, counts, clear errors)
    10. Return SyncResult
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

        # 3. Create IMAP client
        imap = ImapClient(
            host=GMAIL_IMAP_HOST,
            port=GMAIL_IMAP_PORT,
            username=connection["email_address"],
            access_token=access_token,
        )

        # 4. Load sync state
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT last_seen_uid, uidvalidity
                    FROM email_sync_state
                    WHERE connection_id = %s AND folder_name = 'INBOX'
                    """,
                    (connection_id,),
                )
                sync_state = cur.fetchone()

        last_seen_uid = sync_state["last_seen_uid"] if sync_state else 0

        # 5. Fetch new messages
        messages = imap.fetch_since_uid(
            folder="INBOX",
            since_uid=last_seen_uid,
            limit=100,
        )

        if not messages:
            _update_connection_success(connection_id, org_id, 0)
            return result

        result.synced = len(messages)
        max_uid = last_seen_uid

        # 6-7. Transform and upsert each message
        with db_conn() as conn:
            for msg in messages:
                try:
                    canonical_id, entity = build_email_item(msg, source="gmail")
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
                    else:
                        result.skipped += 1

                    # Track highest UID
                    uid_int = int(msg.uid)
                    if uid_int > max_uid:
                        max_uid = uid_int

                except Exception:
                    logger.warning("Failed to upsert email uid=%s", msg.uid, exc_info=True)
                    result.errors += 1

            conn.commit()

        # 8. Update sync state
        _update_sync_state(connection_id, max_uid)

        # 9. Mark read in Gmail if configured
        if connection["sync_mark_read"] and result.created > 0:
            read_uids = [int(m.uid) for m in messages]
            try:
                imap.mark_read("INBOX", read_uids)
            except Exception:
                logger.warning(
                    "Failed to mark emails as read for connection %s",
                    connection_id,
                    exc_info=True,
                )

        # 10. Update connection success
        _update_connection_success(connection_id, org_id, result.synced)

    except Exception as exc:
        logger.exception("Email sync failed for connection %s", connection_id)
        _update_connection_error(connection_id, org_id, str(exc))
        raise

    return result


def _update_sync_state(connection_id: str, last_seen_uid: int) -> None:
    """Update or insert the sync state for INBOX."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_seen_uid)
                VALUES (%s, 'INBOX', %s)
                ON CONFLICT (connection_id, folder_name)
                DO UPDATE SET last_seen_uid = EXCLUDED.last_seen_uid
                """,
                (connection_id, last_seen_uid),
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
    """Mark the original email as read in Gmail IMAP.

    Called when a gmail-sourced item is archived. Extracts the IMAP UID
    from sourceMetadata and uses the connection's credentials to mark it read.

    Silently returns on any error (missing data, no connection, IMAP failure).
    """
    schema = item_row.get("schema_jsonld") or {}
    source_meta = schema.get("sourceMetadata") or {}
    raw = source_meta.get("raw") or {}
    uid_str = raw.get("uid")
    if not uid_str:
        logger.debug("No IMAP UID in item %s, skipping mark-read", item_row.get("item_id"))
        return

    try:
        uid_int = int(uid_str)
    except (ValueError, TypeError):
        logger.debug("Invalid IMAP UID %r in item %s", uid_str, item_row.get("item_id"))
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
        imap = ImapClient(
            host=GMAIL_IMAP_HOST,
            port=GMAIL_IMAP_PORT,
            username=connection["email_address"],
            access_token=access_token,
        )
        imap.mark_read("INBOX", [uid_int])
        logger.info("Marked email UID %d as read for item %s", uid_int, item_row.get("item_id"))
    except Exception:
        logger.warning(
            "Failed to mark email as read for item %s",
            item_row.get("item_id"),
            exc_info=True,
        )


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
