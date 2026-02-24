# Rate Limiting Verification Guide

This document provides manual verification steps for rate limiting on auth endpoints.

## Overview

The following endpoints have rate limiting configured:
- `/auth/login` - 5 requests/minute per IP
- `/auth/register` - 5 requests/minute per IP
- `/files/initiate` - 10 requests/minute per IP
- `/files/upload/{upload_id}` - 10 requests/minute per IP

## Prerequisites

1. Backend service must be running:
   ```bash
   cd backend && uv run uvicorn app.main:app --reload --port 8000
   ```

2. Ensure PostgreSQL is running (required by backend)

## Automated Test (Recommended)

Run the pytest test suite:

```bash
cd backend
uv run pytest tests/test_rate_limiting.py -v
```

Expected output:
```
tests/test_rate_limiting.py::test_auth_login_rate_limiting PASSED
tests/test_rate_limiting.py::test_auth_register_rate_limiting PASSED
tests/test_rate_limiting.py::test_file_upload_rate_limiting PASSED
tests/test_rate_limiting.py::test_rate_limit_retry_after_header_format PASSED
```

## Manual Verification (Alternative)

### Option 1: Using the Bash Script

```bash
bash verify_rate_limiting.sh
```

Expected output:
```
🧪 Testing rate limiting on /auth/login endpoint...
📍 Endpoint: http://localhost:8000/auth/login
🔑 Rate limit: 5 requests/minute

✓ Backend is running

✓ Request 1: HTTP 401
✓ Request 2: HTTP 401
✓ Request 3: HTTP 401
✓ Request 4: HTTP 401
✓ Request 5: HTTP 401
✓ Request 6: HTTP 429

============================================================
VERIFICATION RESULTS
============================================================

✅ Request 1: Expected 401, Got 401 - PASS
✅ Request 2: Expected 401, Got 401 - PASS
✅ Request 3: Expected 401, Got 401 - PASS
✅ Request 4: Expected 401, Got 401 - PASS
✅ Request 5: Expected 401, Got 401 - PASS

✅ Request 6: Expected 429 (Rate Limited), Got 429 - PASS

✅ Retry-After header present: 60 seconds - PASS

============================================================
🎉 ALL TESTS PASSED

Summary:
  ✓ Requests 1-5 correctly returned 401 (invalid credentials)
  ✓ Request 6 correctly returned 429 (rate limited)
  ✓ Retry-After header present: 60 seconds
============================================================
```

### Option 2: Using curl Manually

1. **Send 5 requests to /auth/login (should all return 401):**

```bash
for i in {1..5}; do
  echo "Request $i:"
  curl -s -w "\nHTTP Status: %{http_code}\n\n" -X POST http://localhost:8000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrongpassword"}'
  sleep 0.1
done
```

Expected: All 5 requests return HTTP 401 (invalid credentials)

2. **Send 6th request (should return 429):**

```bash
echo "Request 6 (should be rate limited):"
curl -i -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpassword"}'
```

Expected output includes:
```
HTTP/1.1 429 Too Many Requests
retry-after: 60
...
{"detail":"Rate limit exceeded"}
```

## Verification Checklist

- [ ] First 5 requests to `/auth/login` return HTTP 401 (invalid credentials)
- [ ] 6th request to `/auth/login` returns HTTP 429 (rate limited)
- [ ] Response includes `Retry-After` header with value (e.g., "60")
- [ ] Response body contains rate limit error message
- [ ] Rate limiting resets after the retry period (60 seconds)

## Troubleshooting

### Backend not running
```
❌ Backend is not running on http://localhost:8000
```

**Solution:** Start the backend service:
```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

### All requests return 429
**Cause:** You've already hit the rate limit from previous tests.

**Solution:** Wait 60 seconds for the rate limit to reset, or restart the backend service.

### No Retry-After header
**Issue:** The rate limiter exception handler isn't properly configured.

**Solution:** Verify that `backend/app/main.py` has the `RateLimitExceeded` exception handler that sets the `Retry-After` header.

## Implementation Details

Rate limiting is implemented using:
- **Library:** `slowapi` (compatible with FastAPI)
- **Storage:** In-memory (development) or Redis (production)
- **Key function:** IP address (`get_remote_address`)
- **Limits:**
  - Auth endpoints: 5/minute
  - File upload endpoints: 10/minute

### Code References

- Rate limiter instance: `backend/app/rate_limit.py`
- Exception handler: `backend/app/main.py` (search for `RateLimitExceeded`)
- Auth decorators: `backend/app/routes/auth.py` (`@limiter.limit("5/minute")`)
- File upload decorators: `backend/app/routes/files.py` (`@limiter.limit("10/minute")`)

## Related Documentation

- Spec: `.auto-claude/specs/007-critical-security-remediation-secrets-exposure-and/spec.md`
- Implementation Plan: `.auto-claude/specs/007-critical-security-remediation-secrets-exposure-and/implementation_plan.json`
- Security Documentation: `docs/security.md`
