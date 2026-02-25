"""Tests for PATCH /items/{id}/file-content and POST /items/{id}/append-content."""

import uuid


def _create_digital_doc(auth_client, *, name: str = "Test Doc", text: str = "") -> str:
    """Create a DigitalDocument item and return its item_id."""
    item = {
        "@id": f"urn:app:doc:{uuid.uuid4()}",
        "@type": "DigitalDocument",
        "_schemaVersion": 2,
        "name": name,
        "encodingFormat": "text/markdown",
        "text": text,
        "additionalProperty": [
            {
                "@type": "PropertyValue",
                "propertyID": "app:bucket",
                "value": "reference",
            },
        ],
    }
    response = auth_client.post("/items", json={"item": item, "source": "system"})
    assert response.status_code == 201
    return response.json()["item_id"]


class TestPatchFileContent:
    def test_replaces_text_content(self, auth_client):
        item_id = _create_digital_doc(auth_client, text="Initial content")

        response = auth_client.patch(
            f"/items/{item_id}/file-content",
            json={"text": "Updated content"},
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}

        content_response = auth_client.get(f"/items/{item_id}/content")
        assert content_response.status_code == 200
        assert content_response.json()["file_content"] == "Updated content"

    def test_replaces_empty_text(self, auth_client):
        item_id = _create_digital_doc(auth_client, text="")

        response = auth_client.patch(
            f"/items/{item_id}/file-content",
            json={"text": "# Hello\n\nNew document"},
        )
        assert response.status_code == 200

        content_response = auth_client.get(f"/items/{item_id}/content")
        assert content_response.json()["file_content"] == "# Hello\n\nNew document"

    def test_returns_404_for_unknown_item(self, auth_client):
        response = auth_client.patch(
            f"/items/{uuid.uuid4()}/file-content",
            json={"text": "content"},
        )
        assert response.status_code == 404

    def test_requires_text_field(self, auth_client):
        item_id = _create_digital_doc(auth_client)
        response = auth_client.patch(f"/items/{item_id}/file-content", json={})
        assert response.status_code == 422


class TestAppendContent:
    def test_appends_entry_to_empty_doc(self, auth_client):
        item_id = _create_digital_doc(auth_client, text="")

        response = auth_client.post(
            f"/items/{item_id}/append-content",
            json={"text": "First log entry"},
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}

        content_response = auth_client.get(f"/items/{item_id}/content")
        content = content_response.json()["file_content"]
        assert content is not None
        assert "First log entry" in content
        assert "—" in content  # timestamp separator

    def test_appends_multiple_entries(self, auth_client):
        item_id = _create_digital_doc(auth_client, text="# Log")

        auth_client.post(
            f"/items/{item_id}/append-content",
            json={"text": "Entry one"},
        )
        auth_client.post(
            f"/items/{item_id}/append-content",
            json={"text": "Entry two"},
        )

        content_response = auth_client.get(f"/items/{item_id}/content")
        content = content_response.json()["file_content"]
        assert "Entry one" in content
        assert "Entry two" in content

    def test_returns_404_for_unknown_item(self, auth_client):
        response = auth_client.post(
            f"/items/{uuid.uuid4()}/append-content",
            json={"text": "entry"},
        )
        assert response.status_code == 404

    def test_requires_text_field(self, auth_client):
        item_id = _create_digital_doc(auth_client)
        response = auth_client.post(f"/items/{item_id}/append-content", json={})
        assert response.status_code == 422


class TestGetItemContent:
    def test_returns_text_field_when_no_file_attached(self, auth_client):
        item_id = _create_digital_doc(auth_client, text="# Org Notes\n\nSome content here.")

        response = auth_client.get(f"/items/{item_id}/content")
        assert response.status_code == 200
        data = response.json()
        assert data["file_content"] == "# Org Notes\n\nSome content here."
        assert data["item_id"] == item_id

    def test_returns_empty_string_for_empty_text(self, auth_client):
        item_id = _create_digital_doc(auth_client, text="")

        response = auth_client.get(f"/items/{item_id}/content")
        assert response.status_code == 200
        assert response.json()["file_content"] == ""
