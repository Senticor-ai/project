import hashlib
import time
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from conftest import ROOT_DIR
from fastapi.testclient import TestClient

from app.config import settings
from app.db import db_conn, jsonb
from app.routes.imports import _IMPORT_JOB_STALE_ERROR
from app.storage import get_storage
from app.worker import process_batch

_MAX_JOB_DRAIN_ATTEMPTS = 30
_JOB_DRAIN_SLEEP_SECONDS = 0.05


def _get_prop(item: dict, property_id: str):
    """Extract value from additionalProperty by propertyID."""
    for pv in item.get("additionalProperty", []):
        if pv.get("propertyID") == property_id:
            return pv.get("value")
    return None


def _create_file_record(
    org_id: str,
    owner_id: str,
    fixture_name: str = "nirvana_export.sample.json",
) -> str:
    fixture_path = ROOT_DIR / "backend" / "tests" / "fixtures" / fixture_name
    content = fixture_path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    file_id = str(uuid.uuid4())
    storage = get_storage()
    storage_key = f"files/{file_id}"
    storage.write(storage_key, content)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO files (
                    file_id,
                    org_id,
                    owner_id,
                    original_name,
                    content_type,
                    size_bytes,
                    sha256,
                    storage_path
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    file_id,
                    org_id,
                    owner_id,
                    fixture_path.name,
                    "application/json",
                    len(content),
                    digest,
                    storage_key,
                ),
            )
        conn.commit()

    return file_id


def _register_and_login(client: TestClient) -> dict[str, str]:
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    register = client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert register.status_code == 200

    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    payload = login.json()
    org_id = payload["default_org_id"]
    me = client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]
    client.headers.update({"X-Org-Id": org_id})
    return {"email": email, "user_id": user_id, "org_id": org_id}


def _drain_worker_until_completed(auth_client: TestClient, job_id: str) -> dict:
    last_status = None
    for _ in range(_MAX_JOB_DRAIN_ATTEMPTS):
        process_batch(limit=25)
        response = auth_client.get(f"/imports/jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()
        last_status = payload.get("status")
        if last_status == "completed":
            return payload
        time.sleep(_JOB_DRAIN_SLEEP_SECONDS)
    raise AssertionError(f"job {job_id} did not complete (last status: {last_status})")


def test_import_from_file_flow(auth_client):
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    inspect = auth_client.post(
        "/imports/nirvana/inspect",
        json={
            "file_id": file_id,
            "include_completed": False,
        },
    )
    assert inspect.status_code == 200
    summary = inspect.json()
    assert summary["total"] > 0
    assert summary["errors"] == 0

    queued = auth_client.post(
        "/imports/nirvana/from-file",
        json={
            "file_id": file_id,
            "include_completed": False,
            "emit_events": False,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    payload = _drain_worker_until_completed(auth_client, job_id)
    assert payload["status"] == "completed"
    assert payload["summary"]["errors"] == 0

    items = auth_client.get("/items?limit=1000").json()
    assert any(t["canonical_id"] == "urn:app:project:PROJ-123" for t in items)


def test_import_from_file_matrix_fixture_preserves_fields(auth_client):
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(
        org_id,
        user_id,
        fixture_name="nirvana_export.validation_matrix.json",
    )

    queued = auth_client.post(
        "/imports/nirvana/from-file",
        json={
            "file_id": file_id,
            "include_completed": False,
            "emit_events": False,
            "state_bucket_map": {7: "reference"},
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    payload = _drain_worker_until_completed(auth_client, job_id)
    assert payload["status"] == "completed"
    assert payload["summary"]["errors"] == 0
    # 12 skipped: TRASHED (state 6), COMPLETED, LOGGED, DELETED, CANCELLED,
    # DELETED-FLAG, DELETED-CHILD, INBOX-COMPLETED, PROJ-COMPLETED,
    # WAITING-COMPLETED, SOMEDAY-COMPLETED, CALENDAR-COMPLETED
    assert payload["summary"]["skipped"] == 12

    items = {row["canonical_id"]: row for row in auth_client.get("/items?limit=2000").json()}
    assert "urn:app:action:TASK-MATRIX-COMPLETED" not in items

    focused = items["urn:app:action:TASK-MATRIX-FOCUS"]["item"]
    assert _get_prop(focused, "app:isFocused") is True

    calendar_start = items["urn:app:action:TASK-MATRIX-CALENDAR-START"]["item"]
    assert _get_prop(calendar_start, "app:startDate") == "2026-04-01"
    assert _get_prop(calendar_start, "app:dueDate") == "2026-04-01"

    state7_reference = items["urn:app:reference:TASK-MATRIX-STATE7"]["item"]
    assert _get_prop(state7_reference, "app:bucket") == "reference"
    assert state7_reference["sourceMetadata"]["raw"]["seqp"] == 3


def test_import_from_file_dedupes_same_active_job(auth_client):
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    payload = {
        "file_id": file_id,
        "include_completed": False,
        "emit_events": False,
    }
    first = auth_client.post("/imports/nirvana/from-file", json=payload)
    second = auth_client.post("/imports/nirvana/from-file", json=payload)
    assert first.status_code == 202
    assert second.status_code == 202
    first_job = first.json()
    second_job = second.json()
    assert first_job["job_id"] == second_job["job_id"]
    assert first_job["status"] in ("queued", "running")
    assert second_job["status"] in ("queued", "running")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS c
                FROM import_jobs
                WHERE org_id = %s
                  AND file_id = %s
                  AND source = 'nirvana'
                  AND status IN ('queued', 'running')
                """,
                (org_id, file_id),
            )
            active_jobs = cur.fetchone()["c"]
            cur.execute(
                """
                SELECT COUNT(*) AS c
                FROM outbox_events
                WHERE event_type = 'nirvana_import_job'
                  AND payload->>'job_id' = %s
                """,
                (first_job["job_id"],),
            )
            queued_events = cur.fetchone()["c"]
        conn.commit()

    assert active_jobs == 1
    assert queued_events == 1


def test_list_import_jobs_filters_by_status(auth_client):
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    queued = auth_client.post(
        "/imports/nirvana/from-file",
        json={
            "file_id": file_id,
            "include_completed": False,
            "emit_events": False,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    queued_list = auth_client.get("/imports/jobs?status=queued&limit=20")
    assert queued_list.status_code == 200
    queued_ids = {row["job_id"] for row in queued_list.json()}
    if job_id not in queued_ids:
        # The worker may advance very quickly; verify terminal progression instead.
        status_now = auth_client.get(f"/imports/jobs/{job_id}").json()["status"]
        assert status_now in {"running", "completed"}

    _drain_worker_until_completed(auth_client, job_id)

    completed_list = auth_client.get("/imports/jobs?status=completed&limit=20")
    assert completed_list.status_code == 200
    completed_items = completed_list.json()
    completed_ids = {row["job_id"] for row in completed_items}
    assert job_id in completed_ids
    assert all(row["status"] == "completed" for row in completed_items)

    default_list = auth_client.get("/imports/jobs?limit=20")
    assert default_list.status_code == 200
    default_ids = {row["job_id"] for row in default_list.json()}
    assert job_id in default_ids


def test_import_job_marks_stale_queue_as_failed(auth_client):
    if settings.import_job_queue_timeout_seconds <= 0:
        pytest.skip("Queue timeout disabled")

    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    stale_at = datetime.now(UTC) - timedelta(seconds=settings.import_job_queue_timeout_seconds + 60)
    job_id = str(uuid.uuid4())
    options = {
        "update_existing": True,
        "include_completed": True,
        "emit_events": False,
        "state_bucket_map": None,
        "default_bucket": "inbox",
    }

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO import_jobs (
                    job_id,
                    org_id,
                    owner_id,
                    file_id,
                    source,
                    status,
                    options,
                    created_at,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    job_id,
                    org_id,
                    user_id,
                    file_id,
                    "nirvana",
                    "queued",
                    jsonb(options),
                    stale_at,
                    stale_at,
                ),
            )
        conn.commit()

    job = auth_client.get(f"/imports/jobs/{job_id}")
    assert job.status_code == 200
    payload = job.json()
    assert payload["status"] == "failed"
    assert payload["error"] == _IMPORT_JOB_STALE_ERROR


def test_get_import_job_is_scoped_to_owner(app):
    owner_client = TestClient(app)
    other_client = TestClient(app)

    owner = _register_and_login(owner_client)
    other = _register_and_login(other_client)

    add_member = owner_client.post(
        f"/orgs/{owner['org_id']}/members",
        json={"email": other["email"], "role": "member"},
        headers={"X-Org-Id": owner["org_id"]},
    )
    assert add_member.status_code == 201

    file_id = _create_file_record(owner["org_id"], owner["user_id"])
    queued = owner_client.post(
        "/imports/nirvana/from-file",
        json={"file_id": file_id, "include_completed": False, "emit_events": False},
        headers={"X-Org-Id": owner["org_id"]},
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    owner_job = owner_client.get(
        f"/imports/jobs/{job_id}",
        headers={"X-Org-Id": owner["org_id"]},
    )
    assert owner_job.status_code == 200

    other_job = other_client.get(
        f"/imports/jobs/{job_id}",
        headers={"X-Org-Id": owner["org_id"]},
    )
    assert other_job.status_code == 404
