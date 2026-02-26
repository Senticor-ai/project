"""Proposal candidate queue and generation service."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from ..db import db_conn, jsonb
from ..notifications import create_notification_event
from .cel_rules import evaluate_rule

logger = logging.getLogger(__name__)

_RESCHEDULE_KEYWORDS = ("reschedule", "verschieb", "verschieben", "move", "verlegen")
_PICKUP_KEYWORDS = ("pick up", "pickup", "abholen", "kinder", "kids")
_SCHEDULE_KEYWORDS = (
    "schedule",
    "as soon as possible",
    "meeting",
    "meet",
    "appointment",
    "termin",
    "call",
)
_URGENT_KEYWORDS = ("urgent", "asap", "today", "heute", "now", "sofort")
_URGENT_WINDOW = timedelta(hours=4)


@dataclass
class ProposalCandidateProcessResult:
    processed: int = 0
    created: int = 0
    existing: int = 0
    failed: int = 0
    dead_lettered: int = 0


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _iso_z(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _email_text(email_item: dict[str, Any]) -> str:
    schema = email_item.get("schema_jsonld") or {}
    return f"{schema.get('name') or ''} {schema.get('description') or ''}".lower()


def _has_any_keyword(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _rule(rule_id: str, context: dict[str, Any], *, default: bool) -> bool:
    return evaluate_rule(rule_id, context, default=default)


def _email_sender(email_item: dict[str, Any]) -> str:
    schema = email_item.get("schema_jsonld") or {}
    raw = (schema.get("sourceMetadata") or {}).get("raw") or {}
    sender = raw.get("from")
    return str(sender).strip().lower() if sender else ""


def _calendar_start(calendar_item: dict[str, Any]) -> datetime | None:
    schema = calendar_item.get("schema_jsonld") or {}
    return _parse_iso(schema.get("startDate"))


def _calendar_end(calendar_item: dict[str, Any]) -> datetime | None:
    schema = calendar_item.get("schema_jsonld") or {}
    return _parse_iso(schema.get("endDate"))


def _calendar_attendees(calendar_item: dict[str, Any]) -> set[str]:
    schema = calendar_item.get("schema_jsonld") or {}
    raw = (schema.get("sourceMetadata") or {}).get("raw") or {}
    attendees_raw = raw.get("attendees")
    if not isinstance(attendees_raw, list):
        return set()
    emails: set[str] = set()
    for entry in attendees_raw:
        if not isinstance(entry, dict):
            continue
        email = entry.get("email")
        if isinstance(email, str) and email.strip():
            emails.add(email.strip().lower())
    return emails


def _round_up_to_quarter(value: datetime) -> datetime:
    rounded = value.astimezone(UTC).replace(second=0, microsecond=0)
    minute_mod = rounded.minute % 15
    if minute_mod == 0 and value.second == 0 and value.microsecond == 0:
        return rounded
    add_minutes = 15 - minute_mod if minute_mod else 15
    return rounded + timedelta(minutes=add_minutes)


def _next_available_slot(
    *,
    calendar_items: list[dict[str, Any]],
    duration_minutes: int,
) -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    cursor = _round_up_to_quarter(now)
    duration = timedelta(minutes=max(duration_minutes, 1))

    busy_intervals: list[tuple[datetime, datetime]] = []
    for calendar_item in calendar_items:
        start_dt = _calendar_start(calendar_item)
        if start_dt is None:
            continue
        end_dt = _calendar_end(calendar_item) or (start_dt + timedelta(minutes=30))
        if end_dt <= now:
            continue
        busy_intervals.append((start_dt, end_dt))

    busy_intervals.sort(key=lambda interval: interval[0])

    for start_dt, end_dt in busy_intervals:
        if end_dt <= cursor:
            continue
        if start_dt > cursor:
            if (start_dt - cursor) >= duration:
                return cursor, cursor + duration
            # The free gap before this event is too short for the meeting.
            cursor = _round_up_to_quarter(end_dt)
            continue
        if start_dt <= cursor < end_dt:
            cursor = _round_up_to_quarter(end_dt)

    return cursor, cursor + duration


def _list_recent_email_items(
    *,
    org_id: str,
    user_id: str,
    source_item_ids: list[str] | None,
    limit: int,
) -> list[dict[str, Any]]:
    safe_limit = min(max(limit, 1), 100)
    with db_conn() as conn:
        with conn.cursor() as cur:
            if source_item_ids:
                source_ids = [UUID(value) for value in source_item_ids]
                cur.execute(
                    """
                    SELECT item_id, schema_jsonld
                    FROM items
                    WHERE org_id = %s
                      AND created_by_user_id = %s
                      AND source = 'gmail'
                      AND archived_at IS NULL
                      AND item_id = ANY(%s)
                    ORDER BY created_at DESC
                    """,
                    (org_id, user_id, source_ids),
                )
            else:
                cur.execute(
                    """
                    SELECT item_id, schema_jsonld
                    FROM items
                    WHERE org_id = %s
                      AND created_by_user_id = %s
                      AND source = 'gmail'
                      AND archived_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (org_id, user_id, safe_limit),
                )
            return cur.fetchall()


def _list_recent_calendar_items(*, org_id: str, limit: int = 120) -> list[dict[str, Any]]:
    safe_limit = min(max(limit, 1), 500)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT item_id, schema_jsonld
                FROM items
                WHERE org_id = %s
                  AND source = 'google_calendar'
                  AND archived_at IS NULL
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (org_id, safe_limit),
            )
            return cur.fetchall()


def _choose_calendar_item_for_email(
    *,
    email_item: dict[str, Any],
    calendar_items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    now = datetime.now(UTC)
    sender = _email_sender(email_item)
    upcoming: list[tuple[datetime, dict[str, Any]]] = []
    matching: list[tuple[datetime, dict[str, Any]]] = []

    for calendar_item in calendar_items:
        start_dt = _calendar_start(calendar_item)
        if start_dt is None or start_dt < now:
            continue
        upcoming.append((start_dt, calendar_item))
        if sender and sender in _calendar_attendees(calendar_item):
            matching.append((start_dt, calendar_item))

    if matching:
        matching.sort(key=lambda entry: entry[0])
        return matching[0][1]
    if upcoming:
        upcoming.sort(key=lambda entry: entry[0])
        return upcoming[0][1]
    return None


def _build_reschedule_payload(
    email_item: dict[str, Any],
    calendar_item: dict[str, Any],
) -> dict[str, Any]:
    email_schema = email_item.get("schema_jsonld") or {}
    email_raw = (email_schema.get("sourceMetadata") or {}).get("raw") or {}
    cal_schema = calendar_item.get("schema_jsonld") or {}
    cal_raw = (cal_schema.get("sourceMetadata") or {}).get("raw") or {}

    start_dt = _calendar_start(calendar_item) or (datetime.now(UTC) + timedelta(hours=1))
    end_dt = _calendar_end(calendar_item) or (start_dt + timedelta(minutes=30))
    new_start = start_dt + timedelta(minutes=30)
    new_end = end_dt + timedelta(minutes=30)
    starts_within_urgent_window = start_dt - datetime.now(UTC) <= _URGENT_WINDOW
    is_urgent = _rule(
        "proposal.urgency.reschedule",
        {
            "operation": "proposal.urgency.reschedule",
            "calendar": {"starts_within_urgent_window": starts_within_urgent_window},
        },
        default=starts_within_urgent_window,
    )
    requires_confirmation = _rule(
        "proposal.confirmation.required",
        {
            "operation": "proposal.confirmation.required",
            "proposal": {"has_google_write_action": True},
        },
        default=True,
    )

    return {
        "why": "Inbound email suggests a scheduling change close to an upcoming event.",
        "confidence": "medium",
        "requires_confirmation": requires_confirmation,
        "suggested_actions": ["gcal_update_event", "gmail_send_reply"],
        "gmail_message_id": email_raw.get("gmailMessageId"),
        "thread_id": email_raw.get("threadId"),
        "to": email_raw.get("from") or "",
        "reply_subject": f"Re: {email_schema.get('name') or 'Update'}",
        "reply_body": "Thanks for the note. I moved the meeting by 30 minutes.",
        "event_id": cal_raw.get("eventId"),
        "new_start": _iso_z(new_start),
        "new_end": _iso_z(new_end),
        "urgency": "urgent" if is_urgent else "normal",
    }


def _build_personal_payload(email_item: dict[str, Any]) -> dict[str, Any]:
    email_schema = email_item.get("schema_jsonld") or {}
    email_raw = (email_schema.get("sourceMetadata") or {}).get("raw") or {}
    text = _email_text(email_item)
    has_urgent_keyword = _has_any_keyword(text, _URGENT_KEYWORDS)
    is_urgent = _rule(
        "proposal.urgency.keyword",
        {
            "operation": "proposal.urgency.keyword",
            "email": {"has_urgent_keyword": has_urgent_keyword},
        },
        default=has_urgent_keyword,
    )
    requires_confirmation = _rule(
        "proposal.confirmation.required",
        {
            "operation": "proposal.confirmation.required",
            "proposal": {"has_google_write_action": True},
        },
        default=True,
    )
    start_dt = datetime.now(UTC) + timedelta(hours=2)
    end_dt = start_dt + timedelta(hours=1)
    return {
        "why": "Inbound email looks like a personal pickup request.",
        "confidence": "medium",
        "requires_confirmation": requires_confirmation,
        "suggested_actions": ["gcal_create_event", "gmail_send_reply"],
        "gmail_message_id": email_raw.get("gmailMessageId"),
        "thread_id": email_raw.get("threadId"),
        "to": email_raw.get("from") or "",
        "reply_subject": f"Re: {email_schema.get('name') or 'Update'}",
        "reply_body": "Understood. I added a calendar block and can take care of this.",
        "event_summary": "Personal request",
        "event_start": _iso_z(start_dt),
        "event_end": _iso_z(end_dt),
        "urgency": "urgent" if is_urgent else "normal",
    }


def _build_schedule_payload(
    email_item: dict[str, Any],
    calendar_items: list[dict[str, Any]],
) -> dict[str, Any]:
    email_schema = email_item.get("schema_jsonld") or {}
    email_raw = (email_schema.get("sourceMetadata") or {}).get("raw") or {}
    text = _email_text(email_item)
    start_dt, end_dt = _next_available_slot(
        calendar_items=calendar_items,
        duration_minutes=15,
    )
    has_urgent_keyword = _has_any_keyword(text, _URGENT_KEYWORDS)
    is_urgent = _rule(
        "proposal.urgency.keyword",
        {
            "operation": "proposal.urgency.keyword",
            "email": {"has_urgent_keyword": has_urgent_keyword},
        },
        default=has_urgent_keyword,
    )
    requires_confirmation = _rule(
        "proposal.confirmation.required",
        {
            "operation": "proposal.confirmation.required",
            "proposal": {"has_google_write_action": True},
        },
        default=True,
    )
    summary = str(email_schema.get("name") or "").strip() or "Quick meeting"
    return {
        "why": "Inbound email asks for a near-term meeting; suggest next available 15-minute slot.",
        "confidence": "medium",
        "requires_confirmation": requires_confirmation,
        "suggested_actions": ["gcal_create_event", "gmail_send_reply"],
        "gmail_message_id": email_raw.get("gmailMessageId"),
        "thread_id": email_raw.get("threadId"),
        "to": email_raw.get("from") or "",
        "reply_subject": f"Re: {email_schema.get('name') or 'Update'}",
        "reply_body": (
            "Thanks for your note. I found the next available 15-minute slot and "
            "scheduled it."
        ),
        "event_summary": summary,
        "event_start": _iso_z(start_dt),
        "event_end": _iso_z(end_dt),
        "event_duration_minutes": 15,
        "urgency": "urgent" if is_urgent else "normal",
    }


def _evaluate_email_candidate(
    *,
    email_item: dict[str, Any],
    calendar_items: list[dict[str, Any]],
) -> tuple[str, dict[str, Any]] | None:
    text = _email_text(email_item)
    calendar_item = _choose_calendar_item_for_email(
        email_item=email_item,
        calendar_items=calendar_items,
    )
    has_reschedule_keyword = _has_any_keyword(text, _RESCHEDULE_KEYWORDS)
    reschedule_detected = _rule(
        "proposal.detect.reschedule",
        {
            "operation": "proposal.detect",
            "email": {"has_reschedule_keyword": has_reschedule_keyword},
            "calendar": {"has_candidate_event": calendar_item is not None},
        },
        default=has_reschedule_keyword and calendar_item is not None,
    )
    if reschedule_detected and calendar_item is not None:
        return "Proposal.RescheduleMeeting", _build_reschedule_payload(
            email_item,
            calendar_item,
        )

    has_schedule_keyword = _has_any_keyword(text, _SCHEDULE_KEYWORDS)
    if _rule(
        "proposal.detect.schedule",
        {
            "operation": "proposal.detect",
            "email": {"has_schedule_keyword": has_schedule_keyword},
        },
        default=has_schedule_keyword,
    ):
        return "Proposal.PersonalRequest", _build_schedule_payload(
            email_item,
            calendar_items,
        )

    has_pickup_keyword = _has_any_keyword(text, _PICKUP_KEYWORDS)
    if _rule(
        "proposal.detect.pickup",
        {
            "operation": "proposal.detect",
            "email": {"has_pickup_keyword": has_pickup_keyword},
        },
        default=has_pickup_keyword,
    ):
        return "Proposal.PersonalRequest", _build_personal_payload(email_item)
    return None


def _insert_or_reuse_pending_proposal(
    *,
    org_id: str,
    user_id: str,
    connection_id: str,
    proposal_type: str,
    source_item_id: str,
    payload: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM connector_action_proposals
                WHERE org_id = %s
                  AND user_id = %s
                  AND source_item_id = %s
                  AND proposal_type = %s
                  AND status = 'pending'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (org_id, user_id, source_item_id, proposal_type),
            )
            existing = cur.fetchone()
            if existing is not None:
                return existing, False

            cur.execute(
                """
                INSERT INTO connector_action_proposals
                    (org_id, user_id, connection_id, proposal_type, status, source_item_id, payload)
                VALUES (%s, %s, %s, %s, 'pending', %s, %s)
                RETURNING *
                """,
                (
                    org_id,
                    user_id,
                    connection_id,
                    proposal_type,
                    source_item_id,
                    jsonb(payload),
                ),
            )
            inserted = cur.fetchone()
        conn.commit()
    if inserted is None:
        raise RuntimeError("Failed to insert proposal")
    return inserted, True


def _emit_proposal_notification(
    *,
    proposal_row: dict[str, Any],
    payload: dict[str, Any],
) -> None:
    proposal_id = str(proposal_row["proposal_id"])
    proposal_type = str(proposal_row["proposal_type"])
    urgency = str(payload.get("urgency") or "normal")
    is_urgent = _rule(
        "proposal.notification.urgent_kind",
        {
            "operation": "proposal.notification.kind",
            "proposal": {"urgency": urgency},
        },
        default=urgency == "urgent",
    )
    kind = "proposal_urgent_created" if is_urgent else "proposal_created"

    if proposal_type == "Proposal.RescheduleMeeting":
        title = (
            "Urgent meeting reschedule request"
            if is_urgent
            else "Meeting reschedule request"
        )
    elif proposal_type == "Proposal.PersonalRequest":
        title = "Urgent personal request" if is_urgent else "Personal request"
    else:
        title = "New proposal"

    body = str(payload.get("why") or "A new proposal is ready for confirmation.")
    create_notification_event(
        org_id=str(proposal_row["org_id"]),
        user_id=str(proposal_row["user_id"]),
        kind=kind,
        title=title,
        body=body,
        url=f"/workspace/calendar?proposal={proposal_id}",
        payload={
            "proposal_id": proposal_id,
            "proposal_type": proposal_type,
            "urgency": urgency,
        },
    )


def generate_proposals_for_items(
    *,
    org_id: str,
    user_id: str,
    connection_id: str,
    source_item_ids: list[str] | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Generate proposals from Gmail + calendar context.

    Returns proposal rows (existing pending + newly inserted), newest first.
    """
    email_items = _list_recent_email_items(
        org_id=org_id,
        user_id=user_id,
        source_item_ids=source_item_ids,
        limit=limit,
    )
    if not email_items:
        return []

    calendar_items = _list_recent_calendar_items(org_id=org_id)
    created_or_existing_ids: list[str] = []
    inserted_ids: set[str] = set()

    for email_item in email_items:
        evaluated = _evaluate_email_candidate(email_item=email_item, calendar_items=calendar_items)
        if not evaluated:
            continue
        proposal_type, payload = evaluated
        source_item_id = str(email_item["item_id"])
        proposal_row, inserted = _insert_or_reuse_pending_proposal(
            org_id=org_id,
            user_id=user_id,
            connection_id=connection_id,
            proposal_type=proposal_type,
            source_item_id=source_item_id,
            payload=payload,
        )
        created_or_existing_ids.append(str(proposal_row["proposal_id"]))
        if inserted:
            inserted_ids.add(str(proposal_row["proposal_id"]))
            _emit_proposal_notification(proposal_row=proposal_row, payload=payload)

    if not created_or_existing_ids:
        return []

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM connector_action_proposals
                WHERE proposal_id = ANY(%s)
                ORDER BY created_at DESC
                """,
                (created_or_existing_ids,),
            )
            rows = cur.fetchall()
    for row in rows:
        row["_inserted"] = str(row["proposal_id"]) in inserted_ids
    return rows


def enqueue_proposal_candidate(
    *,
    org_id: str,
    user_id: str,
    connection_id: str,
    source_item_id: str | None = None,
    trigger_kind: str = "email_new",
    payload: dict[str, Any] | None = None,
) -> str | None:
    event_payload = payload or {}
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT candidate_id
                FROM proposal_candidates
                WHERE org_id = %s
                  AND user_id = %s
                  AND connection_id = %s
                  AND trigger_kind = %s
                  AND status IN ('pending', 'processing')
                  AND source_item_id IS NOT DISTINCT FROM %s::uuid
                LIMIT 1
                """,
                (
                    org_id,
                    user_id,
                    connection_id,
                    trigger_kind,
                    source_item_id,
                ),
            )
            existing = cur.fetchone()
            if existing is not None:
                return str(existing["candidate_id"])

            cur.execute(
                """
                INSERT INTO proposal_candidates
                    (org_id, user_id, connection_id, source_item_id, trigger_kind, payload, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'pending')
                RETURNING candidate_id
                """,
                (
                    org_id,
                    user_id,
                    connection_id,
                    source_item_id,
                    trigger_kind,
                    jsonb(event_payload),
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return str(row["candidate_id"]) if row else None


def enqueue_candidates_for_email_items(
    *,
    org_id: str,
    user_id: str,
    connection_id: str,
    item_ids: list[str],
) -> int:
    enqueued = 0
    for item_id in item_ids:
        candidate_id = enqueue_proposal_candidate(
            org_id=org_id,
            user_id=user_id,
            connection_id=connection_id,
            source_item_id=item_id,
            trigger_kind="email_new",
        )
        if candidate_id:
            enqueued += 1
    return enqueued


def enqueue_calendar_sync_candidate(
    *,
    org_id: str,
    user_id: str,
    connection_id: str,
) -> bool:
    candidate_id = enqueue_proposal_candidate(
        org_id=org_id,
        user_id=user_id,
        connection_id=connection_id,
        source_item_id=None,
        trigger_kind="calendar_update",
    )
    return candidate_id is not None


def _claim_candidates(
    *,
    org_id: str,
    user_id: str,
    limit: int,
    lease_seconds: int,
) -> list[dict[str, Any]]:
    safe_limit = min(max(limit, 1), 200)
    safe_lease = min(max(lease_seconds, 5), 3600)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH picked AS (
                    SELECT candidate_id
                    FROM proposal_candidates
                    WHERE org_id = %s
                      AND user_id = %s
                      AND (
                        status = 'pending'
                        OR (
                          status = 'processing'
                          AND (lease_expires_at IS NULL OR lease_expires_at < now())
                        )
                      )
                    ORDER BY created_at ASC
                    LIMIT %s
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE proposal_candidates c
                SET status = 'processing',
                    attempts = c.attempts + 1,
                    lease_expires_at = now() + (%s * INTERVAL '1 second'),
                    updated_at = now()
                FROM picked
                WHERE c.candidate_id = picked.candidate_id
                RETURNING c.*
                """,
                (org_id, user_id, safe_limit, safe_lease),
            )
            rows = cur.fetchall()
        conn.commit()
    return rows


def _mark_candidate_completed(candidate_id: str) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE proposal_candidates
                SET status = 'completed',
                    processed_at = now(),
                    lease_expires_at = NULL,
                    last_error = NULL,
                    updated_at = now()
                WHERE candidate_id = %s
                """,
                (candidate_id,),
            )
        conn.commit()


def _mark_candidate_failed(
    *,
    candidate_id: str,
    attempts: int,
    max_attempts: int,
    error_message: str,
) -> bool:
    dead_letter = attempts >= max_attempts
    with db_conn() as conn:
        with conn.cursor() as cur:
            if dead_letter:
                cur.execute(
                    """
                    UPDATE proposal_candidates
                    SET status = 'dead_letter',
                        dead_lettered_at = now(),
                        lease_expires_at = NULL,
                        last_error = %s,
                        updated_at = now()
                    WHERE candidate_id = %s
                    """,
                    (error_message[:500], candidate_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE proposal_candidates
                    SET status = 'pending',
                        lease_expires_at = NULL,
                        last_error = %s,
                        updated_at = now()
                    WHERE candidate_id = %s
                    """,
                    (error_message[:500], candidate_id),
                )
        conn.commit()
    return dead_letter


def process_proposal_candidates(
    *,
    org_id: str,
    user_id: str,
    limit: int = 10,
    lease_seconds: int = 120,
    max_attempts: int = 5,
) -> ProposalCandidateProcessResult:
    """Process pending/expired proposal candidates for a user."""
    stats = ProposalCandidateProcessResult()
    candidates = _claim_candidates(
        org_id=org_id,
        user_id=user_id,
        limit=limit,
        lease_seconds=lease_seconds,
    )
    for candidate in candidates:
        stats.processed += 1
        candidate_id = str(candidate["candidate_id"])
        connection_id = str(candidate["connection_id"])
        source_item_id = (
            str(candidate["source_item_id"]) if candidate.get("source_item_id") else None
        )
        try:
            rows_before = len(
                _list_recent_email_items(
                    org_id=org_id,
                    user_id=user_id,
                    source_item_ids=[source_item_id] if source_item_id else None,
                    limit=1 if source_item_id else 20,
                )
            )
            if rows_before == 0:
                _mark_candidate_completed(candidate_id)
                continue

            proposals = generate_proposals_for_items(
                org_id=org_id,
                user_id=user_id,
                connection_id=connection_id,
                source_item_ids=[source_item_id] if source_item_id else None,
                limit=20,
            )
            if proposals:
                for proposal in proposals:
                    if proposal.get("_inserted"):
                        stats.created += 1
                    else:
                        stats.existing += 1

            _mark_candidate_completed(candidate_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "proposal_candidates.process_failed",
                extra={"candidate_id": candidate_id},
                exc_info=True,
            )
            stats.failed += 1
            dead_lettered = _mark_candidate_failed(
                candidate_id=candidate_id,
                attempts=int(candidate.get("attempts") or 0),
                max_attempts=max_attempts,
                error_message=str(exc),
            )
            if dead_lettered:
                stats.dead_lettered += 1
    return stats
