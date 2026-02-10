import uuid

from app.config import settings


def _enable_dev_tools():
    object.__setattr__(settings, "dev_tools_enabled", True)


def _disable_dev_tools():
    object.__setattr__(settings, "dev_tools_enabled", False)


def test_flush_returns_404_when_dev_tools_disabled(auth_client):
    _disable_dev_tools()
    try:
        response = auth_client.post("/dev/flush")
        assert response.status_code == 404
    finally:
        _disable_dev_tools()


def test_flush_returns_401_without_auth(client):
    _enable_dev_tools()
    try:
        response = client.post("/dev/flush")
        assert response.status_code == 401
    finally:
        _disable_dev_tools()


def test_flush_deletes_all_items(auth_client):
    _enable_dev_tools()
    try:
        # Create some items first
        for i in range(3):
            item = {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": f"Flush test item {i}",
                "additionalProperty": [
                    {
                        "@type": "PropertyValue",
                        "propertyID": "app:bucket",
                        "value": "inbox",
                    },
                ],
            }
            response = auth_client.post(
                "/items",
                json={"item": item, "source": "manual"},
            )
            assert response.status_code == 201

        # Verify items exist
        response = auth_client.get("/items")
        assert response.status_code == 200
        assert len(response.json()) >= 3

        # Flush
        response = auth_client.post("/dev/flush")
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["deleted"]["items"] >= 3

        # Verify items are gone (hard deleted, not archived)
        response = auth_client.get("/items")
        assert response.status_code == 200
        assert len(response.json()) == 0
    finally:
        _disable_dev_tools()


def test_flush_preserves_user_and_session(auth_client):
    _enable_dev_tools()
    try:
        # Create an item
        item = {
            "@id": f"urn:app:action:{uuid.uuid4()}",
            "@type": "Action",
            "_schemaVersion": 2,
            "name": "Will be flushed",
            "additionalProperty": [
                {
                    "@type": "PropertyValue",
                    "propertyID": "app:bucket",
                    "value": "inbox",
                },
            ],
        }
        auth_client.post(
            "/items",
            json={"item": item, "source": "manual"},
        )

        # Flush
        response = auth_client.post("/dev/flush")
        assert response.status_code == 200

        # User session still works
        response = auth_client.get("/auth/me")
        assert response.status_code == 200
        assert response.json()["email"]
    finally:
        _disable_dev_tools()
