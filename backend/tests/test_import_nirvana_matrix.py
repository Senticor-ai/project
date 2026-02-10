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


def test_matrix_fixture_imports_exclude_completed(auth_client):
    """With include_completed=False, completed/deleted/cancelled items are skipped."""
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=False)
    assert summary["errors"] == 0
    # 12 skipped: TRASHED (state 6), COMPLETED, LOGGED, DELETED, CANCELLED,
    # DELETED-FLAG, DELETED-CHILD, INBOX-COMPLETED, PROJ-COMPLETED,
    # WAITING-COMPLETED, SOMEDAY-COMPLETED, CALENDAR-COMPLETED
    assert summary["skipped"] == 12

    things = _things_by_canonical(auth_client)

    # Completed/deleted items should NOT be present
    assert "urn:app:action:TASK-MATRIX-COMPLETED" not in things
    assert "urn:app:action:TASK-MATRIX-LOGGED" not in things
    assert "urn:app:action:TASK-MATRIX-TRASHED" not in things
    assert "urn:app:action:TASK-MATRIX-DELETED" not in things
    assert "urn:app:action:TASK-MATRIX-CANCELLED" not in things
    assert "urn:app:action:TASK-MATRIX-DELETED-FLAG" not in things
    assert "urn:app:action:TASK-MATRIX-DELETED-CHILD" not in things
    assert "urn:app:action:TASK-MATRIX-INBOX-COMPLETED" not in things
    assert "urn:app:project:PROJ-MATRIX-COMPLETED" not in things
    assert "urn:app:action:TASK-MATRIX-WAITING-COMPLETED" not in things
    assert "urn:app:action:TASK-MATRIX-SOMEDAY-COMPLETED" not in things
    assert "urn:app:action:TASK-MATRIX-CALENDAR-COMPLETED" not in things

    # Active items should be present
    assert "urn:app:action:TASK-MATRIX-SOMEDAY-ACTIVE" in things
    assert "urn:app:action:TASK-MATRIX-LOGGED-NO-EPOCH" in things


# ---------------------------------------------------------------------------
# Per-item validation (parameterized)
# ---------------------------------------------------------------------------

# Each tuple: (raw_id, canonical_id, expected_type, expected_bucket, completed,
#              extra_checks_dict)
# extra_checks_dict maps property_id -> expected_value (or special keys)
_ITEM_EXPECTATIONS = [
    # --- Original 16 items ---
    (
        "PROJ-MATRIX",
        "urn:app:project:PROJ-MATRIX",
        "Project",
        "project",
        False,
        {"app:projectStatus": "active", "app:isFocused": False},
    ),
    (
        "TASK-MATRIX-FOCUS",
        "urn:app:action:TASK-MATRIX-FOCUS",
        "Action",
        "next",
        False,
        {"app:isFocused": True},
    ),
    (
        "TASK-MATRIX-CALENDAR-START",
        "urn:app:action:TASK-MATRIX-CALENDAR-START",
        "Action",
        "calendar",
        False,
        {"app:startDate": "2026-04-01", "app:dueDate": "2026-04-01"},
    ),
    (
        "TASK-MATRIX-CALENDAR-DUE",
        "urn:app:action:TASK-MATRIX-CALENDAR-DUE",
        "Action",
        "calendar",
        False,
        {"app:startDate": "2026-04-02", "app:dueDate": "2026-04-02"},
    ),
    (
        "TASK-MATRIX-WAITING",
        "urn:app:action:TASK-MATRIX-WAITING",
        "Action",
        "waiting",
        False,
        {"app:delegatedTo": "QA Team"},
    ),
    (
        "TASK-MATRIX-RECUR",
        "urn:app:action:TASK-MATRIX-RECUR",
        "Action",
        "calendar",
        False,
        {"_recurrence_kind": "monthly", "app:startDate": "2026-05-01", "app:dueDate": "2026-05-01"},
    ),
    ("TASK-MATRIX-STATE7", "urn:app:action:TASK-MATRIX-STATE7", "Action", "next", False, {}),
    ("TASK-MATRIX-COMPLETED", "urn:app:action:TASK-MATRIX-COMPLETED", "Action", "next", True, {}),
    (
        "TASK-MATRIX-INBOX",
        "urn:app:inbox:TASK-MATRIX-INBOX",
        "Action",
        "inbox",
        False,
        {"app:rawCapture": "Remember to review this note"},
    ),
    ("TASK-MATRIX-LOGGED", "urn:app:action:TASK-MATRIX-LOGGED", "Action", "next", True, {}),
    # TRASHED is skipped — no entry
    ("TASK-MATRIX-DELETED", "urn:app:action:TASK-MATRIX-DELETED", "Action", "next", True, {}),
    (
        "TASK-MATRIX-CANCELLED",
        "urn:app:action:TASK-MATRIX-CANCELLED",
        "Action",
        "someday",
        True,
        {},
    ),
    (
        "TASK-MATRIX-DELETED-FLAG",
        "urn:app:action:TASK-MATRIX-DELETED-FLAG",
        "Action",
        "next",
        True,
        {},
    ),
    (
        "PROJ-MATRIX-CANCELLED",
        "urn:app:project:PROJ-MATRIX-CANCELLED",
        "Project",
        "project",
        False,
        {"app:projectStatus": "archived"},
    ),
    (
        "TASK-MATRIX-DELETED-CHILD",
        "urn:app:action:TASK-MATRIX-DELETED-CHILD",
        "Action",
        "next",
        True,
        {},
    ),
    # --- New 17 items ---
    (
        "TASK-MATRIX-SOMEDAY-ACTIVE",
        "urn:app:action:TASK-MATRIX-SOMEDAY-ACTIVE",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "TASK-MATRIX-INBOX-COMPLETED",
        "urn:app:action:TASK-MATRIX-INBOX-COMPLETED",
        "Action",
        "next",
        True,
        {},
    ),
    (
        "PROJ-MATRIX-COMPLETED",
        "urn:app:project:PROJ-MATRIX-COMPLETED",
        "Project",
        "project",
        True,
        {"app:projectStatus": "completed"},
    ),
    (
        "PROJ-MATRIX-DELETED",
        "urn:app:project:PROJ-MATRIX-DELETED",
        "Project",
        "project",
        False,
        {"app:projectStatus": "archived"},
    ),
    (
        "TASK-MATRIX-WAITING-COMPLETED",
        "urn:app:action:TASK-MATRIX-WAITING-COMPLETED",
        "Action",
        "waiting",
        True,
        {"app:delegatedTo": "Design Team"},
    ),
    (
        "TASK-MATRIX-SOMEDAY-COMPLETED",
        "urn:app:action:TASK-MATRIX-SOMEDAY-COMPLETED",
        "Action",
        "someday",
        True,
        {},
    ),
    (
        "TASK-MATRIX-CALENDAR-COMPLETED",
        "urn:app:action:TASK-MATRIX-CALENDAR-COMPLETED",
        "Action",
        "calendar",
        True,
        {"app:startDate": "2026-03-10", "app:dueDate": "2026-03-15"},
    ),
    (
        "TASK-MATRIX-CALENDAR-BOTH",
        "urn:app:action:TASK-MATRIX-CALENDAR-BOTH",
        "Action",
        "calendar",
        False,
        {"app:startDate": "2026-04-15", "app:dueDate": "2026-04-20"},
    ),
    (
        "TASK-MATRIX-NEXT-DUE",
        "urn:app:action:TASK-MATRIX-NEXT-DUE",
        "Action",
        "next",
        False,
        {"app:dueDate": "2026-03-01"},
    ),
    (
        "TASK-MATRIX-NEXT-START",
        "urn:app:action:TASK-MATRIX-NEXT-START",
        "Action",
        "next",
        False,
        {"app:startDate": "2026-02-15"},
    ),
    (
        "TASK-MATRIX-RECUR-WEEKLY",
        "urn:app:action:TASK-MATRIX-RECUR-WEEKLY",
        "Action",
        "calendar",
        False,
        {"_recurrence_kind": "weekly"},
    ),
    (
        "TASK-MATRIX-RECUR-DAILY",
        "urn:app:action:TASK-MATRIX-RECUR-DAILY",
        "Action",
        "calendar",
        False,
        {"_recurrence_kind": "daily"},
    ),
    (
        "TASK-MATRIX-RECUR-YEARLY",
        "urn:app:action:TASK-MATRIX-RECUR-YEARLY",
        "Action",
        "calendar",
        False,
        {"_recurrence_kind": "yearly"},
    ),
    (
        "TASK-MATRIX-ENERGY-LOW",
        "urn:app:action:TASK-MATRIX-ENERGY-LOW",
        "Action",
        "next",
        False,
        {"_energy": "low", "_time_estimate": "5min"},
    ),
    (
        "TASK-MATRIX-ENERGY-HIGH",
        "urn:app:action:TASK-MATRIX-ENERGY-HIGH",
        "Action",
        "next",
        False,
        {"_energy": "high", "_time_estimate": "half-day"},
    ),
    (
        "TASK-MATRIX-LOGGED-NO-EPOCH",
        "urn:app:action:TASK-MATRIX-LOGGED-NO-EPOCH",
        "Action",
        "next",
        False,
        {},
    ),
    (
        "TASK-MATRIX-SEQ-ORDER",
        "urn:app:action:TASK-MATRIX-SEQ-ORDER",
        "Action",
        "next",
        False,
        {"app:sequenceOrder": 5},
    ),
]


def _check_extra(thing: dict, key: str, expected):
    """Check a property assertion, handling special keys."""
    if key == "_recurrence_kind":
        recurrence = _get_prop(thing, "app:recurrence")
        assert recurrence is not None, "recurrence should be set"
        assert recurrence["kind"] == expected
    elif key == "_energy":
        ports = _get_prop(thing, "app:ports") or []
        assert len(ports) > 0, "ports should have computation port"
        assert ports[0].get("energyLevel") == expected
    elif key == "_time_estimate":
        ports = _get_prop(thing, "app:ports") or []
        assert len(ports) > 0, "ports should have computation port"
        assert ports[0].get("timeEstimate") == expected
    elif key == "_keywords":
        assert thing.get("keywords") == expected, (
            f"keywords: expected {expected!r}, got {thing.get('keywords')!r}"
        )
    else:
        assert _get_prop(thing, key) == expected, (
            f"{key}: expected {expected!r}, got {_get_prop(thing, key)!r}"
        )


@pytest.mark.parametrize(
    "raw_id,canonical_id,expected_type,expected_bucket,completed,extra",
    _ITEM_EXPECTATIONS,
    ids=[e[0] for e in _ITEM_EXPECTATIONS],
)
def test_matrix_item_imports_correctly(
    matrix_things,
    raw_id,
    canonical_id,
    expected_type,
    expected_bucket,
    completed,
    extra,
):
    """Each fixture item should produce the correct type, bucket, and completion status."""
    assert canonical_id in matrix_things, f"{canonical_id} not found in imported things"
    thing = matrix_things[canonical_id]["thing"]

    assert thing["@type"] == expected_type, (
        f"{raw_id}: expected @type={expected_type!r}, got {thing['@type']!r}"
    )
    assert _get_prop(thing, "app:bucket") == expected_bucket, (
        f"{raw_id}: expected bucket={expected_bucket!r}, got {_get_prop(thing, 'app:bucket')!r}"
    )
    if completed:
        assert thing.get("endTime") is not None, f"{raw_id}: expected endTime to be set"
    else:
        assert thing.get("endTime") is None, f"{raw_id}: expected endTime to be None"

    for key, expected_value in extra.items():
        _check_extra(thing, key, expected_value)

    # Every imported item should have source metadata
    assert thing.get("sourceMetadata", {}).get("provider") == "nirvana"


@pytest.fixture()
def matrix_things(auth_client):
    """Import the full matrix fixture with include_completed=True and return things dict."""
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=True)
    assert summary["errors"] == 0
    assert summary["skipped"] == 1  # Only TRASHED
    return _things_by_canonical(auth_client)


def test_matrix_summary_bucket_counts(auth_client):
    """Verify aggregate bucket_counts in the import summary."""
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=True)
    assert summary["errors"] == 0
    assert summary["bucket_counts"] == {
        "project": 4,
        "next": 14,
        "calendar": 8,
        "waiting": 2,
        "inbox": 1,
        "someday": 3,
    }


def test_matrix_summary_completed_counts(auth_client):
    """Verify completed_counts tracks per-bucket completion breakdown."""
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=True)
    assert summary["errors"] == 0
    assert summary["completed_counts"] == {
        "next": 6,
        "someday": 2,
        "waiting": 1,
        "calendar": 1,
        "project": 1,
    }


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


def test_cancelled_project_keeps_archived_status(auth_client):
    """Cancelled projects should keep project_status='archived' (not 'completed')."""
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=True)
    assert summary["errors"] == 0

    things = _things_by_canonical(auth_client)

    proj = things["urn:app:project:PROJ-MATRIX-CANCELLED"]["thing"]
    assert proj["@type"] == "Project"
    assert _get_prop(proj, "app:projectStatus") == "archived"


def test_deleted_child_excluded_from_project_hasPart(auth_client):
    """When include_completed=False, deleted children should not appear
    in their parent project's hasPart list."""
    items = _load_fixture(MATRIX_FIXTURE_PATH)
    summary = _run_import(auth_client, items, include_completed=False)
    assert summary["errors"] == 0

    things = _things_by_canonical(auth_client)

    project = things["urn:app:project:PROJ-MATRIX"]["thing"]
    child_ids = {ref["@id"] for ref in project.get("hasPart", [])}
    assert "urn:app:action:TASK-MATRIX-DELETED-CHILD" not in child_ids


_skip_unless_large = pytest.mark.skipif(
    os.getenv("RUN_LARGE_IMPORT_TESTS") != "1",
    reason="Set RUN_LARGE_IMPORT_TESTS=1 to run real-export tests.",
)


@_skip_unless_large
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


# ---------------------------------------------------------------------------
# Spot-check tests against the real Nirvana export
# ---------------------------------------------------------------------------

_SPOT_CHECK_IDS = {
    # Mixed sample (10): all states, completed + active
    "CD32FF15-558B-415C-B25F-59CF94091454",  # state=0, completed
    "019c1aba-bdfa-74d6-aed9-02baae3491f1",  # state=0, active
    "991DF9D3-5201-41F3-98BC-5AD220FA138F",  # state=1, completed, focused
    "71B15F30-CDCB-4916-BE31-1D6B534AD1C6",  # state=1, active
    "C28562B1-5A74-42BC-96F6-9251BFBC6055",  # state=2, completed, delegation
    "18168947-41F5-46FF-B489-8E009E33BC46",  # state=3, active, calendar
    "8DA29B7D-F414-46B4-88AC-4CF0EE08C5C3",  # state=4, completed, multi-tag
    "E5D9C43B-AE31-424D-8A6F-8A2A2647A125",  # state=4, active
    "167D97B5-0D8D-4E2D-A5D3-7E683D15910E",  # state=9, completed, recurring
    "23A11048-445F-427D-956F-5E84BAE2C87D",  # state=9, active, recurring
    # Active-only sample (10): all completed=0, not state 7
    "6F861CB5-2132-409D-81C7-9E0797D8382E",  # state=4
    "893D7DC1-4152-4E94-AAB2-29E7522F6B1F",  # state=4
    "019bdada-0016-77ec-aeb8-5c58048d13fd",  # state=1
    "0195dd25-b96a-7285-9557-632f5c699919",  # state=4
    "0A5D8584-7F1B-4C8A-B2FF-9A3DA6FB7797",  # state=4
    "06979090-AA25-4A3C-A4D0-9F97C63DE7F0",  # state=4
    "F6D0E7D9-1E9E-4F5C-8DA2-A57D716E90BA",  # state=4
    "16AA72A6-FEA7-4E01-B553-EE13CAA5008F",  # state=4
    "01997b3d-c4dc-75bf-b640-9cf77b35de3a",  # state=4
    "B8781D77-8837-4546-971B-9CD2CC8F2FAB",  # state=4
}


def _extract_spot_check_items(path):
    """Load the real export and return only the items whose id is in _SPOT_CHECK_IDS."""
    all_items = _load_fixture(path)
    selected = [item for item in all_items if item.get("id") in _SPOT_CHECK_IDS]
    found_ids = {i["id"] for i in selected}
    missing = _SPOT_CHECK_IDS - found_ids
    assert not missing, f"Missing items in export: {missing}"
    return selected


# Same tuple format as _ITEM_EXPECTATIONS:
# (raw_id, canonical_id, expected_type, expected_bucket, completed, extra_checks_dict)
_SPOT_CHECK_EXPECTATIONS = [
    # --- Mixed sample ---
    # 1. state=0, completed → inbox redirected to "next"
    (
        "CD32FF15-558B-415C-B25F-59CF94091454",
        "urn:app:action:CD32FF15-558B-415C-B25F-59CF94091454",
        "Action",
        "next",
        True,
        {},
    ),
    # 2. state=0, active → inbox Action
    (
        "019c1aba-bdfa-74d6-aed9-02baae3491f1",
        "urn:app:inbox:019c1aba-bdfa-74d6-aed9-02baae3491f1",
        "Action",
        "inbox",
        False,
        {},
    ),
    # 3. state=1, completed, seqt=1 (focused), duedate=20171215
    (
        "991DF9D3-5201-41F3-98BC-5AD220FA138F",
        "urn:app:action:991DF9D3-5201-41F3-98BC-5AD220FA138F",
        "Action",
        "next",
        True,
        {"app:isFocused": True, "app:dueDate": "2017-12-15"},
    ),
    # 4. state=1, active, tags=",Personal,"
    (
        "71B15F30-CDCB-4916-BE31-1D6B534AD1C6",
        "urn:app:action:71B15F30-CDCB-4916-BE31-1D6B534AD1C6",
        "Action",
        "next",
        False,
        {"_keywords": ["Personal"]},
    ),
    # 5. state=2, completed, waitingfor
    (
        "C28562B1-5A74-42BC-96F6-9251BFBC6055",
        "urn:app:action:C28562B1-5A74-42BC-96F6-9251BFBC6055",
        "Action",
        "waiting",
        True,
        {"app:delegatedTo": "CMA HOA Saddlebrook Glen"},
    ),
    # 6. state=3, active, startdate=20260905 (calendar backfill → both dates)
    (
        "18168947-41F5-46FF-B489-8E009E33BC46",
        "urn:app:action:18168947-41F5-46FF-B489-8E009E33BC46",
        "Action",
        "calendar",
        False,
        {"app:startDate": "2026-09-05", "app:dueDate": "2026-09-05"},
    ),
    # 7. state=4, completed, tags=",Anywhere,Career,MustNail2020,"
    (
        "8DA29B7D-F414-46B4-88AC-4CF0EE08C5C3",
        "urn:app:action:8DA29B7D-F414-46B4-88AC-4CF0EE08C5C3",
        "Action",
        "someday",
        True,
        {"_keywords": ["Anywhere", "Career", "MustNail2020"]},
    ),
    # 8. state=4, active
    (
        "E5D9C43B-AE31-424D-8A6F-8A2A2647A125",
        "urn:app:action:E5D9C43B-AE31-424D-8A6F-8A2A2647A125",
        "Action",
        "someday",
        False,
        {},
    ),
    # 9. state=9, completed, recurring daily
    (
        "167D97B5-0D8D-4E2D-A5D3-7E683D15910E",
        "urn:app:action:167D97B5-0D8D-4E2D-A5D3-7E683D15910E",
        "Action",
        "calendar",
        True,
        {"_recurrence_kind": "daily", "app:startDate": "2019-05-17", "app:dueDate": "2019-05-17"},
    ),
    # 10. state=9, active, recurring bi-weekly
    (
        "23A11048-445F-427D-956F-5E84BAE2C87D",
        "urn:app:action:23A11048-445F-427D-956F-5E84BAE2C87D",
        "Action",
        "calendar",
        False,
        {"_recurrence_kind": "weekly", "app:startDate": "2026-02-13", "app:dueDate": "2026-02-13"},
    ),
    # --- Active-only sample ---
    (
        "6F861CB5-2132-409D-81C7-9E0797D8382E",
        "urn:app:action:6F861CB5-2132-409D-81C7-9E0797D8382E",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "893D7DC1-4152-4E94-AAB2-29E7522F6B1F",
        "urn:app:action:893D7DC1-4152-4E94-AAB2-29E7522F6B1F",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "019bdada-0016-77ec-aeb8-5c58048d13fd",
        "urn:app:action:019bdada-0016-77ec-aeb8-5c58048d13fd",
        "Action",
        "next",
        False,
        {},
    ),
    (
        "0195dd25-b96a-7285-9557-632f5c699919",
        "urn:app:action:0195dd25-b96a-7285-9557-632f5c699919",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "0A5D8584-7F1B-4C8A-B2FF-9A3DA6FB7797",
        "urn:app:action:0A5D8584-7F1B-4C8A-B2FF-9A3DA6FB7797",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "06979090-AA25-4A3C-A4D0-9F97C63DE7F0",
        "urn:app:action:06979090-AA25-4A3C-A4D0-9F97C63DE7F0",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "F6D0E7D9-1E9E-4F5C-8DA2-A57D716E90BA",
        "urn:app:action:F6D0E7D9-1E9E-4F5C-8DA2-A57D716E90BA",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "16AA72A6-FEA7-4E01-B553-EE13CAA5008F",
        "urn:app:action:16AA72A6-FEA7-4E01-B553-EE13CAA5008F",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "01997b3d-c4dc-75bf-b640-9cf77b35de3a",
        "urn:app:action:01997b3d-c4dc-75bf-b640-9cf77b35de3a",
        "Action",
        "someday",
        False,
        {},
    ),
    (
        "B8781D77-8837-4546-971B-9CD2CC8F2FAB",
        "urn:app:action:B8781D77-8837-4546-971B-9CD2CC8F2FAB",
        "Action",
        "someday",
        False,
        {},
    ),
]

_COMPLETED_SPOT_CHECK_IDS = [
    "urn:app:action:CD32FF15-558B-415C-B25F-59CF94091454",
    "urn:app:action:991DF9D3-5201-41F3-98BC-5AD220FA138F",
    "urn:app:action:C28562B1-5A74-42BC-96F6-9251BFBC6055",
    "urn:app:action:8DA29B7D-F414-46B4-88AC-4CF0EE08C5C3",
    "urn:app:action:167D97B5-0D8D-4E2D-A5D3-7E683D15910E",
]

_ACTIVE_SPOT_CHECK_EXPECTATIONS = [
    e
    for e in _SPOT_CHECK_EXPECTATIONS
    if not e[4]  # completed == False
]


@pytest.fixture()
def spot_check_things(auth_client):
    """Import 20 spot-check items from the real export with include_completed=True."""
    if not REAL_EXPORT_PATH.is_file():
        pytest.skip(f"Missing fixture: {REAL_EXPORT_PATH}")
    items = _extract_spot_check_items(REAL_EXPORT_PATH)
    summary = _run_import(auth_client, items, include_completed=True)
    assert summary["errors"] == 0
    return _things_by_canonical(auth_client)


@_skip_unless_large
@pytest.mark.parametrize(
    "raw_id,canonical_id,expected_type,expected_bucket,completed,extra",
    _SPOT_CHECK_EXPECTATIONS,
    ids=[e[0] for e in _SPOT_CHECK_EXPECTATIONS],
)
def test_real_export_spot_checks(
    spot_check_things,
    raw_id,
    canonical_id,
    expected_type,
    expected_bucket,
    completed,
    extra,
):
    """Each spot-check item from the real export should map correctly."""
    assert canonical_id in spot_check_things, f"{canonical_id} not found"
    thing = spot_check_things[canonical_id]["thing"]

    assert thing["@type"] == expected_type, (
        f"{raw_id}: expected @type={expected_type!r}, got {thing['@type']!r}"
    )
    assert _get_prop(thing, "app:bucket") == expected_bucket, (
        f"{raw_id}: expected bucket={expected_bucket!r}, got {_get_prop(thing, 'app:bucket')!r}"
    )
    if completed:
        assert thing.get("endTime") is not None, f"{raw_id}: expected endTime to be set"
    else:
        assert thing.get("endTime") is None, f"{raw_id}: expected endTime to be None"

    for key, expected_value in extra.items():
        _check_extra(thing, key, expected_value)

    assert thing.get("sourceMetadata", {}).get("provider") == "nirvana"


@_skip_unless_large
def test_real_export_exclude_completed_spot_checks(auth_client):
    """With include_completed=False, completed items are absent, active items correct."""
    if not REAL_EXPORT_PATH.is_file():
        pytest.skip(f"Missing fixture: {REAL_EXPORT_PATH}")
    items = _extract_spot_check_items(REAL_EXPORT_PATH)
    summary = _run_import(auth_client, items, include_completed=False)
    assert summary["errors"] == 0
    assert summary["skipped"] == 5  # 5 completed items

    things = _things_by_canonical(auth_client)

    for canonical_id in _COMPLETED_SPOT_CHECK_IDS:
        assert canonical_id not in things, f"{canonical_id} should have been excluded"

    for (
        _raw_id,
        canonical_id,
        expected_type,
        expected_bucket,
        _,
        _,
    ) in _ACTIVE_SPOT_CHECK_EXPECTATIONS:
        assert canonical_id in things, f"{canonical_id} not found"
        thing = things[canonical_id]["thing"]
        assert thing["@type"] == expected_type
        assert _get_prop(thing, "app:bucket") == expected_bucket
        assert thing.get("endTime") is None
