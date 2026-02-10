"""Contract tests: every endpoint that returns ItemJsonLd must serialise
with JSON-LD aliases (@id, @type, _schemaVersion) — not Python field names.

Regression guard for the sync endpoint bug where ``model_dump()`` was called
without ``by_alias=True``, causing the frontend to receive ``id`` / ``type``
instead of ``@id`` / ``@type``.
"""

import uuid

JSONLD_KEYS = {"@id", "@type", "_schemaVersion"}
PYTHON_KEYS = {"id", "type", "schemaVersion"}

INBOX_ITEM = {
    "@type": "Action",
    "_schemaVersion": 2,
    "startTime": None,
    "endTime": None,
    "additionalProperty": [
        {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
        {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "alias test"},
    ],
}


def _create_item(auth_client) -> dict:
    item = {**INBOX_ITEM, "@id": f"urn:app:inbox:{uuid.uuid4()}"}
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    return resp.json()


def _assert_jsonld_aliases(item_payload: dict, label: str) -> None:
    """Assert the item dict uses JSON-LD aliases, not Python field names."""
    present = set(item_payload.keys())
    missing = JSONLD_KEYS - present
    assert not missing, f"{label}: missing JSON-LD keys {missing} (got {sorted(present)})"
    leaked = PYTHON_KEYS & present - JSONLD_KEYS
    assert not leaked, f"{label}: leaked Python field names {leaked}"

    # Also check nested PropertyValue entries use @type alias
    for pv in item_payload.get("additionalProperty", []):
        assert "@type" in pv, f"{label}: PropertyValue missing @type alias"


class TestJsonLdAliases:
    """All item-returning endpoints must use JSON-LD aliases."""

    def test_create_uses_aliases(self, auth_client):
        data = _create_item(auth_client)
        _assert_jsonld_aliases(data["item"], "POST /items")

    def test_get_uses_aliases(self, auth_client):
        created = _create_item(auth_client)
        resp = auth_client.get(f"/items/{created['item_id']}")
        assert resp.status_code == 200
        _assert_jsonld_aliases(resp.json()["item"], "GET /items/:id")

    def test_list_uses_aliases(self, auth_client):
        _create_item(auth_client)
        resp = auth_client.get("/items")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) > 0
        _assert_jsonld_aliases(items[0]["item"], "GET /items")

    def test_sync_uses_aliases(self, auth_client):
        _create_item(auth_client)
        resp = auth_client.get("/items/sync")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) > 0
        _assert_jsonld_aliases(items[0]["item"], "GET /items/sync")

    def test_patch_uses_aliases(self, auth_client):
        created = _create_item(auth_client)
        resp = auth_client.patch(
            f"/items/{created['item_id']}",
            json={"item": {"name": "updated"}},
        )
        assert resp.status_code == 200
        _assert_jsonld_aliases(resp.json()["item"], "PATCH /items/:id")
