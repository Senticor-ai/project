import hashlib
import json
import uuid
from pathlib import Path

from app.config import settings
from app.db import db_conn
from app.worker import process_batch

from conftest import ROOT_DIR


def _create_file_record(org_id: str, owner_id: str) -> str:
    fixture_path = ROOT_DIR / "backend" / "tests" / "fixtures" / "nirvana_export.sample.json"
    content = fixture_path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    file_id = str(uuid.uuid4())
    storage_dir = settings.file_storage_path
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = storage_dir / file_id
    storage_path.write_bytes(content)

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
                    "nirvana_export.sample.json",
                    "application/json",
                    len(content),
                    digest,
                    str(storage_path),
                ),
            )
        conn.commit()

    return file_id


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

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM outbox_events
                WHERE payload->>'job_id' IS DISTINCT FROM %s
                """,
                (job_id,),
            )
        conn.commit()

    processed = process_batch(limit=10)
    assert processed >= 1

    job = auth_client.get(f"/imports/jobs/{job_id}")
    assert job.status_code == 200
    payload = job.json()
    assert payload["status"] == "completed"
    assert payload["summary"]["errors"] == 0

    things = auth_client.get("/things?limit=1000").json()
    assert any(t["canonical_id"] == "urn:gtd:project:PROJ-123" for t in things)
