"""Tests for the /schemas API endpoint."""

from app.models import ACTION_SUBTYPES

EXPECTED_ACTION_TYPES = set(ACTION_SUBTYPES)


def test_list_schemas(client):
    response = client.get("/schemas")
    assert response.status_code == 200
    data = response.json()
    assert "schemas" in data
    names = data["schemas"]
    assert "inbox-item" in names
    assert "action-item" in names
    assert "project-item" in names
    assert "reference-item" in names
    assert "event-item" in names
    assert "item-patch" in names
    assert "property-value" in names


def test_get_schema_inbox_item(client):
    """inbox-item is a deprecated alias that now returns the Action schema."""
    response = client.get("/schemas/inbox-item")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/schema+json"
    schema = response.json()
    assert schema["type"] == "object"
    assert "properties" in schema
    props = schema["properties"]
    assert "@id" in props
    assert "@type" in props
    assert set(props["@type"]["enum"]) == EXPECTED_ACTION_TYPES


def test_get_schema_action_item(client):
    response = client.get("/schemas/action-item")
    assert response.status_code == 200
    schema = response.json()
    props = schema["properties"]
    assert set(props["@type"]["enum"]) == EXPECTED_ACTION_TYPES
    assert "startTime" in props
    assert "endTime" in props


def test_get_schema_project_item(client):
    response = client.get("/schemas/project-item")
    assert response.status_code == 200
    schema = response.json()
    props = schema["properties"]
    assert props["@type"]["const"] == "Project"


def test_get_schema_event_item(client):
    response = client.get("/schemas/event-item")
    assert response.status_code == 200
    schema = response.json()
    props = schema["properties"]
    assert props["@type"]["const"] == "Event"
    assert "startDate" in props
    assert "endDate" in props
    assert "duration" in props
    assert "location" in props


def test_get_schema_not_found(client):
    response = client.get("/schemas/nonexistent")
    assert response.status_code == 404
    assert "nonexistent" in response.json()["detail"]
