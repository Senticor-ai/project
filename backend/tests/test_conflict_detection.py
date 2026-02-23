"""Tests for write conflict prevention via If-Match / ETag on PATCH."""

import uuid


def _create_item(auth_client):
    """Create a test item and return (item_id, etag)."""
    payload = {
        "item": {
            "@id": f"urn:app:action:{uuid.uuid4()}",
            "@type": "Action",
            "_schemaVersion": 2,
            "name": "Conflict test item",
            "additionalProperty": [
                {
                    "@type": "PropertyValue",
                    "propertyID": "app:bucket",
                    "value": "next",
                },
            ],
        },
        "source": "manual",
    }
    response = auth_client.post("/items", json=payload)
    assert response.status_code == 201
    etag = response.headers.get("ETag")
    assert etag, "POST /items should return an ETag header"
    return response.json()["item_id"], etag


def test_patch_with_correct_if_match_succeeds(auth_client):
    item_id, etag = _create_item(auth_client)

    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "Updated via If-Match"}},
        headers={"If-Match": etag},
    )
    assert response.status_code == 200
    assert response.json()["item"]["name"] == "Updated via If-Match"


def test_patch_with_stale_if_match_returns_412(auth_client):
    item_id, original_etag = _create_item(auth_client)

    # First update — changes the ETag
    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "First update"}},
    )
    assert response.status_code == 200

    # Second update with the ORIGINAL (now stale) ETag — should fail
    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "Stale update"}},
        headers={"If-Match": original_etag},
    )
    assert response.status_code == 412
    detail = response.json()["detail"]
    assert detail["code"] == "PRECONDITION_FAILED"


def test_patch_without_if_match_succeeds(auth_client):
    item_id, _etag = _create_item(auth_client)

    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "No If-Match header"}},
    )
    assert response.status_code == 200


def test_response_includes_etag_header(auth_client):
    item_id, _etag = _create_item(auth_client)

    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "Check ETag header"}},
    )
    assert response.status_code == 200
    etag = response.headers.get("ETag")
    assert etag, "PATCH response should include ETag header"
    assert etag.startswith('"') and etag.endswith('"'), "ETag should be quoted"


def test_correct_etag_after_update_allows_next_update(auth_client):
    item_id, etag = _create_item(auth_client)

    # First update with correct ETag
    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "First update"}},
        headers={"If-Match": etag},
    )
    assert response.status_code == 200
    new_etag = response.headers.get("ETag")

    # Second update with the NEW ETag from the first response
    response = auth_client.patch(
        f"/items/{item_id}",
        json={"item": {"name": "Second update"}},
        headers={"If-Match": new_etag},
    )
    assert response.status_code == 200
    assert response.json()["item"]["name"] == "Second update"
