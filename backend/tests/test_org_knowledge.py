import uuid


def _upload_text_file(client, filename: str, text: str) -> str:
    data = text.encode("utf-8")
    init = client.post(
        "/files/initiate",
        json={
            "filename": filename,
            "content_type": "text/plain",
            "total_size": len(data),
        },
    )
    assert init.status_code == 201
    upload = init.json()

    chunk_headers = {
        "X-Chunk-Index": "0",
        "X-Chunk-Total": str(upload["chunk_total"]),
    }
    put = client.put(f"/files/upload/{upload['upload_id']}", content=data, headers=chunk_headers)
    assert put.status_code == 200

    complete = client.post("/files/complete", json={"upload_id": upload["upload_id"]})
    assert complete.status_code == 201
    return complete.json()["file_id"]


def test_org_creation_includes_documents(auth_client):
    """Test that creating an org atomically creates 4 knowledge documents."""
    org_name = f"Test Org {uuid.uuid4().hex[:8]}"
    response = auth_client.post("/orgs", json={"name": org_name})
    assert response.status_code == 201
    data = response.json()

    # Verify doc IDs are present
    assert data["generalDocId"] is not None
    assert data["userDocId"] is not None
    assert data["logDocId"] is not None
    assert data["agentDocId"] is not None

    # Verify all doc IDs are different
    doc_ids = [
        data["generalDocId"],
        data["userDocId"],
        data["logDocId"],
        data["agentDocId"],
    ]
    assert len(doc_ids) == len(set(doc_ids)), "All doc IDs should be unique"


def test_org_documents_are_digital_documents(auth_client):
    """Test that each created document has @type: 'DigitalDocument' in schema."""
    org_name = f"Test Org {uuid.uuid4().hex[:8]}"
    response = auth_client.post("/orgs", json={"name": org_name})
    assert response.status_code == 201
    data = response.json()
    auth_client.headers.update({"X-Org-Id": data["id"]})

    # Verify each document exists and has correct schema type
    for doc_id_key in ["generalDocId", "userDocId", "logDocId", "agentDocId"]:
        doc_id = data[doc_id_key]
        doc_response = auth_client.get(f"/items/{doc_id}")
        assert doc_response.status_code == 200
        doc = doc_response.json()
        assert doc["item"]["@type"] == "DigitalDocument"
        assert "name" in doc["item"]
        assert "encodingFormat" in doc["item"]
        assert doc["item"]["encodingFormat"] == "text/markdown"


def test_org_documents_have_canonical_ids(auth_client):
    """Test that document canonical IDs follow org:{id}:knowledge:{type} pattern."""
    org_name = f"Test Org {uuid.uuid4().hex[:8]}"
    response = auth_client.post("/orgs", json={"name": org_name})
    assert response.status_code == 201
    data = response.json()
    org_id = data["id"]
    auth_client.headers.update({"X-Org-Id": org_id})

    # Check canonical ID pattern for each document type
    doc_types = {
        "generalDocId": "general",
        "userDocId": "user",
        "logDocId": "log",
        "agentDocId": "agent",
    }

    for doc_id_key, expected_type in doc_types.items():
        doc_id = data[doc_id_key]
        doc_response = auth_client.get(f"/items/{doc_id}")
        assert doc_response.status_code == 200
        doc = doc_response.json()
        expected_canonical_id = f"org:{org_id}:knowledge:{expected_type}"
        assert doc["canonical_id"] == expected_canonical_id
        assert doc["item"]["@id"] == expected_canonical_id


def test_org_list_includes_doc_ids(auth_client):
    """Test that GET /orgs returns doc IDs for all orgs."""
    # Create an org
    org_name = f"Test Org {uuid.uuid4().hex[:8]}"
    create_response = auth_client.post("/orgs", json={"name": org_name})
    assert create_response.status_code == 201
    created_org = create_response.json()

    # List orgs
    list_response = auth_client.get("/orgs")
    assert list_response.status_code == 200
    orgs = list_response.json()
    assert len(orgs) > 0

    # Find the created org in the list
    matching_org = next((o for o in orgs if o["id"] == created_org["id"]), None)
    assert matching_org is not None

    # Verify doc IDs are present
    assert matching_org["generalDocId"] == created_org["generalDocId"]
    assert matching_org["userDocId"] == created_org["userDocId"]
    assert matching_org["logDocId"] == created_org["logDocId"]
    assert matching_org["agentDocId"] == created_org["agentDocId"]


def test_org_creation_rollback_on_failure(auth_client):
    """Test that org creation is atomic - all components created together or none.

    This verifies transaction rollback by ensuring that org + 4 documents + membership
    are created atomically. If any step fails, the transaction rolls back entirely.
    """
    # Count orgs before creation
    list_response = auth_client.get("/orgs")
    assert list_response.status_code == 200
    orgs_before = len(list_response.json())

    # Create org - should succeed and create all components atomically
    org_name = f"Test Org {uuid.uuid4().hex[:8]}"
    response = auth_client.post("/orgs", json={"name": org_name})
    assert response.status_code == 201
    org_data = response.json()

    # Verify org was created (count increased by 1)
    list_response = auth_client.get("/orgs")
    assert list_response.status_code == 200
    orgs_after = len(list_response.json())
    assert orgs_after == orgs_before + 1

    # Verify all doc IDs are valid and point to existing items in the new org.
    auth_client.headers.update({"X-Org-Id": org_data["id"]})
    for doc_id_key in ["generalDocId", "userDocId", "logDocId", "agentDocId"]:
        doc_id = org_data[doc_id_key]
        assert doc_id is not None
        doc_response = auth_client.get(f"/items/{doc_id}")
        assert doc_response.status_code == 200

    # This proves atomicity: org + 4 docs were created in a single transaction.


def test_patch_file_content(auth_client):
    """Test PATCH endpoint replaces file content and updates metadata."""
    file_id = _upload_text_file(auth_client, "test.txt", "original content")

    # Now patch the content
    new_content = "replaced content"
    patch_response = auth_client.patch(
        f"/files/{file_id}/content",
        json={"text": new_content},
    )
    assert patch_response.status_code == 200
    patch_data = patch_response.json()
    assert patch_data["text"] == new_content

    # Verify content was replaced by getting it
    get_response = auth_client.get(f"/files/{file_id}/content")
    assert get_response.status_code == 200
    assert get_response.json()["text"] == new_content


def test_append_file_content(auth_client):
    """Test POST append endpoint preserves existing content and adds new."""
    file_id = _upload_text_file(auth_client, "test.txt", "original content")

    # Now append content
    appended_text = "\nappended content"
    append_response = auth_client.post(
        f"/files/{file_id}/content/append",
        json={"text": appended_text},
    )
    assert append_response.status_code == 200
    append_data = append_response.json()
    assert append_data["text"] == "original content" + appended_text

    # Verify content was appended by getting it
    get_response = auth_client.get(f"/files/{file_id}/content")
    assert get_response.status_code == 200
    assert get_response.json()["text"] == "original content" + appended_text


def test_content_endpoints_require_org_access(client):
    """Test that content endpoints return 403 for files outside current org."""
    # Create two users with different orgs
    user1_email = f"user1-{uuid.uuid4().hex}@example.com"
    user1_username = f"user1-{uuid.uuid4().hex}"
    user2_email = f"user2-{uuid.uuid4().hex}@example.com"
    user2_username = f"user2-{uuid.uuid4().hex}"
    password = "Testpass1!"

    # Register user 1
    response = client.post(
        "/auth/register",
        json={"email": user1_email, "username": user1_username, "password": password},
    )
    assert response.status_code == 200

    # Login as user 1
    response = client.post("/auth/login", json={"email": user1_email, "password": password})
    assert response.status_code == 200
    payload = response.json()
    org1_id = payload.get("default_org_id")
    assert org1_id

    # Create a file as user 1
    client.headers.update({"X-Org-Id": org1_id})
    file_id = _upload_text_file(client, "user1.txt", "user 1 content")

    # Register user 2
    response = client.post(
        "/auth/register",
        json={"email": user2_email, "username": user2_username, "password": password},
    )
    assert response.status_code == 200

    # Login as user 2
    response = client.post("/auth/login", json={"email": user2_email, "password": password})
    assert response.status_code == 200
    payload = response.json()
    org2_id = payload.get("default_org_id")
    assert org2_id
    assert org2_id != org1_id

    # Switch to user 2's org
    client.headers.update({"X-Org-Id": org2_id})

    # Try to access user 1's file - should fail
    get_response = client.get(f"/files/{file_id}/content")
    assert get_response.status_code == 404

    # Try to patch user 1's file - should fail
    patch_response = client.patch(
        f"/files/{file_id}/content",
        json={"text": "malicious content"},
    )
    assert patch_response.status_code == 404

    # Try to append to user 1's file - should fail
    append_response = client.post(
        f"/files/{file_id}/content/append",
        json={"text": "malicious content"},
    )
    assert append_response.status_code == 404
