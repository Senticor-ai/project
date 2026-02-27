from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import settings
from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user
from ..email.crypto import CryptoService
from ..observability import get_logger

logger = get_logger("routes.dev")

router = APIRouter(
    prefix="/dev",
    tags=["dev"],
    dependencies=[Depends(get_current_user)],
)


def _require_dev_tools() -> None:
    if not settings.dev_tools_enabled:
        logger.warning(
            "dev.flush.rejected",
            reason="DEV_TOOLS_ENABLED is false",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )


@router.post("/flush", summary="Hard-delete all data for the current org (dev only)")
def flush_org_data(
    current_org=Depends(get_current_org),
):
    _require_dev_tools()

    org_id = current_org["org_id"]
    deleted: dict[str, int] = {}

    with db_conn() as conn:
        with conn.cursor() as cur:
            # Order matters: delete children before parents (FK constraints)

            cur.execute(
                "DELETE FROM search_index_jobs WHERE org_id = %s",
                (org_id,),
            )
            deleted["search_index_jobs"] = cur.rowcount

            cur.execute(
                "DELETE FROM assertions WHERE org_id = %s",
                (org_id,),
            )
            deleted["assertions"] = cur.rowcount

            cur.execute(
                "DELETE FROM idempotency_keys WHERE org_id = %s",
                (org_id,),
            )
            deleted["idempotency_keys"] = cur.rowcount

            cur.execute(
                "DELETE FROM connector_action_audit_log WHERE org_id = %s",
                (org_id,),
            )
            deleted["connector_action_audit_log"] = cur.rowcount

            cur.execute(
                "DELETE FROM connector_action_proposals WHERE org_id = %s",
                (org_id,),
            )
            deleted["connector_action_proposals"] = cur.rowcount

            cur.execute(
                "DELETE FROM proposal_candidates WHERE org_id = %s",
                (org_id,),
            )
            deleted["proposal_candidates"] = cur.rowcount

            cur.execute(
                "DELETE FROM notification_events WHERE org_id = %s",
                (org_id,),
            )
            deleted["notification_events"] = cur.rowcount

            # Clear doc links first: organizations has FK references to items.
            cur.execute(
                """
                UPDATE organizations
                SET general_doc_id = NULL,
                    user_doc_id = NULL,
                    log_doc_id = NULL,
                    agent_doc_id = NULL
                WHERE id = %s
                """,
                (org_id,),
            )
            deleted["org_doc_links_cleared"] = cur.rowcount

            cur.execute(
                "DELETE FROM items WHERE org_id = %s",
                (org_id,),
            )
            deleted["items"] = cur.rowcount

            cur.execute(
                "DELETE FROM import_jobs WHERE org_id = %s",
                (org_id,),
            )
            deleted["import_jobs"] = cur.rowcount

            cur.execute(
                "DELETE FROM file_uploads WHERE org_id = %s",
                (org_id,),
            )
            deleted["file_uploads"] = cur.rowcount

            cur.execute(
                "DELETE FROM files WHERE org_id = %s",
                (org_id,),
            )
            deleted["files"] = cur.rowcount

            # Keep email connections, but reset sync cursors/tokens so the next
            # sync performs a full inbox/calendar backfill.
            cur.execute(
                """
                UPDATE email_sync_state AS state
                SET last_history_id = NULL
                FROM email_connections AS conn
                WHERE state.connection_id = conn.connection_id
                  AND conn.org_id = %s
                  AND conn.is_active = true
                  AND conn.archived_at IS NULL
                """,
                (org_id,),
            )
            deleted["email_sync_state_reset"] = cur.rowcount

            cur.execute(
                """
                UPDATE email_connections
                SET calendar_sync_token = NULL,
                    calendar_sync_tokens = '{}'::jsonb,
                    last_sync_at = NULL,
                    last_sync_error = NULL,
                    last_sync_message_count = NULL,
                    last_calendar_sync_at = NULL,
                    last_calendar_sync_error = NULL,
                    last_calendar_sync_event_count = NULL,
                    updated_at = now()
                WHERE org_id = %s
                  AND is_active = true
                  AND archived_at IS NULL
                """,
                (org_id,),
            )
            deleted["email_connections_sync_reset"] = cur.rowcount

        conn.commit()

    logger.info("dev.flush.completed", org_id=org_id, deleted=deleted)
    return {"ok": True, "deleted": deleted}


class MockWorkspaceConnectionRequest(BaseModel):
    email_address: str = "mock-user@example.com"
    display_name: str = "Mock User"
    last_history_id: int = 10_000
    calendar_selected_ids: list[str] = Field(default_factory=lambda: ["primary"])


@router.post(
    "/mock-workspace/connection",
    summary="Create or refresh a mock Gmail connection for local harness testing",
)
def seed_mock_workspace_connection(
    payload: MockWorkspaceConnectionRequest,
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    _require_dev_tools()

    org_id = current_org["org_id"]
    user_id = str(current_user["id"])
    email_address = payload.email_address.strip().lower()
    if not email_address:
        raise HTTPException(status_code=400, detail="email_address is required")

    selected_calendar_ids = [
        calendar_id.strip()
        for calendar_id in payload.calendar_selected_ids
        if isinstance(calendar_id, str) and calendar_id.strip()
    ]
    if not selected_calendar_ids:
        selected_calendar_ids = ["primary"]

    crypto = CryptoService()
    expires_at = datetime.now(UTC) + timedelta(days=365)
    encrypted_access = crypto.encrypt("mock-access-token")
    encrypted_refresh = crypto.encrypt("mock-refresh-token")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT connection_id
                FROM email_connections
                WHERE org_id = %s
                  AND user_id = %s
                  AND email_address = %s
                  AND archived_at IS NULL
                LIMIT 1
                """,
                (org_id, user_id, email_address),
            )
            existing = cur.fetchone()

            if existing is not None:
                connection_id = str(existing["connection_id"])
                cur.execute(
                    """
                    UPDATE email_connections
                    SET display_name = %s,
                        encrypted_access_token = %s,
                        encrypted_refresh_token = %s,
                        token_expires_at = %s,
                        is_active = true,
                        archived_at = NULL,
                        sync_interval_minutes = 0,
                        sync_mark_read = false,
                        calendar_sync_enabled = true,
                        calendar_selected_ids = %s,
                        calendar_sync_tokens = '{}'::jsonb,
                        last_sync_error = NULL,
                        last_calendar_sync_error = NULL,
                        updated_at = now()
                    WHERE connection_id = %s
                    """,
                    (
                        payload.display_name,
                        encrypted_access,
                        encrypted_refresh,
                        expires_at,
                        jsonb(selected_calendar_ids),
                        connection_id,
                    ),
                )
            else:
                connection_id = str(uuid4())
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
                        email_address,
                        payload.display_name,
                        encrypted_access,
                        encrypted_refresh,
                        expires_at,
                        jsonb(selected_calendar_ids),
                        jsonb({}),
                    ),
                )

            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_history_id)
                VALUES (%s, 'INBOX', %s)
                ON CONFLICT (connection_id, folder_name)
                DO UPDATE SET last_history_id = EXCLUDED.last_history_id
                """,
                (connection_id, payload.last_history_id),
            )
        conn.commit()

    logger.info(
        "dev.mock_workspace.connection_ready",
        org_id=org_id,
        user_id=user_id,
        connection_id=connection_id,
        email_address=email_address,
    )
    return {
        "ok": True,
        "connection_id": connection_id,
        "email_address": email_address,
        "calendar_selected_ids": selected_calendar_ids,
        "last_history_id": payload.last_history_id,
    }
