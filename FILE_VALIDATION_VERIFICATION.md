# File Upload Validation - End-to-End Verification (Subtask 5-3)

This document describes the comprehensive verification suite created for file upload validation (size and type checks) as part of security remediation task 007.

## Overview

File upload validation ensures that:
1. **Size limit:** Files exceeding 50MB are rejected with HTTP 413
2. **Type restriction:** Only whitelisted MIME types are accepted
3. **Security:** Validation uses content-based detection (python-magic), not just filename extensions

## Verification Artifacts

### 1. Automated Test Suite (Recommended)

**File:** `backend/tests/test_file_validation.py`

**Purpose:** Comprehensive pytest test suite for CI/CD integration and automated regression testing.

**Test Coverage:**
- ✅ `test_file_size_validation_exceeds_limit` - 51MB file rejected with HTTP 413
- ✅ `test_file_size_validation_within_limit` - 50MB file accepted (boundary condition)
- ✅ `test_file_type_validation_disallowed_exe` - .exe file rejected with HTTP 415
- ✅ `test_file_type_validation_disallowed_zip` - .zip file rejected with HTTP 415
- ✅ `test_file_type_validation_allowed_pdf` - PDF file accepted with HTTP 201
- ✅ `test_file_type_validation_allowed_jpeg` - JPEG image accepted
- ✅ `test_file_type_validation_allowed_docx` - Word document accepted
- ✅ `test_combined_validation_oversized_disallowed_type` - Validation order test

**Run command:**
```bash
cd backend && uv run pytest tests/test_file_validation.py -v
```

**Advantages:**
- Fast execution (no real backend service required)
- Automatic authentication fixture
- Detailed assertion messages
- Integrates with CI/CD pipeline
- Covers edge cases and boundary conditions

---

### 2. Automated Bash Script

**File:** `verify_file_validation.sh`

**Purpose:** End-to-end verification script for manual testing or CI/CD integration with a running backend service.

**Test Steps:**
1. Authenticates (register + login)
2. Tests oversized file (51MB) → expects HTTP 413
3. Tests disallowed type (.exe) → expects HTTP 415
4. Tests valid PDF → expects HTTP 201
5. Reports pass/fail status

**Run command:**
```bash
# Ensure backend is running on http://localhost:8000
./verify_file_validation.sh
```

**Advantages:**
- Tests real HTTP API
- No Python dependencies required
- Easy to run in CI/CD pipelines
- Clear pass/fail output
- Requires running backend service

---

### 3. Manual Verification Guide

**File:** `verify_file_validation_manual.md`

**Purpose:** Step-by-step guide for manual testing by QA or developers.

**Contents:**
- Detailed test scenarios with curl commands
- Expected request/response examples
- Additional test cases (boundary conditions, other MIME types)
- Troubleshooting guide
- Implementation details reference

**Use when:**
- QA manual testing
- Debugging validation issues
- Understanding the API contract
- Learning the validation flow

---

## Quick Start

### Option 1: Automated Tests (Fastest, Recommended)

```bash
cd backend
uv run pytest tests/test_file_validation.py -v
```

**Expected output:**
```
tests/test_file_validation.py::test_file_size_validation_exceeds_limit PASSED
tests/test_file_validation.py::test_file_size_validation_within_limit PASSED
tests/test_file_validation.py::test_file_type_validation_disallowed_exe PASSED
tests/test_file_validation.py::test_file_type_validation_disallowed_zip PASSED
tests/test_file_validation.py::test_file_type_validation_allowed_pdf PASSED
tests/test_file_validation.py::test_file_type_validation_allowed_jpeg PASSED
tests/test_file_validation.py::test_file_type_validation_allowed_docx PASSED
tests/test_file_validation.py::test_combined_validation_oversized_disallowed_type PASSED

8 passed
```

---

### Option 2: Bash Script (E2E with Running Service)

```bash
# Terminal 1: Start backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2: Run verification
./verify_file_validation.sh
```

**Expected output:**
```
===============================================
File Upload Validation E2E Verification
===============================================

Testing endpoint: http://localhost:8000/files/initiate

Step 0: Authenticating...
✓ Authentication successful

Step 1: Testing oversized file (51MB)...
Response code: 413
✓ Test 1 PASSED: Oversized file rejected with HTTP 413

Step 2: Testing disallowed file type (.exe)...
Response code: 415
✓ Test 2 PASSED: Disallowed file type rejected with HTTP 415

Step 3: Testing valid PDF file (1MB)...
Response code: 201
✓ Test 3 PASSED: Valid PDF accepted with HTTP 201

===============================================
All tests PASSED ✓
===============================================
```

---

### Option 3: Manual Testing (See verify_file_validation_manual.md)

Follow the step-by-step guide in `verify_file_validation_manual.md` for manual curl commands and detailed testing procedures.

---

## Verification Criteria (from spec.md)

All three verification steps from the specification are covered:

- ✅ **Step 1:** POST /files/initiate with 51MB file size → Verify returns 413 (Request Entity Too Large)
- ✅ **Step 2:** POST /files/initiate with .exe file → Verify returns 415 (Unsupported Media Type)
- ✅ **Step 3:** POST /files/initiate with valid PDF → Verify returns 201 (Created)

---

## Implementation Details

### File Size Validation

- **Module:** `backend/app/file_validator.py`
- **Function:** `validate_file_size(size: int)`
- **Constant:** `MAX_FILE_SIZE = 50 * 1024 * 1024` (50MB)
- **Error:** HTTP 413 with message "File size exceeds 52428800 bytes"
- **Location:** `/files/initiate` endpoint, line 65 in `backend/app/routes/files.py`

### File Type Validation

- **Module:** `backend/app/file_validator.py`
- **Function:** `validate_file_type(content: bytes, filename: str)`
- **Whitelist:** `ALLOWED_MIME_TYPES` set (PDF, JPEG, PNG, plain text, Word docs)
- **Method:** Content-based using python-magic (not extension-based)
- **Error:** HTTP 415 with message "Content type {mime} not allowed"
- **Locations:**
  - Declared type check: `/files/initiate`, lines 68-72
  - Content-based check: `/files/complete`, after chunk assembly

### Dependencies

- **Python package:** `python-magic>=0.4.27` (added in subtask-3-6)
- **System library:** `libmagic1` (added to Dockerfile in subtask-3-7)

---

## Related Subtasks

- **subtask-3-5:** Created `backend/app/file_validator.py` with validation logic
- **subtask-3-6:** Added `python-magic` dependency
- **subtask-3-7:** Added `libmagic1` to Dockerfile
- **subtask-3-8:** Integrated validation into `/files/initiate` and `/files/complete` endpoints
- **subtask-5-3:** This verification suite (current subtask)

---

## Troubleshooting

### Tests Fail with "libmagic not found"

**Problem:** System library `libmagic1` not installed.

**Solution:**
```bash
# macOS
brew install libmagic

# Debian/Ubuntu
apt-get install -y libmagic1

# Docker (already in Dockerfile)
RUN apt-get install -y libmagic1
```

---

### Backend Not Running

**Problem:** Connection refused when running bash script.

**Solution:**
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

---

### Database Connection Error

**Problem:** Backend can't connect to PostgreSQL.

**Solution:**
```bash
docker-compose up -d postgres
```

---

## Next Steps

After verification passes:

1. ✅ Commit changes to git
2. ✅ Update implementation_plan.json (mark subtask-5-3 as "completed")
3. Move to next subtask (subtask-5-4: CSRF protection verification)

---

## Acceptance Criteria

- [x] Test suite created with comprehensive coverage (8 tests)
- [x] Automated bash script for E2E verification
- [x] Manual verification guide with troubleshooting
- [x] All verification steps from spec.md covered
- [x] Python syntax validated
- [x] Bash script syntax validated
- [x] Documentation complete

**Status:** ✅ Ready for verification execution
