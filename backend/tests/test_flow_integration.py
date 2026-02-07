import os
import uuid

import psycopg
from psycopg.rows import dict_row


def _json_payload(value):
    if isinstance(value, str):
        import json

        return json.loads(value)
    return value


def test_user_flow_creates_things_and_assertions(client):
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    response = client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert response.status_code == 200

    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200

    response = client.get("/auth/me")
    assert response.status_code == 200
    user = response.json()

    thing_ids = []
    for index in range(3):
        thing = {
            "@id": f"urn:task:{uuid.uuid4()}",
            "@type": "CreativeWork",
            "@context": "https://schema.org",
            "name": f"Task {index + 1}",
            "keywords": ["personal", "backlog"],
            "dueDate": "2026-02-10",
        }
        response = client.post(
            "/things",
            json={"source": "manual", "thing": thing},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        assert response.status_code == 201
        thing_ids.append(response.json()["thing_id"])

    response = client.post(
        "/assertions",
        json={
            "thing_id": thing_ids[0],
            "assertion_type": "labels",
            "payload": {"labels": ["urgent", "home"], "due_date": "2026-02-10"},
            "actor_type": "user",
            "actor_id": user["id"],
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 200

    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT assertion_type, payload_json, actor_type, actor_id
                FROM assertions
                WHERE thing_id = %s
                """,
                (thing_ids[0],),
            )
            row = cur.fetchone()

    assert row is not None
    assert row["assertion_type"] == "labels"
    assert row["actor_type"] == "user"
    assert row["actor_id"] == user["id"]
    payload = _json_payload(row["payload_json"])
    assert payload["labels"] == ["urgent", "home"]
    assert payload["due_date"] == "2026-02-10"
