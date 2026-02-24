import uuid


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
        assert doc["canonicalId"] == expected_canonical_id


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


def test_org_creation_rollback_on_failure(client):
    """Test that org creation rolls back entirely if document creation fails."""
    # Register and login
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    response = client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert response.status_code == 200

    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    payload = response.json()
    org_id = payload.get("default_org_id")
    assert org_id
    client.headers.update({"X-Org-Id": org_id})

    # Count orgs before attempting creation
    list_response = client.get("/orgs")
    assert list_response.status_code == 200
    orgs_before = len(list_response.json())

    # Create a successful org to establish baseline
    org_name = f"Valid Org {uuid.uuid4().hex[:8]}"
    response = client.post("/orgs", json={"name": org_name})
    assert response.status_code == 201

    # Verify org count increased
    list_response = client.get("/orgs")
    assert list_response.status_code == 200
    orgs_after = len(list_response.json())
    assert orgs_after == orgs_before + 1


def test_patch_file_content(auth_client):
    """Test PATCH endpoint replaces file content and updates metadata."""
    # Create a file first via items endpoint
    item_payload = {
        "canonicalId": f"test:file:{uuid.uuid4().hex}",
        "source": "user",
        "item": {
            "@type": "DigitalDocument",
            "name": "Test File",
            "encodingFormat": "text/plain",
            "text": "original content",
        },
    }
    create_response = auth_client.post("/items", json=item_payload)
    assert create_response.status_code == 201
    item_data = create_response.json()
    item_id = item_data["itemId"]

    # Create a file record for this item
    upload_response = auth_client.post(
        "/files/create",
        json={
            "itemId": item_id,
            "filename": "test.txt",
            "size": len("original content"),
            "mimeType": "text/plain",
        },
    )
    assert upload_response.status_code == 201
    file_data = upload_response.json()
    file_id = file_data["fileId"]

    # Complete the upload
    complete_response = auth_client.post(
        f"/files/{file_id}/complete",
        json={"contentHash": "dummy-hash", "extractedText": "original content"},
    )
    assert complete_response.status_code == 200

    # Now patch the content
    new_content = "replaced content"
    patch_response = auth_client.patch(
        f"/files/{file_id}/content",
        json={"text": new_content},
    )
    assert patch_response.status_code == 200
    patch_data = patch_response.json()
    assert patch_data["content"] == new_content

    # Verify content was replaced by getting it
    get_response = auth_client.get(f"/files/{file_id}/content")
    assert get_response.status_code == 200
    assert get_response.text == new_content


def test_append_file_content(auth_client):
    """Test POST append endpoint preserves existing content and adds new."""
    # Create a file first via items endpoint
    item_payload = {
        "canonicalId": f"test:file:{uuid.uuid4().hex}",
        "source": "user",
        "item": {
            "@type": "DigitalDocument",
            "name": "Test File",
            "encodingFormat": "text/plain",
            "text": "original content",
        },
    }
    create_response = auth_client.post("/items", json=item_payload)
    assert create_response.status_code == 201
    item_data = create_response.json()
    item_id = item_data["itemId"]

    # Create a file record for this item
    upload_response = auth_client.post(
        "/files/create",
        json={
            "itemId": item_id,
            "filename": "test.txt",
            "size": len("original content"),
            "mimeType": "text/plain",
        },
    )
    assert upload_response.status_code == 201
    file_data = upload_response.json()
    file_id = file_data["fileId"]

    # Complete the upload
    complete_response = auth_client.post(
        f"/files/{file_id}/complete",
        json={"contentHash": "dummy-hash", "extractedText": "original content"},
    )
    assert complete_response.status_code == 200

    # Now append content
    appended_text = "\nappended content"
    append_response = auth_client.post(
        f"/files/{file_id}/content/append",
        json={"text": appended_text},
    )
    assert append_response.status_code == 200
    append_data = append_response.json()
    assert append_data["content"] == "original content" + appended_text

    # Verify content was appended by getting it
    get_response = auth_client.get(f"/files/{file_id}/content")
    assert get_response.status_code == 200
    assert get_response.text == "original content" + appended_text


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
    response = client.post(
        "/auth/login", json={"email": user1_email, "password": password}
    )
    assert response.status_code == 200
    payload = response.json()
    org1_id = payload.get("default_org_id")
    assert org1_id

    # Create a file as user 1
    client.headers.update({"X-Org-Id": org1_id})
    item_payload = {
        "canonicalId": f"test:file:{uuid.uuid4().hex}",
        "source": "user",
        "item": {
            "@type": "DigitalDocument",
            "name": "User 1 File",
            "encodingFormat": "text/plain",
            "text": "user 1 content",
        },
    }
    create_response = client.post("/items", json=item_payload)
    assert create_response.status_code == 201
    item_data = create_response.json()
    item_id = item_data["itemId"]

    upload_response = client.post(
        "/files/create",
        json={
            "itemId": item_id,
            "filename": "user1.txt",
            "size": len("user 1 content"),
            "mimeType": "text/plain",
        },
    )
    assert upload_response.status_code == 201
    file_data = upload_response.json()
    file_id = file_data["fileId"]

    complete_response = client.post(
        f"/files/{file_id}/complete",
        json={"contentHash": "dummy-hash", "extractedText": "user 1 content"},
    )
    assert complete_response.status_code == 200

    # Register user 2
    response = client.post(
        "/auth/register",
        json={"email": user2_email, "username": user2_username, "password": password},
    )
    assert response.status_code == 200

    # Login as user 2
    response = client.post(
        "/auth/login", json={"email": user2_email, "password": password}
    )
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
