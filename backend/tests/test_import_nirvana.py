import json
from pathlib import Path

from conftest import ROOT_DIR


def _get_prop(item: dict, property_id: str):
    """Extract value from additionalProperty by propertyID."""
    for pv in item.get("additionalProperty", []):
        if pv.get("propertyID") == property_id:
            return pv.get("value")
    return None


def test_import_nirvana_bulk(auth_client):
    fixture_path = ROOT_DIR / "backend" / "tests" / "fixtures" / "nirvana_export.sample.json"
    raw_items = json.loads(Path(fixture_path).read_text(encoding="utf-8"))

    response = auth_client.post(
        "/imports/nirvana",
        json={"items": raw_items, "emit_events": False},
    )
    assert response.status_code == 200
    summary = response.json()
    assert summary["total"] == len(raw_items)
    assert summary["errors"] == 0
    assert summary["created"] == len(raw_items)

    items = auth_client.get("/items?limit=1000").json()

    project = next(t for t in items if t["canonical_id"] == "urn:app:project:PROJ-123")
    has_part = {ref["@id"] for ref in project["item"]["hasPart"]}
    assert has_part == {"urn:app:action:TASK-001", "urn:app:action:TASK-002"}

    waiting = next(t for t in items if t["canonical_id"] == "urn:app:action:TASK-002")
    assert _get_prop(waiting["item"], "app:bucket") == "waiting"
    assert _get_prop(waiting["item"], "app:delegatedTo") == "Design team"

    recurring = next(t for t in items if t["canonical_id"] == "urn:app:action:TASK-005")
    assert _get_prop(recurring["item"], "app:recurrence")["kind"] == "monthly"

    inbox = next(t for t in items if t["canonical_id"] == "urn:app:inbox:TASK-006")
    assert _get_prop(inbox["item"], "app:bucket") == "inbox"
    assert _get_prop(inbox["item"], "app:rawCapture").startswith("https://")


def test_import_preserves_focus_and_calendar_due_fallback(auth_client):
    raw_items = [
        {
            "id": "TASK-FOCUS-001",
            "type": 0,
            "state": 1,
            "name": "Focused next action",
            "note": "",
            "tags": ",Work,",
            "created": 1738602000,
            "updated": 1738605600,
            "completed": 0,
            "parentid": "",
            "duedate": "",
            "startdate": "",
            "waitingfor": "",
            "energy": 1,
            "etime": 15,
            "recurring": "",
            "reminder": "",
            "seq": 3,
            "seqp": 0,
            "seqt": 1,
            "ps": 0,
            "cancelled": 0,
            "deleted": 0,
        },
        {
            "id": "TASK-CALENDAR-001",
            "type": 0,
            "state": 3,
            "name": "Scheduled calendar action",
            "note": "",
            "tags": ",Work,",
            "created": 1738602001,
            "updated": 1738605601,
            "completed": 0,
            "parentid": "",
            "duedate": "",
            "startdate": "20260418",
            "waitingfor": "",
            "energy": 1,
            "etime": 15,
            "recurring": "",
            "reminder": "",
            "seq": 4,
            "seqp": 0,
            "seqt": 0,
            "ps": 0,
            "cancelled": 0,
            "deleted": 0,
        },
    ]

    response = auth_client.post(
        "/imports/nirvana",
        json={"items": raw_items, "emit_events": False},
    )
    assert response.status_code == 200
    summary = response.json()
    assert summary["errors"] == 0
    assert summary["created"] == 2

    items = auth_client.get("/items?limit=1000").json()

    focused = next(t for t in items if t["canonical_id"] == "urn:app:action:TASK-FOCUS-001")
    assert _get_prop(focused["item"], "app:bucket") == "next"
    assert _get_prop(focused["item"], "app:isFocused") is True
    assert focused["item"]["sourceMetadata"]["provider"] == "nirvana"
    assert focused["item"]["sourceMetadata"]["raw"]["seqt"] == 1

    calendar = next(t for t in items if t["canonical_id"] == "urn:app:action:TASK-CALENDAR-001")
    assert _get_prop(calendar["item"], "app:bucket") == "calendar"
    assert _get_prop(calendar["item"], "app:startDate") == "2026-04-18"
    assert _get_prop(calendar["item"], "app:dueDate") == "2026-04-18"


def test_import_preserves_nirvana_source_metadata(auth_client):
    fixture_path = ROOT_DIR / "backend" / "tests" / "fixtures" / "nirvana_export.sample.json"
    raw_items = json.loads(Path(fixture_path).read_text(encoding="utf-8"))

    response = auth_client.post(
        "/imports/nirvana",
        json={"items": raw_items, "emit_events": False},
    )
    assert response.status_code == 200
    assert response.json()["errors"] == 0

    items = auth_client.get("/items?limit=1000").json()

    recurring = next(t for t in items if t["canonical_id"] == "urn:app:action:TASK-005")
    metadata = recurring["item"]["sourceMetadata"]
    assert metadata["schemaVersion"] == 1
    assert metadata["provider"] == "nirvana"
    assert metadata["rawId"] == "TASK-005"
    assert metadata["rawType"] == 0
    assert metadata["rawState"] == 9
    assert metadata["raw"]["reminder"] == ""
    assert metadata["raw"]["seqp"] == 0
    assert metadata["raw"]["ps"] == 0
    assert metadata["raw"]["recurring"].startswith('{"paused":false')
