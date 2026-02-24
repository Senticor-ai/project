import uuid


def test_request_and_trail_ids_echo_back_when_provided(client):
    response = client.get(
        "/health",
        headers={
            "X-Request-ID": "req-123",
            "X-Trail-ID": "trail-123",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == "req-123"
    assert response.headers.get("X-Trail-ID") == "trail-123"


def test_request_and_trail_ids_are_generated_when_missing(client):
    response = client.get("/health")

    assert response.status_code == 200
    request_id = response.headers.get("X-Request-ID")
    trail_id = response.headers.get("X-Trail-ID")
    assert request_id
    assert trail_id
    uuid.UUID(request_id)
    uuid.UUID(trail_id)
