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

    def test_create_digital_document(self, auth_client):
        """DigitalDocument (file drop) items accepted via CreativeWork model."""
        item = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "DigitalDocument",
            "_schemaVersion": 2,
            "name": "Quarterly Report.pdf",
            "encodingFormat": "application/pdf",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
                {
                    "@type": "PropertyValue",
                    "propertyID": "app:captureSource",
                    "value": {
                        "kind": "file",
                        "fileName": "Quarterly Report.pdf",
                        "mimeType": "application/pdf",
                    },
                },
            ],
        }
        resp = auth_client.post("/items", json={"item": item, "source": "manual"})
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["item"]["@type"] == "DigitalDocument"
        assert data["item"]["encodingFormat"] == "application/pdf"
        _assert_jsonld_aliases(data["item"], "POST /items (DigitalDocument)")

    def test_action_subtypes_round_trip(self, auth_client):
        """JSONB round-trip test: relationship fields must survive create → read cycle."""
        # Create action with all relationship fields populated
        relationship_fields = {
            "object": {
                "@type": "Thing",
                "@id": "urn:example:document:123",
                "name": "Budget Report",
            },
            "instrument": {"@type": "Thing", "@id": "urn:example:tool:excel", "name": "Excel"},
            "agent": {"@type": "Person", "@id": "urn:example:person:alice", "name": "Alice"},
            "participant": {"@type": "Person", "@id": "urn:example:person:bob", "name": "Bob"},
            "result": {"@type": "Thing", "@id": "urn:example:output:summary", "name": "Summary"},
            "location": {"@type": "Place", "@id": "urn:example:place:office", "name": "Office"},
        }

        item = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "CreateAction",
            "_schemaVersion": 2,
            "name": "Create quarterly report",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
            **relationship_fields,
        }

        # Create item
        create_resp = auth_client.post("/items", json={"item": item, "source": "manual"})
        assert create_resp.status_code == 201, f"Create failed: {create_resp.text}"
        created_data = create_resp.json()
        item_id = created_data["item_id"]

        # Read item back
        get_resp = auth_client.get(f"/items/{item_id}")
        assert get_resp.status_code == 200, f"Read failed: {get_resp.text}"
        retrieved_item = get_resp.json()["item"]

        # Verify JSON-LD aliases
        _assert_jsonld_aliases(retrieved_item, "Round-trip action")

        # Verify all relationship fields preserved exactly
        for field_name, expected_value in relationship_fields.items():
            assert field_name in retrieved_item, f"Missing relationship field: {field_name}"
            actual_value = retrieved_item[field_name]
            assert actual_value == expected_value, (
                f"Field {field_name} mismatch:\n  Expected: {expected_value}\n  Got: {actual_value}"
            )

    def test_relationship_null_vs_missing(self, auth_client):
        """Edge case: explicit null vs omitted fields must be handled consistently.

        JSON-LD allows both patterns:
        - Explicit null: {"object": null} — field present but empty
        - Omitted: {} — field not present at all

        Both should be accepted and round-trip correctly. The key requirement is
        that the system doesn't crash or reject either pattern, and retrieval
        preserves the original semantics where possible.
        """
        # Test 1: Explicit null values for relationship fields
        item_with_nulls = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "UpdateAction",
            "_schemaVersion": 2,
            "name": "Update with explicit nulls",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
            "object": None,
            "instrument": None,
            "agent": None,
        }

        # Create item with explicit nulls
        create_resp = auth_client.post("/items", json={"item": item_with_nulls, "source": "manual"})
        assert create_resp.status_code == 201, f"Create with nulls failed: {create_resp.text}"
        item_id_nulls = create_resp.json()["item_id"]

        # Read back and verify nulls are handled (either preserved or omitted consistently)
        get_resp = auth_client.get(f"/items/{item_id_nulls}")
        assert get_resp.status_code == 200, f"Read with nulls failed: {get_resp.text}"
        retrieved_nulls = get_resp.json()["item"]
        _assert_jsonld_aliases(retrieved_nulls, "Item with explicit nulls")

        # Test 2: Completely omitted relationship fields
        item_without_fields = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "UpdateAction",
            "_schemaVersion": 2,
            "name": "Update with omitted fields",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
            # No object, instrument, agent, participant, result, location
        }

        # Create item without relationship fields
        create_resp = auth_client.post(
            "/items", json={"item": item_without_fields, "source": "manual"}
        )
        assert create_resp.status_code == 201, f"Create without fields failed: {create_resp.text}"
        item_id_missing = create_resp.json()["item_id"]

        # Read back and verify omitted fields are handled
        get_resp = auth_client.get(f"/items/{item_id_missing}")
        assert get_resp.status_code == 200, f"Read without fields failed: {get_resp.text}"
        retrieved_missing = get_resp.json()["item"]
        _assert_jsonld_aliases(retrieved_missing, "Item with omitted fields")

        # Test 3: Mixed pattern - some fields present, some null, some omitted
        item_mixed = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "CreateAction",
            "_schemaVersion": 2,
            "name": "Create with mixed pattern",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
            "object": {"@type": "Thing", "@id": "urn:example:doc:456", "name": "Document"},
            "instrument": None,  # Explicit null
            # agent omitted entirely
            "participant": {
                "@type": "Person",
                "@id": "urn:example:person:charlie",
                "name": "Charlie",
            },
            "result": None,  # Explicit null
            # location omitted entirely
        }

        # Create item with mixed pattern
        create_resp = auth_client.post("/items", json={"item": item_mixed, "source": "manual"})
        assert create_resp.status_code == 201, (
            f"Create with mixed pattern failed: {create_resp.text}"
        )
        item_id_mixed = create_resp.json()["item_id"]

        # Read back and verify all patterns handled correctly
        get_resp = auth_client.get(f"/items/{item_id_mixed}")
        assert get_resp.status_code == 200, f"Read with mixed pattern failed: {get_resp.text}"
        retrieved_mixed = get_resp.json()["item"]
        _assert_jsonld_aliases(retrieved_mixed, "Item with mixed pattern")

        # Verify populated field is preserved exactly
        assert "object" in retrieved_mixed, "Populated object field should be present"
        assert retrieved_mixed["object"]["@id"] == "urn:example:doc:456"
        assert retrieved_mixed["participant"]["@id"] == "urn:example:person:charlie"

    def test_buy_action_round_trip(self, auth_client):
        """BuyAction (schema.org) must be accepted and round-trip via API."""
        item = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "BuyAction",
            "_schemaVersion": 2,
            "name": "Äpfel kaufen",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
        }
        resp = auth_client.post("/items", json={"item": item, "source": "manual"})
        assert resp.status_code == 201, f"BuyAction rejected: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["item"]["@type"] == "BuyAction"
        _assert_jsonld_aliases(data["item"], "POST /items (BuyAction)")

    def test_communicate_action_round_trip(self, auth_client):
        """CommunicateAction must be accepted and round-trip via API."""
        item = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "CommunicateAction",
            "_schemaVersion": 2,
            "name": "Bürgermeister anrufen",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
        }
        resp = auth_client.post("/items", json={"item": item, "source": "manual"})
        assert resp.status_code == 201, (
            f"CommunicateAction rejected: {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["item"]["@type"] == "CommunicateAction"
        _assert_jsonld_aliases(data["item"], "POST /items (CommunicateAction)")

    def test_review_action_round_trip(self, auth_client):
        """ReviewAction must be accepted and round-trip via API."""
        item = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "ReviewAction",
            "_schemaVersion": 2,
            "name": "Antrag prüfen",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
        }
        resp = auth_client.post("/items", json={"item": item, "source": "manual"})
        assert resp.status_code == 201, (
            f"ReviewAction rejected: {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["item"]["@type"] == "ReviewAction"
        _assert_jsonld_aliases(data["item"], "POST /items (ReviewAction)")

    def test_send_action_round_trip(self, auth_client):
        """SendAction must be accepted and round-trip via API."""
        item = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "SendAction",
            "_schemaVersion": 2,
            "name": "Bericht versenden",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
        }
        resp = auth_client.post("/items", json={"item": item, "source": "manual"})
        assert resp.status_code == 201, f"SendAction rejected: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["item"]["@type"] == "SendAction"
        _assert_jsonld_aliases(data["item"], "POST /items (SendAction)")

    def test_patch_action_to_buy_action(self, auth_client):
        """PATCH @type from generic Action to BuyAction must persist."""
        # Create a generic action
        item = {
            "@id": f"urn:app:inbox:{uuid.uuid4()}",
            "@type": "Action",
            "_schemaVersion": 2,
            "name": "Milch kaufen",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            ],
        }
        create_resp = auth_client.post("/items", json={"item": item, "source": "manual"})
        assert create_resp.status_code == 201
        item_id = create_resp.json()["item_id"]

        # Patch @type to BuyAction
        patch_resp = auth_client.patch(
            f"/items/{item_id}",
            json={"item": {"@type": "BuyAction"}},
        )
        assert patch_resp.status_code == 200, (
            f"PATCH to BuyAction failed: {patch_resp.status_code}: {patch_resp.text}"
        )
        assert patch_resp.json()["item"]["@type"] == "BuyAction"
