import json
from pathlib import Path

from conftest import ROOT_DIR


def test_import_nirvana_bulk(auth_client):
    fixture_path = ROOT_DIR / "backend" / "tests" / "fixtures" / "nirvana_export.sample.json"
    items = json.loads(Path(fixture_path).read_text(encoding="utf-8"))

    response = auth_client.post(
        "/imports/nirvana",
        json={"items": items, "emit_events": False},
    )
    assert response.status_code == 200
    summary = response.json()
    assert summary["total"] == len(items)
    assert summary["errors"] == 0
    assert summary["created"] == len(items)

    things = auth_client.get("/things?limit=1000").json()

    project = next(
        t for t in things if t["canonical_id"] == "urn:gtd:project:PROJ-123"
    )
    action_ids = set(project["thing"]["actionIds"])
    assert action_ids == {"urn:gtd:action:TASK-001", "urn:gtd:action:TASK-002"}

    waiting = next(
        t for t in things if t["canonical_id"] == "urn:gtd:action:TASK-002"
    )
    assert waiting["thing"]["bucket"] == "waiting"
    assert waiting["thing"]["delegatedTo"] == "Design team"

    recurring = next(
        t for t in things if t["canonical_id"] == "urn:gtd:action:TASK-005"
    )
    assert recurring["thing"]["recurrence"]["kind"] == "monthly"

    inbox = next(
        t for t in things if t["canonical_id"] == "urn:gtd:inbox:TASK-006"
    )
    assert inbox["thing"]["bucket"] == "inbox"
    assert inbox["thing"]["rawCapture"].startswith("https://")
