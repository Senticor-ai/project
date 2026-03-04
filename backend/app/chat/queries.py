"""Chat conversation and message persistence."""

from __future__ import annotations

from ..db import db_conn, jsonb


def get_or_create_conversation(
    org_id: str,
    user_id: str,
    external_id: str,
    agent_backend: str = "haystack",
) -> dict:
    """Find existing conversation by external_id + agent_backend, or create one.

    Uses INSERT ... ON CONFLICT DO NOTHING + SELECT for idempotency.
    Each agent backend gets its own conversation even with the same external_id.
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversations (org_id, user_id, external_id, agent_backend)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (org_id, external_id, agent_backend)
                    WHERE archived_at IS NULL
                DO NOTHING
                """,
                (org_id, user_id, external_id, agent_backend),
            )
            cur.execute(
                """
                SELECT conversation_id, org_id, user_id, external_id,
                       agent_backend, title, created_at, updated_at
                FROM conversations
                WHERE org_id = %s AND external_id = %s
                      AND agent_backend = %s AND archived_at IS NULL
                """,
                (org_id, external_id, agent_backend),
            )
            row = cur.fetchone()
        conn.commit()
    assert row is not None
    return row


def save_message(
    conversation_id: str,
    role: str,
    content: str,
    tool_calls: list[dict] | None = None,
) -> dict:
    """Insert a chat message. Returns the message row."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chat_messages (conversation_id, role, content, tool_calls)
                VALUES (%s, %s, %s, %s)
                RETURNING message_id, conversation_id, role, content, tool_calls, created_at
                """,
                (conversation_id, role, content, jsonb(tool_calls) if tool_calls else None),
            )
            row = cur.fetchone()
        conn.commit()
    assert row is not None
    return row


def list_conversations(
    org_id: str,
    user_id: str,
    agent_backend: str = "haystack",
    limit: int = 50,
) -> list[dict]:
    """List active (non-archived) conversations for a user, newest first."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT conversation_id, org_id, user_id, external_id,
                       agent_backend, title, created_at, updated_at
                FROM conversations
                WHERE org_id = %s AND user_id = %s AND agent_backend = %s
                      AND archived_at IS NULL
                ORDER BY updated_at DESC
                LIMIT %s
                """,
                (org_id, user_id, agent_backend, limit),
            )
            rows = cur.fetchall()
    return rows


def archive_conversation(conversation_id: str, org_id: str) -> bool:
    """Soft-delete a conversation by setting archived_at. Returns True if a row was updated."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE conversations
                SET archived_at = now()
                WHERE conversation_id = %s AND org_id = %s AND archived_at IS NULL
                """,
                (conversation_id, org_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
    return updated


def create_chat_request(
    request_id: str,
    conversation_id: str,
    user_id: str,
) -> dict:
    """Create a chat request tracking row with status='accepted'."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chat_requests (request_id, conversation_id, user_id, status)
                VALUES (%s, %s, %s, 'accepted')
                RETURNING request_id, conversation_id, user_id, status,
                          error_detail, error_type, created_at, updated_at
                """,
                (request_id, conversation_id, user_id),
            )
            row = cur.fetchone()
        conn.commit()
    assert row is not None
    return row


def update_chat_request_status(
    request_id: str,
    status: str,
    error_detail: str | None = None,
    error_type: str | None = None,
) -> bool:
    """Update chat request status. Returns True if a row was updated."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE chat_requests
                SET status = %s,
                    error_detail = %s,
                    error_type = %s,
                    updated_at = now()
                WHERE request_id = %s
                """,
                (status, error_detail, error_type, request_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
    return updated


def get_chat_request(request_id: str) -> dict | None:
    """Fetch a chat request by ID. Returns None if not found."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_id, conversation_id, user_id, status,
                       error_detail, error_type, created_at, updated_at
                FROM chat_requests
                WHERE request_id = %s
                """,
                (request_id,),
            )
            return cur.fetchone()


def get_reconciliation_report(conversation_id: str) -> dict:
    """Check for gaps where a user message has no following assistant response."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT message_id, role, created_at
                FROM chat_messages
                WHERE conversation_id = %s
                ORDER BY created_at ASC
                """,
                (conversation_id,),
            )
            messages = cur.fetchall()

    gaps: list[dict] = []
    for i, msg in enumerate(messages):
        if msg["role"] == "user":
            if i + 1 >= len(messages) or messages[i + 1]["role"] != "assistant":
                gaps.append(
                    {
                        "userMessageId": str(msg["message_id"]),
                        "createdAt": msg["created_at"].isoformat(),
                        "issue": "missing_assistant_response",
                    }
                )
    return {
        "conversationId": conversation_id,
        "totalMessages": len(messages),
        "gaps": gaps,
        "status": "ok" if not gaps else "divergent",
    }


def get_conversation_messages(conversation_id: str, limit: int = 50) -> list[dict]:
    """Fetch last N messages for a conversation, ordered chronologically.

    Uses a subquery to get the last N messages by created_at DESC,
    then re-orders them ASC so the conversation reads naturally.
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM (
                    SELECT message_id, conversation_id, role, content, tool_calls, created_at
                    FROM chat_messages
                    WHERE conversation_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                ) sub
                ORDER BY created_at ASC
                """,
                (conversation_id, limit),
            )
            rows = cur.fetchall()
    return rows
