# Manual Verification Guide: File Upload Validation

This guide provides step-by-step instructions for manually verifying the file upload validation implementation (subtask-5-3).

## Prerequisites

1. **Backend service running** on `http://localhost:8000`
2. **PostgreSQL database** accessible
3. **curl** or API testing tool (Postman, Insomnia, etc.)

## Test Scenarios

### Scenario 1: Oversized File (51MB) - Expect HTTP 413

**Description:** Files exceeding 50MB should be rejected with HTTP 413 (Request Entity Too Large).

**Steps:**

1. Register a test user:
   ```bash
   curl -X POST http://localhost:8000/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "filetest@example.com",
       "password": "TestPass123!",
       "org_name": "File Test Org"
     }' \
     -c cookies.txt
   ```

2. Login to get session cookie:
   ```bash
   curl -X POST http://localhost:8000/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "filetest@example.com",
       "password": "TestPass123!"
     }' \
     -c cookies.txt
   ```

3. Attempt to initiate upload with 51MB file:
   ```bash
   curl -X POST http://localhost:8000/files/initiate \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{
       "filename": "large_file.pdf",
       "content_type": "application/pdf",
       "total_size": 53477376
     }'
   ```

**Expected Response:**
- Status code: `413`
- Response body: `{"detail": "File size exceeds 52428800 bytes"}`

---

### Scenario 2: Disallowed File Type (.exe) - Expect HTTP 415

**Description:** Disallowed file types (like .exe) should be rejected with HTTP 415 (Unsupported Media Type).

**Steps:**

1. Use the same session from Scenario 1 (or login again)

2. Attempt to initiate upload with .exe file:
   ```bash
   curl -X POST http://localhost:8000/files/initiate \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{
       "filename": "malware.exe",
       "content_type": "application/x-msdownload",
       "total_size": 1024
     }'
   ```

**Expected Response:**
- Status code: `415`
- Response body: `{"detail": "Content type application/x-msdownload not allowed"}`

---

### Scenario 3: Valid PDF File - Expect HTTP 201

**Description:** Valid PDF files within size limits should be accepted with HTTP 201 (Created).

**Steps:**

1. Use the same session from previous scenarios

2. Attempt to initiate upload with valid PDF:
   ```bash
   curl -X POST http://localhost:8000/files/initiate \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{
       "filename": "document.pdf",
       "content_type": "application/pdf",
       "total_size": 1048576
     }'
   ```

**Expected Response:**
- Status code: `201`
- Response body includes:
  ```json
  {
    "upload_id": "...",
    "upload_url": "/files/upload/...",
    "chunk_size": 1048576,
    "chunk_total": 1
  }
  ```

---

## Additional Test Cases

### Test Case 4: Boundary Condition (Exactly 50MB)

Test that files of exactly 50MB (52428800 bytes) are accepted:

```bash
curl -X POST http://localhost:8000/files/initiate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "filename": "boundary.pdf",
    "content_type": "application/pdf",
    "total_size": 52428800
  }'
```

**Expected:** HTTP 201 (accepted)

---

### Test Case 5: Other Allowed Types

Test that other allowed MIME types work:

**JPEG Image:**
```bash
curl -X POST http://localhost:8000/files/initiate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "filename": "photo.jpg",
    "content_type": "image/jpeg",
    "total_size": 524288
  }'
```

**Word Document (.docx):**
```bash
curl -X POST http://localhost:8000/files/initiate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "filename": "report.docx",
    "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "total_size": 2097152
  }'
```

**Expected:** Both return HTTP 201

---

### Test Case 6: Other Disallowed Types

Test that other disallowed types are rejected:

**ZIP Archive:**
```bash
curl -X POST http://localhost:8000/files/initiate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "filename": "archive.zip",
    "content_type": "application/zip",
    "total_size": 1024
  }'
```

**JavaScript File:**
```bash
curl -X POST http://localhost:8000/files/initiate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "filename": "script.js",
    "content_type": "application/javascript",
    "total_size": 1024
  }'
```

**Expected:** Both return HTTP 415

---

## Verification Checklist

- [ ] Scenario 1: Oversized file (51MB) rejected with HTTP 413
- [ ] Scenario 2: Disallowed type (.exe) rejected with HTTP 415
- [ ] Scenario 3: Valid PDF accepted with HTTP 201
- [ ] Boundary test: Exactly 50MB accepted
- [ ] Other allowed types (JPEG, DOCX) accepted
- [ ] Other disallowed types (ZIP, JS) rejected

---

## Troubleshooting

### "401 Unauthorized" Error

**Problem:** Authentication cookie expired or missing.

**Solution:** Re-run the login command to refresh the session cookie:
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "filetest@example.com",
    "password": "TestPass123!"
  }' \
  -c cookies.txt
```

---

### Backend Service Not Running

**Problem:** Connection refused errors.

**Solution:** Start the backend service:
```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

---

### Database Not Available

**Problem:** Database connection errors in logs.

**Solution:** Start PostgreSQL via docker-compose:
```bash
docker-compose up -d postgres
```

---

## Implementation Details

### File Size Validation

- **Implementation:** `backend/app/file_validator.py` - `validate_file_size()`
- **Limit:** 50MB (52428800 bytes)
- **Location in flow:** `/files/initiate` endpoint, line 65 in `backend/app/routes/files.py`
- **Error code:** HTTP 413 (Request Entity Too Large)

### File Type Validation

- **Implementation:** `backend/app/file_validator.py` - `validate_file_type()` and ALLOWED_MIME_TYPES
- **Allowed types:** PDF, JPEG, PNG, plain text, Word documents
- **Location in flow:**
  - Declared type check at `/files/initiate`, lines 68-72
  - Content-based check at `/files/complete`, after chunk assembly
- **Error code:** HTTP 415 (Unsupported Media Type)
- **Method:** Uses python-magic for content-based MIME detection (not extension-based)

---

## Related Documentation

- **Specification:** `.auto-claude/specs/007-critical-security-remediation-secrets-exposure-and/spec.md` (lines 385-395)
- **Implementation:** `backend/app/file_validator.py`
- **Integration:** `backend/app/routes/files.py` (subtask-3-8)
- **Tests:** `backend/tests/test_file_validation.py`
- **Automated script:** `verify_file_validation.sh`
