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
