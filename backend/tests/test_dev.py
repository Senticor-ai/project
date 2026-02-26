import uuid

from app.config import settings
from app.db import db_conn


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


def test_mock_workspace_connection_seed_creates_connection(auth_client):
    _enable_dev_tools()
    try:
        me = auth_client.get("/auth/me")
        assert me.status_code == 200
        user_id = me.json()["id"]
        org_id = auth_client.headers["X-Org-Id"]

        response = auth_client.post(
            "/dev/mock-workspace/connection",
            json={
                "email_address": "mock-flow@example.com",
                "display_name": "Mock Flow",
                "last_history_id": 12345,
                "calendar_selected_ids": ["primary", "team"],
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        connection_id = payload["connection_id"]

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT connection_id, email_address, display_name, is_active,
                           calendar_sync_enabled, calendar_selected_ids,
                           encrypted_access_token, encrypted_refresh_token
                    FROM email_connections
                    WHERE connection_id = %s
                      AND org_id = %s
                      AND user_id = %s
                    """,
                    (connection_id, org_id, user_id),
                )
                connection = cur.fetchone()
                assert connection is not None
                assert connection["email_address"] == "mock-flow@example.com"
                assert connection["display_name"] == "Mock Flow"
                assert connection["is_active"] is True
                assert connection["calendar_sync_enabled"] is True
                assert connection["calendar_selected_ids"] == ["primary", "team"]
                assert connection["encrypted_access_token"]
                assert connection["encrypted_refresh_token"]

                cur.execute(
                    """
                    SELECT last_history_id
                    FROM email_sync_state
                    WHERE connection_id = %s
                      AND folder_name = 'INBOX'
                    """,
                    (connection_id,),
                )
                sync_state = cur.fetchone()
                assert sync_state is not None
                assert sync_state["last_history_id"] == 12345
    finally:
        _disable_dev_tools()


def test_mock_workspace_connection_returns_404_when_dev_tools_disabled(auth_client):
    _disable_dev_tools()
    try:
        response = auth_client.post("/dev/mock-workspace/connection", json={})
        assert response.status_code == 404
    finally:
        _disable_dev_tools()


def test_mock_workspace_connection_seed_is_idempotent(auth_client):
    _enable_dev_tools()
    try:
        first = auth_client.post(
            "/dev/mock-workspace/connection",
            json={
                "email_address": "mock-repeat@example.com",
                "last_history_id": 10000,
                "calendar_selected_ids": ["primary"],
            },
        )
        assert first.status_code == 200
        first_id = first.json()["connection_id"]

        second = auth_client.post(
            "/dev/mock-workspace/connection",
            json={
                "email_address": "mock-repeat@example.com",
                "last_history_id": 20000,
                "calendar_selected_ids": ["team"],
            },
        )
        assert second.status_code == 200
        second_id = second.json()["connection_id"]
        assert second_id == first_id

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT calendar_selected_ids
                    FROM email_connections
                    WHERE connection_id = %s
                    """,
                    (first_id,),
                )
                connection = cur.fetchone()
                assert connection is not None
                assert connection["calendar_selected_ids"] == ["team"]

                cur.execute(
                    """
                    SELECT last_history_id
                    FROM email_sync_state
                    WHERE connection_id = %s
                      AND folder_name = 'INBOX'
                    """,
                    (first_id,),
                )
                sync_state = cur.fetchone()
                assert sync_state is not None
                assert sync_state["last_history_id"] == 20000
    finally:
        _disable_dev_tools()
