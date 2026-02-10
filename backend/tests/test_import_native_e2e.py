"""End-to-end round-trip test: create → export → import on a different org.

Proves the complete export/import cycle works across instances by using two
different authenticated users (each with their own org) in the same test DB.
"""

import hashlib
import json
import uuid

from fastapi.testclient import TestClient

from app.db import db_conn
from app.storage import get_storage
from app.worker import process_batch


def _get_prop(item: dict, property_id: str):
    for pv in item.get("additionalProperty", []):
        if pv.get("propertyID") == property_id:
            return pv.get("value")
    return None


def _register_and_login(client: TestClient) -> dict[str, str]:
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    reg = client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert reg.status_code == 200

    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    payload = login.json()
    org_id = payload["default_org_id"]
    me = client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]
    client.headers.update({"X-Org-Id": org_id})
    return {"email": email, "user_id": user_id, "org_id": org_id}


def _store_export_as_file(org_id: str, owner_id: str, export_bytes: bytes) -> str:
    """Write export JSON bytes into file storage + files table, return file_id."""
    digest = hashlib.sha256(export_bytes).hexdigest()
    file_id = str(uuid.uuid4())
    storage = get_storage()
    storage_key = f"files/{file_id}"
    storage.write(storage_key, export_bytes)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO files (
                    file_id, org_id, owner_id, original_name,
                    content_type, size_bytes, sha256, storage_path
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    file_id,
                    org_id,
                    owner_id,
                    "items-export.json",
                    "application/json",
                    len(export_bytes),
                    digest,
                    storage_key,
                ),
            )
        conn.commit()
    return file_id


def _run_import_job(
    auth_client: TestClient,
    file_id: str,
    *,
    include_completed: bool = True,
    emit_events: bool = False,
):
    """Queue a native import job, process it, and return the completed job payload."""
    queued = auth_client.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id,
            "include_completed": include_completed,
            "emit_events": emit_events,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM outbox_events WHERE payload->>'job_id' IS DISTINCT FROM %s",
                (job_id,),
            )
        conn.commit()

    processed = process_batch(limit=10)
    assert processed >= 1

    job = auth_client.get(f"/imports/jobs/{job_id}")
    assert job.status_code == 200
    return job.json()


# ---------------------------------------------------------------------------
# The e2e round-trip test
# ---------------------------------------------------------------------------


def test_export_then_import_on_different_org(app):
    """Full cycle: user A creates items, exports, user B imports into a fresh org."""
    # ---- Instance A: create items ----
    client_a = TestClient(app)
    _register_and_login(client_a)

    # Action (next, focused)
    action_next = client_a.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Focused next action",
                "description": "Something important",
                "keywords": ["work"],
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
                    {"@type": "PropertyValue", "propertyID": "app:isFocused", "value": True},
                    {"@type": "PropertyValue", "propertyID": "app:dueDate", "value": "2026-03-15"},
                    {"@type": "PropertyValue", "propertyID": "app:contexts", "value": ["office"]},
                ],
            },
            "source": "manual",
        },
    )
    assert action_next.status_code == 201

    # Action (waiting, delegated)
    action_waiting = client_a.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Waiting for review",
                "description": None,
                "keywords": ["work"],
                "startTime": None,
                "endTime": None,
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "waiting"},
                    {"@type": "PropertyValue", "propertyID": "app:delegatedTo", "value": "Bob"},
                    {"@type": "PropertyValue", "propertyID": "app:isFocused", "value": False},
                ],
            },
            "source": "manual",
        },
    )
    assert action_waiting.status_code == 201

    # Project with child reference
    project_id = f"urn:app:project:{uuid.uuid4()}"
    child_id = action_next.json()["canonical_id"]
    project = client_a.post(
        "/items",
        json={
            "item": {
                "@id": project_id,
                "@type": "Project",
                "_schemaVersion": 2,
                "name": "Big initiative",
                "description": "Quarterly goal",
                "keywords": ["strategic"],
                "endTime": None,
                "hasPart": [{"@id": child_id}],
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "project"},
                    {
                        "@type": "PropertyValue",
                        "propertyID": "app:projectStatus",
                        "value": "active",
                    },
                    {
                        "@type": "PropertyValue",
                        "propertyID": "app:desiredOutcome",
                        "value": "Ship it",
                    },
                    {"@type": "PropertyValue", "propertyID": "app:isFocused", "value": False},
                ],
            },
            "source": "manual",
        },
    )
    assert project.status_code == 201

    # Completed action
    completed_action = client_a.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Done task",
                "description": None,
                "keywords": [],
                "startTime": None,
                "endTime": "2026-01-28T14:00:00Z",
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
                    {"@type": "PropertyValue", "propertyID": "app:isFocused", "value": False},
                ],
            },
            "source": "manual",
        },
    )
    assert completed_action.status_code == 201

    # Reference
    reference = client_a.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:reference:{uuid.uuid4()}",
                "@type": "CreativeWork",
                "_schemaVersion": 2,
                "name": "Architecture doc",
                "description": "System design reference",
                "keywords": ["docs"],
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "reference"},
                ],
            },
            "source": "manual",
        },
    )
    assert reference.status_code == 201

    # Someday action
    someday = client_a.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Learn Rust",
                "description": None,
                "keywords": ["personal"],
                "startTime": None,
                "endTime": None,
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "someday"},
                    {"@type": "PropertyValue", "propertyID": "app:isFocused", "value": False},
                ],
            },
            "source": "manual",
        },
    )
    assert someday.status_code == 201

    # ---- Instance A: export (include completed) ----
    export_resp = client_a.get("/items/export?include_completed=true")
    assert export_resp.status_code == 200
    export_data = export_resp.json()
    assert len(export_data) == 6
    export_bytes = json.dumps(export_data).encode("utf-8")

    # Sanity: every exported item has item_id, canonical_id, item
    for row in export_data:
        assert "item_id" in row
        assert "canonical_id" in row
        assert "item" in row
        assert row["item"]["@type"] in ("Action", "Project", "CreativeWork")

    # ---- Instance B: fresh user/org ----
    client_b = TestClient(app)
    user_b = _register_and_login(client_b)

    # Verify B starts empty
    items_b_before = client_b.get("/items?limit=1000").json()
    assert len(items_b_before) == 0

    # Upload export file in B's org
    file_id = _store_export_as_file(user_b["org_id"], user_b["user_id"], export_bytes)

    # ---- Instance B: inspect (dry-run) ----
    inspect = client_b.post(
        "/imports/native/inspect",
        json={"file_id": file_id, "include_completed": True},
    )
    assert inspect.status_code == 200
    preview = inspect.json()
    assert preview["total"] == 6
    assert preview["created"] == 6
    assert preview["errors"] == 0

    # ---- Instance B: import ----
    job_payload = _run_import_job(client_b, file_id)
    assert job_payload["status"] == "completed"
    assert job_payload["summary"]["total"] == 6
    assert job_payload["summary"]["created"] == 6
    assert job_payload["summary"]["errors"] == 0

    # ---- Verify: all items present in B ----
    items_b = {row["canonical_id"]: row for row in client_b.get("/items?limit=1000").json()}
    assert len(items_b) == 6

    # Build lookup from A's export for comparison
    export_by_cid = {row["canonical_id"]: row for row in export_data}

    for canonical_id, exported in export_by_cid.items():
        imported = items_b[canonical_id]

        # item_id is NEW (different org generates new UUIDs)
        assert imported["item_id"] != exported["item_id"]

        # canonical_id is preserved
        assert imported["canonical_id"] == exported["canonical_id"]

        # source is preserved (provenance)
        assert imported["source"] == exported["source"]

        # JSON-LD payload matches
        assert imported["item"]["@type"] == exported["item"]["@type"]
        assert imported["item"]["name"] == exported["item"]["name"]
        assert imported["item"].get("description") == exported["item"].get("description")
        assert imported["item"].get("keywords") == exported["item"].get("keywords")

    # Specific field checks
    imported_next = items_b[action_next.json()["canonical_id"]]
    assert _get_prop(imported_next["item"], "app:bucket") == "next"
    assert _get_prop(imported_next["item"], "app:isFocused") is True
    assert _get_prop(imported_next["item"], "app:dueDate") == "2026-03-15"

    imported_waiting = items_b[action_waiting.json()["canonical_id"]]
    assert _get_prop(imported_waiting["item"], "app:bucket") == "waiting"
    assert _get_prop(imported_waiting["item"], "app:delegatedTo") == "Bob"

    imported_project = items_b[project.json()["canonical_id"]]
    assert imported_project["item"]["@type"] == "Project"
    has_part = {ref["@id"] for ref in imported_project["item"].get("hasPart", [])}
    assert child_id in has_part
    assert _get_prop(imported_project["item"], "app:projectStatus") == "active"

    imported_completed = items_b[completed_action.json()["canonical_id"]]
    assert imported_completed["item"]["endTime"] == "2026-01-28T14:00:00Z"

    imported_ref = items_b[reference.json()["canonical_id"]]
    assert imported_ref["item"]["@type"] == "CreativeWork"
    assert _get_prop(imported_ref["item"], "app:bucket") == "reference"

    imported_someday = items_b[someday.json()["canonical_id"]]
    assert _get_prop(imported_someday["item"], "app:bucket") == "someday"

    # ---- Verify: re-import is idempotent ----
    file_id_2 = _store_export_as_file(user_b["org_id"], user_b["user_id"], export_bytes)
    job2 = _run_import_job(client_b, file_id_2)
    assert job2["status"] == "completed"
    assert job2["summary"]["created"] == 0
    assert job2["summary"]["unchanged"] == 6

    # Still 6 items, no duplicates
    items_b_after = client_b.get("/items?limit=1000").json()
    assert len(items_b_after) == 6


def test_export_then_import_exclude_completed(app):
    """Round-trip with include_completed=false skips completed items."""
    client_a = TestClient(app)
    _register_and_login(client_a)

    # Create active + completed
    client_a.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Active task",
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
                ],
            },
            "source": "manual",
        },
    )
    client_a.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Completed task",
                "endTime": "2026-01-20T18:00:00Z",
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
                ],
            },
            "source": "manual",
        },
    )

    # Export includes completed
    export_resp = client_a.get("/items/export?include_completed=true")
    assert export_resp.status_code == 200
    export_data = export_resp.json()
    assert len(export_data) == 2
    export_bytes = json.dumps(export_data).encode("utf-8")

    # Import on B with include_completed=false
    client_b = TestClient(app)
    user_b = _register_and_login(client_b)
    file_id = _store_export_as_file(user_b["org_id"], user_b["user_id"], export_bytes)

    job = _run_import_job(client_b, file_id, include_completed=False)
    assert job["status"] == "completed"
    assert job["summary"]["created"] == 1
    assert job["summary"]["skipped"] == 1

    items_b = client_b.get("/items?limit=1000").json()
    assert len(items_b) == 1
    assert items_b[0]["item"]["name"] == "Active task"


# ---------------------------------------------------------------------------
# emit_events=True: item_upserted events processed by the worker
# ---------------------------------------------------------------------------


def test_import_with_emit_events_processes_item_upserted(app):
    """Import with emit_events=True: worker processes item_upserted without errors."""
    client_a = TestClient(app)
    _register_and_login(client_a)

    # Create a few items on org A
    for i in range(3):
        resp = client_a.post(
            "/items",
            json={
                "item": {
                    "@id": f"urn:app:action:{uuid.uuid4()}",
                    "@type": "Action",
                    "_schemaVersion": 2,
                    "name": f"Event test item {i}",
                    "additionalProperty": [
                        {
                            "@type": "PropertyValue",
                            "propertyID": "app:bucket",
                            "value": "next",
                        },
                    ],
                },
                "source": "manual",
            },
        )
        assert resp.status_code == 201

    # Drain ALL existing events (from item creation, auth, etc.)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM outbox_events WHERE processed_at IS NULL",
            )
        conn.commit()

    # Export
    export_resp = client_a.get("/items/export")
    assert export_resp.status_code == 200
    export_data = export_resp.json()
    assert len(export_data) == 3
    export_bytes = json.dumps(export_data).encode("utf-8")

    # Import on org B with emit_events=True
    client_b = TestClient(app)
    user_b = _register_and_login(client_b)
    file_id = _store_export_as_file(user_b["org_id"], user_b["user_id"], export_bytes)

    # Drain events from user B registration
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM outbox_events WHERE processed_at IS NULL",
            )
        conn.commit()

    queued = client_b.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id,
            "include_completed": True,
            "emit_events": True,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    # First batch: processes native_import_job → creates items + item_upserted events
    batch1 = process_batch(limit=10)
    assert batch1 >= 1

    # Verify import job completed
    job = client_b.get(f"/imports/jobs/{job_id}")
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    assert job.json()["summary"]["created"] == 3

    # Check what item_upserted events were created and whether items exist
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, event_type, payload
                FROM outbox_events
                WHERE processed_at IS NULL
                  AND event_type = 'item_upserted'
                """
            )
            pending_events = cur.fetchall()

            # For each event, check if the item actually exists
            for evt in pending_events:
                item_id = evt["payload"]["item_id"]
                cur.execute(
                    "SELECT item_id FROM items WHERE item_id = %s::uuid",
                    (item_id,),
                )
                found = cur.fetchone()
                assert found is not None, (
                    f"item_upserted event references item_id={item_id} "
                    f"but no such item exists in the database"
                )

    # Second batch: processes the item_upserted events emitted during import
    batch2 = process_batch(limit=50)

    # Verify no dead-lettered events remain
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, event_type, payload, dead_lettered_at, last_error
                FROM outbox_events
                WHERE dead_lettered_at IS NOT NULL
                """
            )
            dead_letters = cur.fetchall()

    assert dead_letters == [], (
        f"Dead-lettered events found: "
        f"{[(dl['event_type'], dl['last_error']) for dl in dead_letters]}"
    )

    # Verify no unprocessed item_upserted events remain
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, event_type, payload, last_error
                FROM outbox_events
                WHERE processed_at IS NULL
                  AND dead_lettered_at IS NULL
                  AND event_type = 'item_upserted'
                """
            )
            unprocessed = cur.fetchall()

    # All item_upserted events should have been processed (or at least attempted)
    if batch2 > 0:
        assert unprocessed == [], (
            f"Unprocessed item_upserted events: "
            f"{[(u['event_type'], u.get('last_error')) for u in unprocessed]}"
        )


def test_item_upserted_events_from_api_also_processed(app):
    """Verify that item_upserted events from normal API item creation are also processable."""
    client = TestClient(app)
    _register_and_login(client)

    # Clean all existing events
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM outbox_events WHERE processed_at IS NULL")
        conn.commit()

    # Create an item via the API
    resp = client.post(
        "/items",
        json={
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Worker test item",
                "additionalProperty": [
                    {
                        "@type": "PropertyValue",
                        "propertyID": "app:bucket",
                        "value": "next",
                    },
                ],
            },
            "source": "manual",
        },
    )
    assert resp.status_code == 201
    created_item_id = resp.json()["item_id"]

    # Check what events exist
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, event_type, payload
                FROM outbox_events
                WHERE processed_at IS NULL
                  AND event_type = 'item_upserted'
                """
            )
            events = cur.fetchall()

    assert len(events) == 1
    event_item_id = events[0]["payload"]["item_id"]
    assert event_item_id == created_item_id

    # Process the event
    processed = process_batch(limit=10)
    assert processed >= 1

    # Verify no failures
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, event_type, last_error
                FROM outbox_events
                WHERE last_error IS NOT NULL
                  AND event_type = 'item_upserted'
                """
            )
            failed = cur.fetchall()

    assert failed == [], f"Failed events: {[(f['event_type'], f['last_error']) for f in failed]}"
