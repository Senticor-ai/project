import uuid


def test_action_requires_bucket(auth_client):
    payload = {
        "thing": {
            "@id": f"urn:app:action:{uuid.uuid4()}",
            "@type": "Action",
            "_schemaVersion": 2,
            "name": "Missing bucket",
            "additionalProperty": [],
        },
        "source": "manual",
    }
    response = auth_client.post("/things", json=payload)
    assert response.status_code == 422


def test_patch_deep_merge_and_archive(auth_client):
    thing = {
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
        "/things", json={"thing": thing, "source": "manual"},
    )
    assert response.status_code == 201
    thing_id = response.json()["thing_id"]

    patch = {"thing": {"meta": {"nested": {"c": 3}}, "name": "Updated name"}}
    response = auth_client.patch(f"/things/{thing_id}", json=patch)
    assert response.status_code == 200
    updated = response.json()
    assert updated["thing"]["name"] == "Updated name"
    assert updated["thing"]["meta"]["nested"] == {"a": 1, "b": 2, "c": 3}

    response = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"@id": "urn:app:action:other"}},
    )
    assert response.status_code == 400

    response = auth_client.delete(f"/things/{thing_id}")
    assert response.status_code == 200
    assert response.json()["archived_at"]

    response = auth_client.get("/things")
    assert response.status_code == 200
    assert all(item["thing_id"] != thing_id for item in response.json())

    response = auth_client.get(f"/things/{thing_id}")
    assert response.status_code == 404


def test_patch_merges_additional_property_by_property_id(auth_client):
    thing = {
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
        "/things", json={"thing": thing, "source": "manual"},
    )
    assert response.status_code == 201
    thing_id = response.json()["thing_id"]

    patch = {
        "thing": {
            "additionalProperty": [
                {
                    "@type": "PropertyValue",
                    "propertyID": "app:isFocused",
                    "value": True,
                },
            ],
        },
    }
    response = auth_client.patch(f"/things/{thing_id}", json=patch)
    assert response.status_code == 200

    props = response.json()["thing"]["additionalProperty"]
    by_id = {p["propertyID"]: p["value"] for p in props}
    assert by_id["app:bucket"] == "next"
    assert by_id["app:isFocused"] is True


# ---------------------------------------------------------------------------
# Rename provenance
# ---------------------------------------------------------------------------

def _props_by_id(thing_json: dict) -> dict:
    return {p["propertyID"]: p["value"] for p in thing_json["additionalProperty"]}


def _make_action(name: str | None = None) -> dict:
    thing: dict = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            {"@type": "PropertyValue", "propertyID": "app:provenanceHistory", "value": []},
        ],
    }
    if name is not None:
        thing["name"] = name
    return thing


def test_patch_name_change_creates_provenance(auth_client):
    """When name changes via PATCH, app:nameProvenance and history are updated."""
    thing = _make_action("Original name")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": "New name"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

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
    thing = _make_action("Same name")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": "Same name"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    assert "app:nameProvenance" not in props
    history = props.get("app:provenanceHistory", [])
    assert all(e["action"] != "renamed" for e in history)


def test_patch_name_from_none_creates_provenance(auth_client):
    """Setting name for the first time (was None) creates provenance."""
    thing = _make_action()  # no name
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": "First name"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    assert props["app:nameProvenance"]["setBy"] == "user"
    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 1
    assert renamed[0]["from"] == ""
    assert renamed[0]["to"] == "First name"


def test_patch_name_with_ai_source(auth_client):
    """AI source is reflected in provenance."""
    thing = _make_action("Raw text")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": "AI title"}, "source": "ai-clarify"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    assert props["app:nameProvenance"]["setBy"] == "ai"
    assert props["app:nameProvenance"]["source"] == "AI suggested from rawCapture"


def test_patch_name_with_custom_name_source(auth_client):
    """Explicit name_source hint overrides the derived source."""
    thing = _make_action("Old")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={
            "thing": {"name": "Custom"},
            "source": "manual",
            "name_source": "user renamed in EditableTitle",
        },
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    assert props["app:nameProvenance"]["source"] == "user renamed in EditableTitle"


def test_patch_name_multiple_renames_appends_history(auth_client):
    """Multiple renames accumulate in provenanceHistory."""
    thing = _make_action("V1")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": "V2"}, "source": "manual"},
    )
    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": "V3"}, "source": "ai-clarify"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 2
    assert renamed[0]["from"] == "V1"
    assert renamed[0]["to"] == "V2"
    assert renamed[1]["from"] == "V2"
    assert renamed[1]["to"] == "V3"


def test_patch_name_cleared_to_none_creates_provenance(auth_client):
    """Clearing name (set to None) is a rename and gets provenance."""
    thing = _make_action("Will be cleared")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": None}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    assert props["app:nameProvenance"]["setBy"] == "user"
    history = props["app:provenanceHistory"]
    renamed = [e for e in history if e["action"] == "renamed"]
    assert len(renamed) == 1
    assert renamed[0]["from"] == "Will be cleared"
    assert renamed[0]["to"] == ""


def test_patch_name_without_preexisting_provenance_history(auth_client):
    """Rename works even when thing has no app:provenanceHistory yet."""
    thing = {
        "@id": f"urn:app:action:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "name": "No history",
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
        ],
    }
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"name": "Now has history"}, "source": "manual"},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    assert "app:nameProvenance" in props
    history = props["app:provenanceHistory"]
    assert len(history) == 1
    assert history[0]["action"] == "renamed"


def test_patch_name_with_other_property_changes(auth_client):
    """Rename provenance works alongside other additionalProperty changes."""
    thing = _make_action("Original")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={
            "thing": {
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
    updated = resp.json()["thing"]
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
    thing = _make_action("Untouched name")
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code == 201
    thing_id = resp.json()["thing_id"]

    resp = auth_client.patch(
        f"/things/{thing_id}",
        json={"thing": {"description": "Just a description change"}},
    )
    assert resp.status_code == 200
    props = _props_by_id(resp.json()["thing"])

    assert "app:nameProvenance" not in props
    history = props.get("app:provenanceHistory", [])
    assert all(e["action"] != "renamed" for e in history)
