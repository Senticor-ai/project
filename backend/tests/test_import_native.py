import hashlib
import time
import uuid

from conftest import ROOT_DIR

from app.db import db_conn
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
    fixture_name: str = "native_export.sample.json",
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


def _drain_worker_until_completed(auth_client, job_id: str) -> dict:
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


# ---------------------------------------------------------------------------
# Inspect endpoint (dry-run)
# ---------------------------------------------------------------------------


def test_native_inspect_returns_summary(auth_client):
    """POST /imports/native/inspect parses the file and returns dry-run counts."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    response = auth_client.post(
        "/imports/native/inspect",
        json={"file_id": file_id, "include_completed": True},
    )
    assert response.status_code == 200
    summary = response.json()
    # Fixture has 6 items (1 completed), all should be "created" on a fresh DB
    assert summary["total"] == 6
    assert summary["created"] == 6
    assert summary["errors"] == 0
    assert summary["skipped"] == 0
    assert "next" in summary["bucket_counts"]
    assert "project" in summary["bucket_counts"]
    assert "reference" in summary["bucket_counts"]


def test_native_inspect_excludes_completed(auth_client):
    """Dry-run with include_completed=false skips the completed item."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    response = auth_client.post(
        "/imports/native/inspect",
        json={"file_id": file_id, "include_completed": False},
    )
    assert response.status_code == 200
    summary = response.json()
    assert summary["total"] == 6
    assert summary["created"] == 5
    assert summary["skipped"] == 1  # ACT-004 has endTime


# ---------------------------------------------------------------------------
# Full import via from-file + worker
# ---------------------------------------------------------------------------


def test_native_import_from_file_creates_items(auth_client):
    """Full import: queue job, process via worker, verify items created."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    queued = auth_client.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id,
            "include_completed": True,
            "emit_events": False,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    payload = _drain_worker_until_completed(auth_client, job_id)
    assert payload["status"] == "completed"
    assert payload["summary"]["total"] == 6
    assert payload["summary"]["created"] == 6
    assert payload["summary"]["errors"] == 0

    # Verify items are in the database
    items = {row["canonical_id"]: row for row in auth_client.get("/items?limit=1000").json()}

    # Active action with focus
    act001 = items["urn:app:action:ACT-001"]
    assert act001["item"]["name"] == "Buy groceries"
    assert _get_prop(act001["item"], "app:bucket") == "next"
    assert _get_prop(act001["item"], "app:isFocused") is True
    assert act001["source"] == "manual"  # original source preserved

    # Project with hasPart reference
    proj = items["urn:app:project:PROJ-001"]
    assert proj["item"]["@type"] == "Project"
    has_part = {ref["@id"] for ref in proj["item"]["hasPart"]}
    assert "urn:app:action:ACT-003" in has_part
    assert proj["source"] == "nirvana"  # original source preserved

    # Waiting action with delegation
    act003 = items["urn:app:action:ACT-003"]
    assert _get_prop(act003["item"], "app:bucket") == "waiting"
    assert _get_prop(act003["item"], "app:delegatedTo") == "Design team"

    # Completed action
    act004 = items["urn:app:action:ACT-004"]
    assert act004["item"]["endTime"] == "2026-01-20T18:00:00+00:00"

    # Reference item
    ref = items["urn:app:reference:REF-001"]
    assert ref["item"]["@type"] == "CreativeWork"
    assert _get_prop(ref["item"], "app:bucket") == "reference"

    # Someday action
    act006 = items["urn:app:action:ACT-006"]
    assert _get_prop(act006["item"], "app:bucket") == "someday"


def test_native_import_preserves_source_provenance(auth_client):
    """Each imported item keeps its original source field, not the import source."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    queued = auth_client.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id,
            "include_completed": True,
            "emit_events": False,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    _drain_worker_until_completed(auth_client, job_id)

    items = {row["canonical_id"]: row for row in auth_client.get("/items?limit=1000").json()}

    # Items from different sources keep their original source
    assert items["urn:app:action:ACT-001"]["source"] == "manual"
    assert items["urn:app:project:PROJ-001"]["source"] == "nirvana"
    assert items["urn:app:action:ACT-003"]["source"] == "nirvana"
    assert items["urn:app:reference:REF-001"]["source"] == "manual"


def test_native_import_reimport_is_idempotent(auth_client):
    """Re-importing the same file yields 'unchanged' items, not duplicates."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    # First import
    queued1 = auth_client.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id,
            "include_completed": True,
            "emit_events": False,
        },
    )
    assert queued1.status_code == 202
    job_id_1 = queued1.json()["job_id"]

    job1 = _drain_worker_until_completed(auth_client, job_id_1)
    assert job1["status"] == "completed"
    assert job1["summary"]["created"] == 6

    # Second import with a new file record (same content)
    file_id_2 = _create_file_record(org_id, user_id)
    queued2 = auth_client.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id_2,
            "include_completed": True,
            "emit_events": False,
        },
    )
    assert queued2.status_code == 202
    job_id_2 = queued2.json()["job_id"]

    job2 = _drain_worker_until_completed(auth_client, job_id_2)
    assert job2["status"] == "completed"
    assert job2["summary"]["created"] == 0
    assert job2["summary"]["unchanged"] == 6  # all unchanged on re-import

    # No duplicates
    items = auth_client.get("/items?limit=1000").json()
    canonical_ids = [row["canonical_id"] for row in items]
    assert len(canonical_ids) == len(set(canonical_ids))


# ---------------------------------------------------------------------------
# Legacy (thing/thing_id) format backward compatibility
# ---------------------------------------------------------------------------


def test_native_import_legacy_thing_format(auth_client):
    """Import from old export format using thing_id/thing fields."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id, fixture_name="native_export_legacy.sample.json")

    queued = auth_client.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id,
            "include_completed": True,
            "emit_events": False,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    job = _drain_worker_until_completed(auth_client, job_id)
    assert job["status"] == "completed"
    assert job["summary"]["total"] == 2
    assert job["summary"]["created"] == 2
    assert job["summary"]["errors"] == 0

    items = {row["canonical_id"]: row for row in auth_client.get("/items?limit=1000").json()}

    legacy_action = items["urn:app:action:LEGACY-001"]
    assert legacy_action["item"]["name"] == "Legacy action item"
    assert _get_prop(legacy_action["item"], "app:bucket") == "next"
    assert legacy_action["source"] == "nirvana"

    legacy_completed = items["urn:app:action:LEGACY-002"]
    assert legacy_completed["item"]["endTime"] == "2025-11-20T16:00:00+00:00"


def test_native_import_legacy_exclude_completed(auth_client):
    """Legacy format: include_completed=false skips completed items."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id, fixture_name="native_export_legacy.sample.json")

    queued = auth_client.post(
        "/imports/native/from-file",
        json={
            "file_id": file_id,
            "include_completed": False,
            "emit_events": False,
        },
    )
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    job = _drain_worker_until_completed(auth_client, job_id)
    assert job["status"] == "completed"
    assert job["summary"]["created"] == 1  # only LEGACY-001 (active)
    assert job["summary"]["skipped"] == 1  # LEGACY-002 (completed, skipped)


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


def test_native_import_dedupes_active_jobs(auth_client):
    """Submitting the same import twice returns the same job (no duplicate queue)."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)

    payload = {
        "file_id": file_id,
        "include_completed": True,
        "emit_events": False,
    }
    first = auth_client.post("/imports/native/from-file", json=payload)
    second = auth_client.post("/imports/native/from-file", json=payload)
    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["job_id"] == second.json()["job_id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS c
                FROM import_jobs
                WHERE org_id = %s
                  AND file_id = %s
                  AND source = 'native'
                  AND status IN ('queued', 'running')
                """,
                (org_id, file_id),
            )
            active_jobs = cur.fetchone()["c"]
        conn.commit()

    assert active_jobs == 1
