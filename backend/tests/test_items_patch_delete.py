import uuid


def test_action_requires_bucket(auth_client):
    payload = {
        "item": {
            "@id": f"urn:app:action:{uuid.uuid4()}",
            "@type": "Action",
            "_schemaVersion": 2,
            "name": "Missing bucket",
            "additionalProperty": [],
        },
        "source": "manual",
    }
    response = auth_client.post("/items", json=payload)
    assert response.status_code == 422


def test_patch_deep_merge_and_archive(auth_client):
    item = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": "Deep merge task",
        "additionalProperty": [
            {
                "@type": "PropertyValue",
                "propertyID": "app:bucket",
                "value": "next",
            },
        ],
        "meta": {
            "level": 1,
            "nested": {"a": 1, "b": 2},
        },
    }
    response = auth_client.post(
        "/items",
        json={"item": item, "source": "manual"},
    )
    assert response.status_code == 201
    item_id = response.json()["item_id"]

    patch = {"item": {"meta": {"nested": {"c": 3}}, "name": "Updated name"}}
    response = auth_client.patch(f"/items/{item_id}", json=patch)
    assert response.status_code == 200
    updated = response.json()
    assert updated["item"]["name"] == "Updated name"
    assert updated["item"]["meta"]["nested"] == {"a": 1, "b": 2, "c": 3}

    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"@id": "urn:app:action:other"}},
    )
    assert response.status_code == 400

    response = auth_client.delete(f"/items/{item_id}")
    assert response.status_code == 200
    assert response.json()["archived_at"]

    response = auth_client.get("/items")
    assert response.status_code == 200
    assert all(row["item_id"] != item_id for row in response.json())

    response = auth_client.get(f"/items/{item_id}")
    assert response.status_code == 404


def test_patch_merges_additional_property_by_property_id(auth_client):
    item = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": "Merge test",
        "additionalProperty": [
            {
                "@type": "PropertyValue",
                "propertyID": "app:bucket",
                "value": "next",
            },
            {
                "@type": "PropertyValue",
                "propertyID": "app:isFocused",
                "value": False,
            },
        ],
    }
    response = auth_client.post(
        "/items",
        json={"item": item, "source": "manual"},
    )
    assert response.status_code == 201
    item_id = response.json()["item_id"]

    patch = {
        "item": {
            "additionalProperty": [
                {
                    "@type": "PropertyValue",
                    "propertyID": "app:isFocused",
                    "value": True,
                },
            ],
        },
    }
    response = auth_client.patch(f"/items/{item_id}", json=patch)
    assert response.status_code == 200

    props = response.json()["item"]["additionalProperty"]
    by_id = {p["propertyID"]: p["value"] for p in props}
    assert by_id["app:bucket"] == "next"
    assert by_id["app:isFocused"] is True


def test_completed_item_is_immutable(auth_client):
    item = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": "Already done",
        "endTime": "2026-02-20T12:00:00Z",
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "completed"},
            {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "Already done"},
        ],
    }
    response = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert response.status_code == 201
    item_id = response.json()["item_id"]

    patch = {"item": {"description": "should fail"}}
    response = auth_client.patch(f"/items/{item_id}", json=patch)
    assert response.status_code == 422


def test_inbox_cannot_triage_to_completed(auth_client):
    item = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": "Inbox task",
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "Inbox task"},
        ],
    }
    response = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert response.status_code == 201
    item_id = response.json()["item_id"]

    patch = {
        "item": {
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "completed"}
            ]
        }
    }
    response = auth_client.patch(f"/items/{item_id}", json=patch)
    assert response.status_code == 422


def test_inbox_patch_without_bucket_change_is_allowed(auth_client):
    item = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": "Inbox task",
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "Inbox task"},
        ],
    }
    response = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert response.status_code == 201
    item_id = response.json()["item_id"]

    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "Inbox task updated"}},
    )
    assert response.status_code == 200
    assert response.json()["item"]["name"] == "Inbox task updated"

# ---------------------------------------------------------------------------
# Rename provenance
# ---------------------------------------------------------------------------


def _props_by_id(item_json: dict) -> dict:
    return {p["propertyID"]: p["value"] for p in item_json["additionalProperty"]}


def _make_action(name: str | None = None) -> dict:
    item: dict = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            {"@type": "PropertyValue", "propertyID": "app:provenanceHistory", "value": []},
        ],
    }
    if name is not None:
        item["name"] = name
    return item


def test_patch_name_change_creates_provenance(auth_client):
    """When name changes via PATCH, app:nameProvenance and history are updated."""
    item = _make_action("Original name")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "New name"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    name_prov = props["app:nameProvenance"]
    assert name_prov["setBy"] == "user"
    assert name_prov["source"] == "user edited"
    assert "setAt" in name_prov

    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 1
    assert renamed[0]["from"] == "Original name"
    assert renamed[0]["to"] == "New name"


def test_patch_same_name_no_provenance(auth_client):
    """When name is unchanged, no rename provenance is created."""
    item = _make_action("Same name")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "Same name"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    assert "app:nameProvenance" not in props
    history = props.get("app:provenanceHistory", [])
    assert all(e["action"] != "renamed" for e in history)


def test_patch_name_from_none_creates_provenance(auth_client):
    """Setting name for the first time (was None) creates provenance."""
    item = _make_action()  # no name
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "First name"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    assert props["app:nameProvenance"]["setBy"] == "user"
    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 1
    assert renamed[0]["from"] == ""
    assert renamed[0]["to"] == "First name"


def test_patch_name_with_ai_source(auth_client):
    """AI source is reflected in provenance."""
    item = _make_action("Raw text")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "AI title"}, "source": "ai-clarify"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    assert props["app:nameProvenance"]["setBy"] == "ai"
    assert props["app:nameProvenance"]["source"] == "AI suggested from rawCapture"


def test_patch_name_with_custom_name_source(auth_client):
    """Explicit name_source hint overrides the derived source."""
    item = _make_action("Old")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={
            "item": {"name": "Custom"},
            "source": "manual",
            "name_source": "user renamed in EditableTitle",
        },
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    assert props["app:nameProvenance"]["source"] == "user renamed in EditableTitle"


def test_patch_name_multiple_renames_appends_history(auth_client):
    """Multiple renames accumulate in provenanceHistory."""
    item = _make_action("V1")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "V2"}, "source": "manual"},
    )
    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "V3"}, "source": "ai-clarify"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 2
    assert renamed[0]["from"] == "V1"
    assert renamed[0]["to"] == "V2"
    assert renamed[1]["from"] == "V2"
    assert renamed[1]["to"] == "V3"


def test_patch_name_cleared_to_none_creates_provenance(auth_client):
    """Clearing name (set to None) is a rename and gets provenance."""
    item = _make_action("Will be cleared")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": None}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    assert props["app:nameProvenance"]["setBy"] == "user"
    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 1
    assert renamed[0]["from"] == "Will be cleared"
    assert renamed[0]["to"] == ""


def test_patch_name_without_preexisting_provenance_history(auth_client):
    """Rename works even when item has no app:provenanceHistory yet."""
    item = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": "No history",
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
        ],
    }
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "Now has history"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    assert "app:nameProvenance" in props
    history = props["app:provenanceHistory"]
    assert len(history) == 1
    assert history[0]["action"] == "renamed"


def test_patch_name_with_other_property_changes(auth_client):
    """Rename provenance works alongside other additionalProperty changes."""
    item = _make_action("Original")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={
            "item": {
                "name": "Renamed",
                "description": "Added a description",
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:isFocused", "value": True},
                ],
            },
            "source": "manual",
        },
    )
    assert resp.status_code == 200
    updated = resp.json()["item"]
    props = _props_by_id(updated)

    assert updated["name"] == "Renamed"
    assert updated["description"] == "Added a description"
    assert props["app:isFocused"] is True
    assert props["app:bucket"] == "next"
    assert props["app:nameProvenance"]["setBy"] == "user"
    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 1


def test_patch_no_name_field_skips_provenance(auth_client):
    """PATCH without name field does not create rename provenance."""
    item = _make_action("Untouched name")
    resp = auth_client.post("/items", json={"item": item, "source": "manual"})
    assert resp.status_code == 201
    item_id = resp.json()["item_id"]

    resp = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"description": "Just a description change"}},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["item"])

    assert "app:nameProvenance" not in props
    history = props.get("app:provenanceHistory", [])
    assert all(e["action"] != "renamed" for e in history)
