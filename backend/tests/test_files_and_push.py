import hashlib


def test_file_meta_and_idempotent_upload(auth_client):
    data = b"hello world"
    payload = {
        "filename": "hello.txt",
        "content_type": "text/plain",
        "total_size": len(data),
    }

    init_headers = {"Idempotency-Key": "upload-init-1"}
    response = auth_client.post("/files/initiate", json=payload, headers=init_headers)
    assert response.status_code == 201
    first_init = response.json()

    response = auth_client.post("/files/initiate", json=payload, headers=init_headers)
    assert response.status_code == 201
    second_init = response.json()
    assert first_init["upload_id"] == second_init["upload_id"]

    upload_id = first_init["upload_id"]
    chunk_total = first_init["chunk_total"]
    upload_headers = {
        "X-Chunk-Index": "0",
        "X-Chunk-Total": str(chunk_total),
    }

    response = auth_client.put(
        f"/files/upload/{upload_id}",
        content=data,
        headers=upload_headers,
    )
    assert response.status_code == 200

    complete_headers = {"Idempotency-Key": "upload-complete-1"}
    response = auth_client.post(
        "/files/complete",
        json={"upload_id": upload_id},
        headers=complete_headers,
    )
    assert response.status_code == 201
    first_complete = response.json()

    response = auth_client.post(
        "/files/complete",
        json={"upload_id": upload_id},
        headers=complete_headers,
    )
    assert response.status_code == 200
    second_complete = response.json()
    assert first_complete["file_id"] == second_complete["file_id"]

    file_id = first_complete["file_id"]
    response = auth_client.get(f"/files/{file_id}/meta")
    assert response.status_code == 200
    meta = response.json()

    assert meta["original_name"] == "hello.txt"
    assert meta["size_bytes"] == len(data)
    assert meta["sha256"] == hashlib.sha256(data).hexdigest()
    assert meta["download_url"].endswith(file_id)

    etag = response.headers.get("ETag")
    assert etag == f'"{meta["sha256"]}"'


def test_push_test_endpoint(auth_client, monkeypatch):
    subscription = {
        "endpoint": "https://example.com/push",
        "keys": {"p256dh": "key", "auth": "auth"},
    }

    response = auth_client.post("/push/subscribe", json={"subscription": subscription})
    assert response.status_code == 200

    calls = []

    def fake_send(sub, payload):
        calls.append((sub, payload))

    import app.routes.push as push_routes

    monkeypatch.setattr(push_routes, "_send_push", fake_send)

    response = auth_client.post(
        "/push/test",
        json={"title": "Test", "body": "Ping", "url": "https://example.com"},
    )
    assert response.status_code == 200
    assert response.json()["sent"] == 1
    assert len(calls) == 1
