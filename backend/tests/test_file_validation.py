"""
End-to-end tests for file upload validation.

Tests verify:
1. Files exceeding 50MB are rejected with HTTP 413
2. Any file type is accepted (no MIME whitelist)
3. Valid uploads return HTTP 201
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


def test_file_type_validation_allowed_pdf(auth_client):
    """
    Test that valid PDF files are accepted with HTTP 201.
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


def test_file_type_csv_accepted(auth_client):
    """
    Test that CSV files are accepted with HTTP 201.
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "data.csv",
            "content_type": "text/csv",
            "total_size": 5337,
        },
    )

    assert response.status_code == 201
    assert "upload_id" in response.json()


def test_file_type_xml_accepted(auth_client):
    """
    Test that XML files are accepted with HTTP 201.
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "tax_data.xml",
            "content_type": "text/xml",
            "total_size": 10240,
        },
    )

    assert response.status_code == 201
    assert "upload_id" in response.json()


def test_file_type_any_accepted(auth_client):
    """
    Test that any file type is accepted (no MIME whitelist).
    """
    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "archive.zip",
            "content_type": "application/zip",
            "total_size": 1024,
        },
    )

    assert response.status_code == 201
    assert "upload_id" in response.json()


def test_combined_validation_oversized_any_type(auth_client):
    """
    Test that oversized files are still rejected regardless of type.
    """
    # 51MB .zip file
    oversized_file_size = 51 * 1024 * 1024

    response = auth_client.post(
        "/files/initiate",
        json={
            "filename": "large_archive.zip",
            "content_type": "application/zip",
            "total_size": oversized_file_size,
        },
    )

    assert response.status_code == 413
