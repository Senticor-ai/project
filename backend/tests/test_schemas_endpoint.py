"""Tests for the /schemas API endpoint."""


def test_list_schemas(client):
    response = client.get("/schemas")
    assert response.status_code == 200
    data = response.json()
    assert "schemas" in data
    names = data["schemas"]
    assert "inbox-thing" in names
    assert "action-thing" in names
    assert "project-thing" in names
    assert "reference-thing" in names
    assert "event-thing" in names
    assert "thing-patch" in names
    assert "property-value" in names


def test_get_schema_inbox_thing(client):
    response = client.get("/schemas/inbox-thing")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/schema+json"
    schema = response.json()
    assert schema["type"] == "object"
    assert "properties" in schema
    props = schema["properties"]
    assert "@id" in props
    assert "@type" in props
    assert props["@type"]["const"] == "Thing"


def test_get_schema_action_thing(client):
    response = client.get("/schemas/action-thing")
    assert response.status_code == 200
    schema = response.json()
    props = schema["properties"]
    assert props["@type"]["const"] == "Action"
    assert "startTime" in props
    assert "endTime" in props


def test_get_schema_project_thing(client):
    response = client.get("/schemas/project-thing")
    assert response.status_code == 200
    schema = response.json()
    props = schema["properties"]
    assert props["@type"]["const"] == "Project"


def test_get_schema_event_thing(client):
    response = client.get("/schemas/event-thing")
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
