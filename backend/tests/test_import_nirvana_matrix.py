import json
import os

import pytest
from conftest import ROOT_DIR

MATRIX_FIXTURE_PATH = (
    ROOT_DIR / "backend" / "tests" / "fixtures" / "nirvana_export.validation_matrix.json"
)
REAL_EXPORT_PATH = ROOT_DIR / "tmp" / "Nirvana_Export_1770390824.json"


def _load_fixture(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _run_import(auth_client, items, **overrides):
    payload = {"items": items, "emit_events": False}
    payload.update(overrides)
    response = auth_client.post("/imports/nirvana", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _things_by_canonical(auth_client):
    response = auth_client.get("/things?limit=2000")
    assert response.status_code == 200
    return {item["canonical_id"]: item for item in response.json()}


def _get_prop(thing: dict, property_id: str):
    """Extract value from additionalProperty by propertyID."""
    for pv in thing.get("additionalProperty", []):
        if pv.get("propertyID") == property_id:
            return pv.get("value")
    return None


def test_matrix_fixture_dry_run_validates_without_writing(auth_client):
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, dry_run=True, include_completed=True)

    assert summary["total"] == len(items)
    assert summary["errors"] == 0
    # Trashed item (state 6) is skipped
    assert summary["skipped"] == 1
    assert summary["created"] == len(items) - 1

    things = auth_client.get("/things?limit=10").json()
    assert things == []


def test_matrix_fixture_imports_core_fields(auth_client):
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=False)
    assert summary["errors"] == 0
    # 3 skipped: COMPLETED (completed+include_completed=False), LOGGED (same), TRASHED (state 6)
    assert summary["skipped"] == 3

    things = _things_by_canonical(auth_client)

    assert "urn:app:action:TASK-MATRIX-COMPLETED" not in things
    assert "urn:app:action:TASK-MATRIX-LOGGED" not in things
    assert "urn:app:action:TASK-MATRIX-TRASHED" not in things

    focused = things["urn:app:action:TASK-MATRIX-FOCUS"]["thing"]
    assert _get_prop(focused, "app:isFocused") is True

    waiting = things["urn:app:action:TASK-MATRIX-WAITING"]["thing"]
    assert _get_prop(waiting, "app:bucket") == "waiting"
    assert _get_prop(waiting, "app:delegatedTo") == "QA Team"

    start_only = things["urn:app:action:TASK-MATRIX-CALENDAR-START"]["thing"]
    assert _get_prop(start_only, "app:startDate") == "2026-04-01"
    assert _get_prop(start_only, "app:dueDate") == "2026-04-01"

    due_only = things["urn:app:action:TASK-MATRIX-CALENDAR-DUE"]["thing"]
    assert _get_prop(due_only, "app:startDate") == "2026-04-02"
    assert _get_prop(due_only, "app:dueDate") == "2026-04-02"

    recurring = things["urn:app:action:TASK-MATRIX-RECUR"]["thing"]
    assert _get_prop(recurring, "app:recurrence")["kind"] == "monthly"
    assert _get_prop(recurring, "app:startDate") == "2026-05-01"
    assert _get_prop(recurring, "app:dueDate") == "2026-05-01"


def test_matrix_fixture_preserves_source_metadata_and_state_override(auth_client):
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(
        auth_client,
        items,
        include_completed=False,
        state_bucket_map={7: "reference"},
    )
    assert summary["errors"] == 0

    things = _things_by_canonical(auth_client)
    ref = things["urn:app:reference:TASK-MATRIX-STATE7"]["thing"]
    assert _get_prop(ref, "app:bucket") == "reference"
    assert ref["sourceMetadata"]["provider"] == "nirvana"
    assert ref["sourceMetadata"]["rawState"] == 7
    assert ref["sourceMetadata"]["raw"]["seqp"] == 3
    assert ref["sourceMetadata"]["raw"]["ps"] == 2
    assert ref["sourceMetadata"]["raw"]["reminder"] == "1700000000"


def test_logged_items_become_completed_actions_not_inbox(auth_client):
    """State 5 (Logged/Done) items should be imported as completed Actions with endTime,
    NOT as inbox Things (which lose completion status)."""
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=True)
    assert summary["errors"] == 0
    # Trashed item (state 6) still skipped even with include_completed=True
    assert summary["skipped"] == 1

    things = _things_by_canonical(auth_client)

    # State 5 item should exist as a completed action
    logged = things["urn:app:action:TASK-MATRIX-LOGGED"]["thing"]
    assert logged["@type"] == "Action"
    assert _get_prop(logged, "app:bucket") == "next"
    assert logged["endTime"] is not None  # completion timestamp preserved

    # State 1 completed item should also have endTime
    completed = things["urn:app:action:TASK-MATRIX-COMPLETED"]["thing"]
    assert completed["@type"] == "Action"
    assert completed["endTime"] is not None

    # Trashed item should NOT be imported
    assert "urn:app:action:TASK-MATRIX-TRASHED" not in things


@pytest.mark.skipif(
    os.getenv("RUN_LARGE_IMPORT_TESTS") != "1",
    reason="Set RUN_LARGE_IMPORT_TESTS=1 to run large real-export compatibility test.",
)
def test_real_export_dry_run_smoke(auth_client):
    if not REAL_EXPORT_PATH.is_file():
        pytest.skip(f"Missing fixture: {REAL_EXPORT_PATH}")
    items = _load_fixture(REAL_EXPORT_PATH)
    summary = _run_import(
        auth_client,
        items,
        dry_run=True,
        include_completed=True,
    )
    assert summary["total"] == len(items)
    assert summary["errors"] == 0
