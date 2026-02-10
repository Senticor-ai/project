"""Contract tests: every endpoint that returns ThingJsonLd must serialise
with JSON-LD aliases (@id, @type, _schemaVersion) — not Python field names.

Regression guard for the sync endpoint bug where ``model_dump()`` was called
without ``by_alias=True``, causing the frontend to receive ``id`` / ``type``
instead of ``@id`` / ``@type``.
"""

import uuid

JSONLD_KEYS = {"@id", "@type", "_schemaVersion"}
PYTHON_KEYS = {"id", "type", "schemaVersion"}

INBOX_THING = {
    "@type": "Action",
    "_schemaVersion": 2,
    "startTime": None,
    "endTime": None,
    "additionalProperty": [
        {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
        {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "alias test"},
    ],
}


def _create_thing(auth_client) -> dict:
    thing = {**INBOX_THING, "@id": f"urn:app:inbox:{uuid.uuid4()}"}
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    return resp.json()


def _assert_jsonld_aliases(thing_payload: dict, label: str) -> None:
    """Assert the thing dict uses JSON-LD aliases, not Python field names."""
    present = set(thing_payload.keys())
    missing = JSONLD_KEYS - present
    assert not missing, f"{label}: missing JSON-LD keys {missing} (got {sorted(present)})"
    leaked = PYTHON_KEYS & present - JSONLD_KEYS
    assert not leaked, f"{label}: leaked Python field names {leaked}"

    # Also check nested PropertyValue entries use @type alias
    for pv in thing_payload.get("additionalProperty", []):
        assert "@type" in pv, f"{label}: PropertyValue missing @type alias"


class TestJsonLdAliases:
    """All thing-returning endpoints must use JSON-LD aliases."""

    def test_create_uses_aliases(self, auth_client):
        data = _create_thing(auth_client)
        _assert_jsonld_aliases(data["thing"], "POST /things")

    def test_get_uses_aliases(self, auth_client):
        created = _create_thing(auth_client)
        resp = auth_client.get(f"/things/{created['thing_id']}")
        assert resp.status_code == 200
        _assert_jsonld_aliases(resp.json()["thing"], "GET /things/:id")

    def test_list_uses_aliases(self, auth_client):
        _create_thing(auth_client)
        resp = auth_client.get("/things")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) > 0
        _assert_jsonld_aliases(items[0]["thing"], "GET /things")

    def test_sync_uses_aliases(self, auth_client):
        _create_thing(auth_client)
        resp = auth_client.get("/things/sync")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) > 0
        _assert_jsonld_aliases(items[0]["thing"], "GET /things/sync")

    def test_patch_uses_aliases(self, auth_client):
        created = _create_thing(auth_client)
        resp = auth_client.patch(
            f"/things/{created['thing_id']}",
            json={"thing": {"name": "updated"}},
        )
        assert resp.status_code == 200
        _assert_jsonld_aliases(resp.json()["thing"], "PATCH /things/:id")
