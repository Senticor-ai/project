"""
End-to-end tests for file upload validation (size and type).

Tests verify:
1. Files exceeding 50MB are rejected with HTTP 413
2. Disallowed file types (.exe, etc.) are rejected with HTTP 415
3. Valid PDFs are accepted with HTTP 201

These tests cover the security requirements from subtask-3-8 and subtask-5-3.
"""


def test_file_size_validation_exceeds_limit(auth_client):
    """
    Test that files exceeding 50MB are rejected with HTTP 413.

    Verification step 1: POST /files/initiate with 51MB file size
    Expected: HTTP 413 (Request Entity Too Large)
    """
    # 51MB = 51 * 1024 * 1024 bytes = 53477376 bytes
    oversized_file_size = 51 * 1024 * 1024

    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "large_file.pdf",
            "content_type": "application/pdf",
            "total_size": oversized_file_size,
        },
    )

    assert response.status_code == 413
    assert (
        "exceeds" in response.json()["detail"].lower()
        or "too large" in response.json()["detail"].lower()
    )


def test_file_size_validation_within_limit(auth_client):
    """
    Test that files within 50MB limit are accepted (size validation passes).

    This tests the boundary condition - exactly 50MB should pass.
    """
    # 50MB = 50 * 1024 * 1024 bytes = 52428800 bytes
    valid_file_size = 50 * 1024 * 1024

    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "valid_size.pdf",
            "content_type": "application/pdf",
            "total_size": valid_file_size,
        },
    )

    # Should NOT return 413 (may return 201 or other success code)
    assert response.status_code != 413


def test_file_type_validation_disallowed_exe(auth_client):
    """
    Test that .exe files are rejected with HTTP 415.

    Verification step 2: POST /files/initiate with .exe file
    Expected: HTTP 415 (Unsupported Media Type)
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "malware.exe",
            "content_type": "application/x-msdownload",
            "total_size": 1024,  # 1KB, within size limit
        },
    )

    assert response.status_code == 415
    assert "not allowed" in response.json()["detail"].lower()


def test_file_type_validation_disallowed_zip(auth_client):
    """
    Test that .zip files are rejected with HTTP 415.

    Additional test case for another common disallowed type.
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "archive.zip",
            "content_type": "application/zip",
            "total_size": 1024,
        },
    )

    assert response.status_code == 415
    assert "not allowed" in response.json()["detail"].lower()


def test_file_type_validation_allowed_pdf(auth_client):
    """
    Test that valid PDF files are accepted with HTTP 201.

    Verification step 3: POST /files/initiate with valid PDF
    Expected: HTTP 201 (Created)
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "document.pdf",
            "content_type": "application/pdf",
            "total_size": 1024 * 1024,  # 1MB
        },
    )

    assert response.status_code == 201
    assert "upload_id" in response.json()
    assert "upload_url" in response.json()


def test_file_type_validation_allowed_jpeg(auth_client):
    """
    Test that valid JPEG images are accepted.

    Additional test case for another allowed type.
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "photo.jpg",
            "content_type": "image/jpeg",
            "total_size": 512 * 1024,  # 512KB
        },
    )

    assert response.status_code == 201
    assert "upload_id" in response.json()


def test_file_type_validation_allowed_docx(auth_client):
    """
    Test that valid Word documents are accepted.

    Additional test case for Office document format.
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "report.docx",
            "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "total_size": 2 * 1024 * 1024,  # 2MB
        },
    )

    assert response.status_code == 201
    assert "upload_id" in response.json()


def test_combined_validation_oversized_disallowed_type(auth_client):
    """
    Test that a file with both oversized AND disallowed type is properly rejected.

    This tests the validation order - size is checked first (line 65 in files.py),
    so we expect HTTP 413, not HTTP 415.
    """
    # 51MB .exe file
    oversized_file_size = 51 * 1024 * 1024

    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "large_malware.exe",
            "content_type": "application/x-msdownload",
            "total_size": oversized_file_size,
        },
    )

    # Size validation happens first, so should get 413
    assert response.status_code == 413
