import csv
import io
import re
import uuid
from datetime import datetime


def _create_thing(auth_client, thing: dict, source: str = "manual") -> dict:
    response = auth_client.post("/things", json={"thing": thing, "source": source})
    assert response.status_code == 201
    return response.json()


def _action_thing(
    *,
    name: str = "Ship export endpoint",
    description: str = "Export all GTD items",
    raw_capture: str = "capture, with comma",
    bucket: str = "next",
) -> dict:
    return {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": name,
        "description": description,
        "rawCapture": raw_capture,
        "additionalProperty": [
            {
                "@type": "PropertyValue",
                "propertyID": "app:bucket",
                "value": bucket,
            },
        ],
    }


def test_export_json_returns_array_and_headers(auth_client):
    created = _create_thing(auth_client, _action_thing())

    response = auth_client.get("/things/export?format=json")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert re.fullmatch(
        r'attachment; filename="things-export-\d{8}T\d{6}Z\.json"',
        response.headers["content-disposition"],
    )

    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) == 1
    exported = payload[0]
    assert exported["thing_id"] == created["thing_id"]
    assert exported["canonical_id"] == created["canonical_id"]
    assert exported["source"] == "manual"
    assert exported["thing"]["@id"] == created["canonical_id"]
    assert exported["thing"]["@type"] == "Action"
    assert exported["thing"]["name"] == "Ship export endpoint"


def test_export_csv_returns_rows_and_headers(auth_client):
    created = _create_thing(auth_client, _action_thing())

    response = auth_client.get("/things/export?format=csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert re.fullmatch(
        r'attachment; filename="things-export-\d{8}T\d{6}Z\.csv"',
        response.headers["content-disposition"],
    )

    parsed = csv.DictReader(io.StringIO(response.text))
    assert parsed.fieldnames == [
        "thing_id",
        "canonical_id",
        "source",
        "type",
        "name",
        "raw_capture",
        "description",
        "bucket",
        "created_at",
        "updated_at",
    ]
    rows = list(parsed)
    assert len(rows) == 1

    row = rows[0]
    assert row["thing_id"] == created["thing_id"]
    assert row["canonical_id"] == created["canonical_id"]
    assert row["source"] == "manual"
    assert row["type"] == "Action"
    assert row["name"] == "Ship export endpoint"
    assert row["raw_capture"] == "capture, with comma"
    assert row["description"] == "Export all GTD items"
    assert row["bucket"] == "next"
    assert datetime.fromisoformat(row["created_at"])
    assert datetime.fromisoformat(row["updated_at"])


def test_export_json_empty_returns_empty_array(auth_client):
    response = auth_client.get("/things/export?format=json")
    assert response.status_code == 200
    assert response.json() == []


def test_export_csv_empty_returns_header_only(auth_client):
    response = auth_client.get("/things/export?format=csv")
    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert rows == []
    assert response.text.startswith(
        "thing_id,canonical_id,source,type,name,raw_capture,description,bucket,created_at,updated_at",
    )


def test_export_requires_authentication(client):
    response = client.get("/things/export?format=json")
    assert response.status_code == 401


def test_export_rejects_invalid_format(auth_client):
    response = auth_client.get("/things/export?format=xml")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid format; expected 'json' or 'csv'"
