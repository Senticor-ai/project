import re
import uuid


def _create_item(auth_client, item: dict, source: str = "manual") -> dict:
    response = auth_client.post("/items", json={"item": item, "source": source})
    assert response.status_code == 201
    return response.json()


def _action_item(
    *,
    name: str = "Ship export endpoint",
    description: str = "Export all items",
    raw_capture: str = "capture, with comma",
    bucket: str = "next",
    end_time: str | None = None,
) -> dict:
    item: dict = {
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
    if end_time is not None:
        item["endTime"] = end_time
    return item


def test_export_json_returns_array_and_headers(auth_client):
    created = _create_item(auth_client, _action_item())

    response = auth_client.get("/items/export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert re.fullmatch(
        r'attachment; filename="items-export-\d{8}T\d{6}Z\.json"',
        response.headers["content-disposition"],
    )

    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) == 1
    exported = payload[0]
    assert exported["item_id"] == created["item_id"]
    assert exported["canonical_id"] == created["canonical_id"]
    assert exported["source"] == "manual"
    assert exported["item"]["@id"] == created["canonical_id"]
    assert exported["item"]["@type"] == "Action"
    assert exported["item"]["name"] == "Ship export endpoint"


def test_export_json_empty_returns_empty_array(auth_client):
    response = auth_client.get("/items/export")
    assert response.status_code == 200
    assert response.json() == []


def test_export_requires_authentication(client):
    response = client.get("/items/export")
    assert response.status_code == 401


def test_export_default_excludes_completed(auth_client):
    """Default export (no flags) excludes completed items."""
    # Create active item
    _create_item(auth_client, _action_item(name="Active task"))

    # Create completed item (has endTime)
    _create_item(
        auth_client,
        _action_item(name="Done task", end_time="2025-06-15T10:00:00Z"),
    )

    response = auth_client.get("/items/export")
    assert response.status_code == 200
    payload = response.json()
    names = [row["item"]["name"] for row in payload]
    assert "Active task" in names
    assert "Done task" not in names


def test_export_default_excludes_archived(auth_client):
    """Default export (no flags) excludes archived items."""
    _create_item(auth_client, _action_item(name="Active task"))

    archived = _create_item(auth_client, _action_item(name="Archived task"))
    auth_client.delete(f"/items/{archived['item_id']}")

    response = auth_client.get("/items/export")
    assert response.status_code == 200
    names = [row["item"]["name"] for row in response.json()]
    assert "Active task" in names
    assert "Archived task" not in names


def test_export_include_archived(auth_client):
    """When include_archived=true, archived items appear in export."""
    _create_item(auth_client, _action_item(name="Active"))
    archived = _create_item(auth_client, _action_item(name="To archive"))
    auth_client.delete(f"/items/{archived['item_id']}")

    response = auth_client.get("/items/export?include_archived=true")
    assert response.status_code == 200
    names = [row["item"]["name"] for row in response.json()]
    assert "Active" in names
    assert "To archive" in names


def test_export_include_completed(auth_client):
    """When include_completed=true, completed items appear in export."""
    _create_item(auth_client, _action_item(name="Active task"))
    _create_item(
        auth_client,
        _action_item(name="Done task", end_time="2025-06-15T10:00:00Z"),
    )

    response = auth_client.get("/items/export?include_completed=true")
    assert response.status_code == 200
    names = [row["item"]["name"] for row in response.json()]
    assert "Active task" in names
    assert "Done task" in names


def test_export_both_filters(auth_client):
    """Both include_archived and include_completed can be combined."""
    _create_item(auth_client, _action_item(name="Active"))
    _create_item(
        auth_client,
        _action_item(name="Completed", end_time="2025-06-15T10:00:00Z"),
    )
    archived = _create_item(auth_client, _action_item(name="Archived"))
    auth_client.delete(f"/items/{archived['item_id']}")

    response = auth_client.get("/items/export?include_archived=true&include_completed=true")
    assert response.status_code == 200
    names = [row["item"]["name"] for row in response.json()]
    assert "Active" in names
    assert "Completed" in names
    assert "Archived" in names
