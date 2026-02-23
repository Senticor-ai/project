from __future__ import annotations

import json
from datetime import UTC, datetime

from ..shared import _SOURCE_METADATA_SCHEMA_VERSION, _build_base_entity, _canonical_id, _pv

_TYPE_MAP = {
    "inbox": "Action",
    "action": "Action",
    "project": "Project",
    "reference": "CreativeWork",
}

_DEFAULT_STATE_BUCKET_MAP = {
    0: "inbox",
    1: "next",
    2: "waiting",
    3: "calendar",
    4: "someday",
    5: "next",  # Logged/Done — original bucket unknown, default to next
    7: "next",
    9: "calendar",
}

# Nirvana states that should be silently skipped during import.
_SKIP_STATES: frozenset[int] = frozenset({6})  # 6 = Trashed


def _parse_epoch(value) -> datetime | None:
    if value in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except Exception:  # noqa: BLE001
        return None


def _parse_yyyymmdd(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    if len(raw) != 8 or not raw.isdigit():
        return None
    return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"


def _parse_tags(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _energy_level(value) -> str | None:
    mapping = {1: "low", 2: "medium", 3: "high"}
    try:
        return mapping.get(int(value))
    except Exception:  # noqa: BLE001
        return None


def _time_estimate(minutes) -> str | None:
    try:
        minutes = int(minutes)
    except Exception:  # noqa: BLE001
        return None
    mapping = {
        5: "5min",
        10: "15min",
        15: "15min",
        30: "30min",
        60: "1hr",
        120: "2hr",
        240: "half-day",
        480: "full-day",
    }
    return mapping.get(minutes)


def _parse_recurrence(raw: str | dict | None) -> dict | None:
    if not raw:
        return None
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except Exception:  # noqa: BLE001
            return None
    if not isinstance(data, dict):
        return None

    freq = data.get("freq")
    try:
        interval = int(data.get("interval", 1))
    except Exception:  # noqa: BLE001
        interval = 1

    if freq == "daily":
        return {"kind": "daily", "interval": interval}

    if freq == "weekly":
        on = data.get("on") or {}
        day_map = {"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}
        days: list[int] = []
        if isinstance(on, dict):
            for value in on.values():
                if isinstance(value, str):
                    day = day_map.get(value.lower())
                    if day is not None:
                        days.append(day)
        return {"kind": "weekly", "interval": interval, "daysOfWeek": sorted(set(days))}

    if freq == "monthly":
        on = data.get("on") or {}
        day_of_month = None
        if isinstance(on, dict):
            for value in on.values():
                if isinstance(value, dict):
                    nth = value.get("nth")
                    if nth is not None:
                        try:
                            day_of_month = int(nth)
                        except Exception:  # noqa: BLE001
                            day_of_month = None
                if day_of_month:
                    break
        if not day_of_month:
            day_of_month = 1
        return {"kind": "monthly", "interval": interval, "dayOfMonth": day_of_month}

    if freq == "yearly":
        try:
            month = int(data.get("month", 1))
            day = int(data.get("day", 1))
        except Exception:  # noqa: BLE001
            month, day = 1, 1
        return {"kind": "yearly", "interval": interval, "month": month, "day": day}

    return None


def _build_nirvana_source_metadata(
    *,
    source: str,
    raw_id: str,
    type_value: int,
    state_value: int,
    raw_item: dict,
) -> dict:
    # Keep complete source payload for high-fidelity imports and future remapping.
    return {
        "schemaVersion": _SOURCE_METADATA_SCHEMA_VERSION,
        "provider": source,
        "rawId": raw_id,
        "rawType": type_value,
        "rawState": state_value,
        "raw": raw_item,
    }


def _build_ports(energy, etime) -> list[dict]:
    energy_level = _energy_level(energy)
    time_estimate = _time_estimate(etime)
    if not energy_level and not time_estimate:
        return []
    port = {"kind": "computation"}
    if energy_level:
        port["energyLevel"] = energy_level
    if time_estimate:
        port["timeEstimate"] = time_estimate
    return [port]


def _derive_bucket(state: int | None, state_map: dict[int, str], default_bucket: str) -> str:
    if state is None:
        return default_bucket
    return state_map.get(state, default_bucket)


def _normalize_state_bucket_map(state_bucket_map: dict | None) -> dict[int, str]:
    if not state_bucket_map:
        return {}
    normalized: dict[int, str] = {}
    for raw_key, raw_bucket in state_bucket_map.items():
        try:
            key = int(raw_key)
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(raw_bucket, str):
            continue
        bucket = raw_bucket.strip()
        if bucket:
            normalized[key] = bucket
    return normalized


def _build_nirvana_item(
    item: dict,
    *,
    state_map: dict[int, str],
    default_bucket: str,
    source: str,
    project_children: dict[str, list[str]],
) -> tuple[str, dict, str, datetime, datetime, datetime | None]:
    raw_id = str(item.get("id") or "").strip()
    if not raw_id:
        raise ValueError("missing id")

    title = str(item.get("name") or "").strip()
    if not title:
        raise ValueError("missing name")

    try:
        type_value = int(item.get("type", 0))
    except Exception:  # noqa: BLE001
        type_value = 0

    try:
        state_value = int(item.get("state", 0))
    except Exception:  # noqa: BLE001
        state_value = 0

    created_dt = _parse_epoch(item.get("created")) or datetime.now(UTC)
    updated_dt = _parse_epoch(item.get("updated")) or created_dt
    completed_dt = _parse_epoch(item.get("completed"))

    # Non-project items with deleted/cancelled flags should be treated as
    # completed so they show up under "done" instead of cluttering active lists.
    # Projects handle deleted/cancelled via project_status="archived" separately.
    if not completed_dt and type_value != 1:
        if item.get("deleted") or item.get("cancelled"):
            completed_dt = updated_dt

    tags = _parse_tags(item.get("tags"))
    notes = item.get("note") or None
    ports = _build_ports(item.get("energy"), item.get("etime"))
    bucket = _derive_bucket(state_value, state_map, default_bucket)

    # A completed item cannot scopilot in inbox (inbox items have no endTime).
    # Redirect to "next" so it goes through the Action code path which preserves endTime.
    if completed_dt and bucket == "inbox":
        bucket = "next"

    source_metadata = _build_nirvana_source_metadata(
        source=source,
        raw_id=raw_id,
        type_value=type_value,
        state_value=state_value,
        raw_item=item,
    )

    focus_order_raw = item.get("seqt")
    try:
        focus_order = int(focus_order_raw) if focus_order_raw is not None else 0
    except Exception:  # noqa: BLE001
        focus_order = 0

    is_focused = focus_order > 0
    if bucket == "focus":
        bucket = "next"
        is_focused = True

    if type_value == 1:
        canonical_id = _canonical_id("project", raw_id)
        action_ids = [
            _canonical_id("action", child_id)
            for child_id in project_children.get(raw_id, [])
            if child_id
        ]
        project_status = "active"
        if completed_dt:
            project_status = "completed"
        elif item.get("deleted") or item.get("cancelled"):
            project_status = "archived"
        desired_outcome = notes or ""
        item_data = _build_base_entity(
            canonical_id=canonical_id,
            name=title,
            description=notes,
            keywords=tags,
            created_at=created_dt,
            updated_at=updated_dt,
            source=source,
            ports=ports,
            source_metadata=source_metadata,
        )
        item_data["@type"] = _TYPE_MAP["project"]
        item_data["endTime"] = completed_dt.isoformat() if completed_dt else None
        item_data["hasPart"] = [{"@id": aid} for aid in action_ids]
        item_data["additionalProperty"].extend(
            [
                _pv("app:bucket", "project"),
                _pv("app:desiredOutcome", desired_outcome),
                _pv("app:projectStatus", project_status),
                _pv("app:isFocused", is_focused),
                _pv("app:reviewDate", None),
            ]
        )
        return canonical_id, item_data, "project", created_dt, updated_dt, completed_dt

    if bucket == "inbox":
        canonical_id = _canonical_id("inbox", raw_id)
        item_data = _build_base_entity(
            canonical_id=canonical_id,
            name=title,
            description=notes,
            keywords=tags,
            created_at=created_dt,
            updated_at=updated_dt,
            source=source,
            ports=ports,
            source_metadata=source_metadata,
        )
        item_data["@type"] = _TYPE_MAP["inbox"]
        item_data["startTime"] = None
        item_data["endTime"] = completed_dt.isoformat() if completed_dt else None
        item_data["additionalProperty"].extend(
            [
                _pv("app:bucket", "inbox"),
                _pv("app:rawCapture", notes or title),
                _pv("app:contexts", []),
                _pv("app:isFocused", False),
            ]
        )
        return canonical_id, item_data, "inbox", created_dt, updated_dt, completed_dt

    if bucket == "reference":
        canonical_id = _canonical_id("reference", raw_id)
        item_data = _build_base_entity(
            canonical_id=canonical_id,
            name=title,
            description=notes,
            keywords=tags,
            created_at=created_dt,
            updated_at=updated_dt,
            source=source,
            ports=ports,
            source_metadata=source_metadata,
        )
        item_data["@type"] = _TYPE_MAP["reference"]
        item_data["url"] = None
        item_data["encodingFormat"] = None
        item_data["additionalProperty"].extend(
            [
                _pv("app:bucket", "reference"),
                _pv("app:origin", "captured"),
            ]
        )
        return canonical_id, item_data, "reference", created_dt, updated_dt, completed_dt

    canonical_id = _canonical_id("action", raw_id)
    project_id = str(item.get("parentid") or "").strip() or None
    if project_id:
        project_id = _canonical_id("project", project_id)

    due_date = _parse_yyyymmdd(item.get("duedate"))
    start_date = _parse_yyyymmdd(item.get("startdate"))
    recurrence = _parse_recurrence(item.get("recurring"))
    if not start_date and recurrence:
        next_date = None
        if isinstance(item.get("recurring"), str):
            try:
                next_date = json.loads(item.get("recurring", "")).get("nextdate")
            except Exception:  # noqa: BLE001
                next_date = None
        start_date = _parse_yyyymmdd(next_date) or start_date

    if bucket == "calendar":
        if not start_date and due_date:
            start_date = due_date
        if not due_date and start_date:
            # Calendar items should always carry a date visible to date-centric UI lists.
            due_date = start_date

    seq_raw = item.get("seq")
    try:
        sequence_order = int(seq_raw) if seq_raw is not None else None
    except Exception:  # noqa: BLE001
        sequence_order = None
    if sequence_order == 0:
        sequence_order = None

    delegated_to = str(item.get("waitingfor") or "").strip() or None

    item_data = _build_base_entity(
        canonical_id=canonical_id,
        name=title,
        description=notes,
        keywords=tags,
        created_at=created_dt,
        updated_at=updated_dt,
        source=source,
        ports=ports,
        source_metadata=source_metadata,
    )
    item_data["@type"] = _TYPE_MAP["action"]
    item_data["startTime"] = start_date
    item_data["endTime"] = completed_dt.isoformat() if completed_dt else None
    if project_id:
        item_data["isPartOf"] = {"@id": project_id}
    item_data["additionalProperty"].extend(
        [
            _pv("app:bucket", bucket),
            _pv("app:contexts", []),
            _pv("app:delegatedTo", delegated_to),
            _pv("app:dueDate", due_date),
            _pv("app:startDate", start_date),
            _pv("app:scheduledTime", None),
            _pv("app:isFocused", is_focused),
            _pv("app:recurrence", recurrence),
            _pv("app:sequenceOrder", sequence_order),
        ]
    )

    return canonical_id, item_data, bucket, created_dt, updated_dt, completed_dt
