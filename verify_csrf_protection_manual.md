# CSRF Protection Manual Verification Guide

This guide provides step-by-step instructions for manually verifying CSRF protection using curl commands.

## Prerequisites

- Backend service running with `CSRF_ENABLED=true`
- `curl` and `jq` installed
- Terminal access

## Environment Setup

Start the backend with CSRF enabled:

```bash
cd backend
CSRF_ENABLED=true uv run uvicorn app.main:app --reload --port 8000
```

Verify CSRF is enabled:
```bash
curl http://localhost:8000/health
# Backend should be running
```

## Verification Steps

### Step 1: Register a Test User

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "csrf_manual_test@example.com",
    "password": "test_password_123",
    "username": "csrf_manual_test"
  }'
```

**Expected Result:** HTTP 201 Created

### Step 2: Login to Get Session Cookie

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "csrf_manual_test@example.com",
    "password": "test_password_123"
  }' \
  -c cookies.txt \
  -v
```

**Expected Result:**
- HTTP 200 OK
- Response sets cookies: `project_session`, `project_refresh`, `project_csrf`
- Cookies saved to `cookies.txt`

### Step 3: POST /items WITHOUT X-CSRF-Token Header (Expect 403)

```bash
curl -X POST http://localhost:8000/items \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Test Item Without CSRF",
    "source_system": "manual"
  }' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP 403 Forbidden
- Error message: `{"detail": "Invalid CSRF token"}`

**Why:** The request has a session cookie but no CSRF token header, so CSRF middleware blocks it.

### Step 4: GET /auth/csrf to Obtain CSRF Token

```bash
curl -X GET http://localhost:8000/auth/csrf \
  -c csrf_cookies.txt \
  -v
```

**Expected Result:**
- HTTP 200 OK
- Response body: `{"csrf_token": "..."}`
- Sets `project_csrf` cookie

Extract the CSRF token from the response:
```bash
# Save token to variable
CSRF_TOKEN=$(curl -s http://localhost:8000/auth/csrf | jq -r '.csrf_token')
echo "CSRF Token: $CSRF_TOKEN"
```

### Step 5: POST /items WITH X-CSRF-Token Header (Expect 201)

Merge cookies:
```bash
cat cookies.txt csrf_cookies.txt > combined_cookies.txt
```

Make POST request with CSRF token:
```bash
curl -X POST http://localhost:8000/items \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -b combined_cookies.txt \
  -d '{
    "title": "Test Item With CSRF",
    "source_system": "manual"
  }' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP 201 Created
- Response body includes created item with `id`, `title`, etc.

**Why:** The request includes both the CSRF cookie (from login) and the matching `X-CSRF-Token` header, so CSRF validation passes.

## Additional Test Cases

### Test 6: Verify GET Requests Don't Require CSRF

```bash
curl -X GET http://localhost:8000/items \
  -b cookies.txt \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP 200 OK
- No CSRF token required for safe methods (GET, HEAD, OPTIONS)

### Test 7: Verify PATCH Requires CSRF

```bash
# First get an item ID from previous POST
ITEM_ID="<item-id-from-previous-test>"

curl -X PATCH "http://localhost:8000/items/$ITEM_ID" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Updated Without CSRF"
  }' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP 403 Forbidden
- Error: `{"detail": "Invalid CSRF token"}`

### Test 8: Verify DELETE Requires CSRF

```bash
curl -X DELETE "http://localhost:8000/items/$ITEM_ID" \
  -b cookies.txt \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP 403 Forbidden
- Error: `{"detail": "Invalid CSRF token"}`

### Test 9: Verify Login/Register Are Exempt

```bash
# Login without CSRF token should work (exempt endpoint)
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "wrong@example.com",
    "password": "wrong"
  }' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP 401 Unauthorized (invalid credentials, NOT 403 CSRF error)
- Login is exempt from CSRF protection

### Test 10: Verify Token Mismatch Is Blocked

```bash
# Use wrong token value in header
curl -X POST http://localhost:8000/items \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: wrong_token_value" \
  -b combined_cookies.txt \
  -d '{
    "title": "Test with Wrong Token",
    "source_system": "manual"
  }' \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP 403 Forbidden
- Error: `{"detail": "Invalid CSRF token"}`
- Cookie and header values must match

## Troubleshooting

### Issue: "Invalid CSRF token" on all requests

**Solution:**
- Verify `CSRF_ENABLED=true` is set when starting backend
- Check that cookies are being saved and sent with requests
- Ensure you're using the same cookies from login

### Issue: "Backend is not running"

**Solution:**
- Start backend with: `cd backend && CSRF_ENABLED=true uv run uvicorn app.main:app --reload`
- Verify it's running: `curl http://localhost:8000/health`

### Issue: POST /items returns 401 instead of 403

**Solution:**
- You need to login first to get a valid session
- Make sure cookies from login are included in subsequent requests

### Issue: POST /items returns 422 (Validation Error)

**Solution:**
- Check the request body includes required fields: `title` and `source_system`
- Verify JSON syntax is valid

## Cleanup

```bash
rm cookies.txt csrf_cookies.txt combined_cookies.txt
```

## Reference

- **CSRF Middleware:** `backend/app/main.py` (lines 246-248)
- **CSRF Validation:** `backend/app/csrf.py`
- **CSRF Token Endpoint:** `backend/app/routes/auth.py` (`GET /auth/csrf`)
- **Exempt Paths:** Login, Register, Refresh, CSRF endpoints
- **Protected Methods:** POST, PUT, PATCH, DELETE
- **Safe Methods (No CSRF):** GET, HEAD, OPTIONS, TRACE

## Success Criteria

All 5 verification steps should pass:
1. ✓ Register user (HTTP 201)
2. ✓ Login successfully (HTTP 200, cookies set)
3. ✓ POST without CSRF token blocked (HTTP 403)
4. ✓ GET /auth/csrf returns token (HTTP 200)
5. ✓ POST with CSRF token succeeds (HTTP 201)
