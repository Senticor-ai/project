"""Tests for import job retry and archive endpoints."""

import hashlib
import json
import time
import uuid
from datetime import UTC, datetime

from conftest import ROOT_DIR

from app.db import db_conn
from app.storage import get_storage
from app.worker import process_batch

_MAX_WORKER_DRAIN_ATTEMPTS = 20
_WORKER_DRAIN_SLEEP_SECONDS = 0.05


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
                    file_id, org_id, owner_id, original_name,
                    content_type, size_bytes, sha256, storage_path
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


def _create_failed_job(auth_client, file_id: str) -> str:
    """Queue a native import job and force it to 'failed' status."""
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

    # Force to failed status
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE import_jobs
                SET status = 'failed',
                    error = 'Test failure',
                    finished_at = %s,
                    updated_at = %s
                WHERE job_id = %s
                """,
                (datetime.now(UTC), datetime.now(UTC), job_id),
            )
        conn.commit()

    return job_id


def _get_job_status(job_id: str) -> str | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM import_jobs WHERE job_id = %s", (job_id,))
            row = cur.fetchone()
    if row is None:
        return None
    return row["status"]


def _drain_worker_until_status(job_id: str, expected_status: str) -> None:
    for _ in range(_MAX_WORKER_DRAIN_ATTEMPTS):
        process_batch(limit=10)
        status = _get_job_status(job_id)
        if status == expected_status:
            return
        time.sleep(_WORKER_DRAIN_SLEEP_SECONDS)
    raise AssertionError(f"job {job_id} did not reach status={expected_status}")


def _create_completed_job(auth_client, file_id: str) -> str:
    """Queue a native import job and run it to completion via worker."""
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

    _drain_worker_until_status(job_id, "completed")
    return job_id


# ---------------------------------------------------------------------------
# Retry endpoint
# ---------------------------------------------------------------------------


def test_retry_failed_job_creates_new_queued_job(auth_client):
    """POST /imports/jobs/{id}/retry on a failed job returns 202 with a new queued job."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    failed_job_id = _create_failed_job(auth_client, file_id)

    response = auth_client.post(f"/imports/jobs/{failed_job_id}/retry")
    assert response.status_code == 202

    new_job = response.json()
    assert new_job["status"] == "queued"
    assert new_job["job_id"] != failed_job_id
    assert new_job["file_id"] == file_id
    assert new_job["source"] == "native"


def test_retry_returns_409_for_completed_job(auth_client):
    """Retry rejects non-failed jobs with 409."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    completed_job_id = _create_completed_job(auth_client, file_id)

    response = auth_client.post(f"/imports/jobs/{completed_job_id}/retry")
    assert response.status_code == 409
    assert "failed" in response.json()["detail"].lower()


def test_retry_returns_409_for_queued_job(auth_client):
    """Retry rejects queued (active) jobs with 409."""
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

    response = auth_client.post(f"/imports/jobs/{job_id}/retry")
    assert response.status_code == 409


def test_retry_returns_404_for_nonexistent_job(auth_client):
    """Retry returns 404 for unknown job_id."""
    response = auth_client.post(f"/imports/jobs/{uuid.uuid4()}/retry")
    assert response.status_code == 404


def test_retry_reuses_active_job(auth_client):
    """If an active job already exists for the same file+source+options, retry returns it."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    failed_job_id = _create_failed_job(auth_client, file_id)

    # First retry creates a new queued job
    first = auth_client.post(f"/imports/jobs/{failed_job_id}/retry")
    assert first.status_code == 202
    new_job_id = first.json()["job_id"]

    # Insert a second failed job directly via SQL (not via from-file,
    # which would reuse the active job and then _create_failed_job would
    # force it to failed, defeating the purpose of this test).
    # Options must match what from-file stores.
    second_failed_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    options_json = json.dumps(
        {"update_existing": True, "include_completed": True, "emit_events": False},
        sort_keys=True,
    )
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO import_jobs (
                    job_id, org_id, owner_id, file_id, source,
                    status, options, error, created_at, updated_at, finished_at
                )
                VALUES (%s, %s, %s, %s, 'native', 'failed', %s::jsonb, 'Test failure', %s, %s, %s)
                """,
                (second_failed_id, org_id, user_id, file_id, options_json, now, now, now),
            )
        conn.commit()

    # Second retry should reuse the active queued job from the first retry
    second = auth_client.post(f"/imports/jobs/{second_failed_id}/retry")
    assert second.status_code == 202
    assert second.json()["job_id"] == new_job_id


def test_retried_job_completes_via_worker(auth_client):
    """A retried job can be processed by the worker to completion."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    failed_job_id = _create_failed_job(auth_client, file_id)

    retry_resp = auth_client.post(f"/imports/jobs/{failed_job_id}/retry")
    assert retry_resp.status_code == 202
    new_job_id = retry_resp.json()["job_id"]

    _drain_worker_until_status(new_job_id, "completed")

    job = auth_client.get(f"/imports/jobs/{new_job_id}").json()
    assert job["status"] == "completed"
    assert job["summary"]["total"] == 6


# ---------------------------------------------------------------------------
# Archive endpoint
# ---------------------------------------------------------------------------


def test_archive_failed_job(auth_client):
    """POST /imports/jobs/{id}/archive on a failed job returns 200 with archived_at set."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    failed_job_id = _create_failed_job(auth_client, file_id)

    response = auth_client.post(f"/imports/jobs/{failed_job_id}/archive")
    assert response.status_code == 200

    data = response.json()
    assert data["archived_at"] is not None
    assert data["job_id"] == failed_job_id


def test_archive_completed_job(auth_client):
    """Archive works on completed jobs too."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    completed_job_id = _create_completed_job(auth_client, file_id)

    response = auth_client.post(f"/imports/jobs/{completed_job_id}/archive")
    assert response.status_code == 200
    assert response.json()["archived_at"] is not None


def test_archive_returns_409_for_queued_job(auth_client):
    """Active jobs (queued/running) cannot be archived."""
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

    response = auth_client.post(f"/imports/jobs/{job_id}/archive")
    assert response.status_code == 409
    assert "active" in response.json()["detail"].lower()


def test_archive_returns_404_for_nonexistent_job(auth_client):
    """Archive returns 404 for unknown job_id."""
    response = auth_client.post(f"/imports/jobs/{uuid.uuid4()}/archive")
    assert response.status_code == 404


def test_archived_job_excluded_from_listing(auth_client):
    """Archived jobs are hidden from GET /imports/jobs."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    failed_job_id = _create_failed_job(auth_client, file_id)

    # Verify it appears in listing before archiving
    listing_before = auth_client.get("/imports/jobs?status=failed")
    job_ids_before = [j["job_id"] for j in listing_before.json()]
    assert failed_job_id in job_ids_before

    # Archive it
    archive_resp = auth_client.post(f"/imports/jobs/{failed_job_id}/archive")
    assert archive_resp.status_code == 200

    # Verify it's gone from listing
    listing_after = auth_client.get("/imports/jobs?status=failed")
    job_ids_after = [j["job_id"] for j in listing_after.json()]
    assert failed_job_id not in job_ids_after


def test_archived_job_still_accessible_by_id(auth_client):
    """Archived jobs can still be fetched directly via GET /imports/jobs/{id}."""
    user_id = auth_client.get("/auth/me").json()["id"]
    org_id = auth_client.headers["X-Org-Id"]
    file_id = _create_file_record(org_id, user_id)
    failed_job_id = _create_failed_job(auth_client, file_id)

    auth_client.post(f"/imports/jobs/{failed_job_id}/archive")

    response = auth_client.get(f"/imports/jobs/{failed_job_id}")
    assert response.status_code == 200
    assert response.json()["archived_at"] is not None
    assert response.json()["job_id"] == failed_job_id
