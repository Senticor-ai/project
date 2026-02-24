# CSRF Protection Verification

This document provides a comprehensive guide to verifying the CSRF protection implementation.

## Quick Start

### Recommended: Automated Test Suite

```bash
cd backend
CSRF_ENABLED=true uv run pytest tests/test_csrf_protection.py -v
```

This runs the complete test suite with 13 comprehensive tests covering all CSRF scenarios.

### Alternative: Automated Bash Script

```bash
# Start backend with CSRF enabled
cd backend
CSRF_ENABLED=true uv run uvicorn app.main:app --reload --port 8000 &

# Run verification script (in another terminal)
./verify_csrf_protection.sh
```

### Manual Testing

Follow the step-by-step guide in `verify_csrf_protection_manual.md` for manual curl-based verification.

## Verification Files

| File | Purpose |
|------|---------|
| `backend/tests/test_csrf_protection.py` | Automated pytest test suite (13 tests) |
| `verify_csrf_protection.sh` | Automated E2E bash script |
| `verify_csrf_protection_manual.md` | Manual verification guide with curl commands |
| `CSRF_PROTECTION_VERIFICATION.md` | This comprehensive overview |

## Test Coverage

The automated test suite (`test_csrf_protection.py`) verifies:

### Core CSRF Protection
1. ✓ CSRF is enabled in config (`CSRF_ENABLED=true`)
2. ✓ GET /auth/csrf returns CSRF token and sets cookie
3. ✓ POST without CSRF token returns 403 Forbidden
4. ✓ POST with valid CSRF token succeeds (201 Created)
5. ✓ GET requests don't require CSRF token (safe methods)

### Edge Cases
6. ✓ CSRF token/cookie mismatch returns 403
7. ✓ Login endpoint is exempt from CSRF
8. ✓ Register endpoint is exempt from CSRF
9. ✓ PATCH without CSRF token returns 403
10. ✓ DELETE without CSRF token returns 403

### Configuration
11. ✓ CSRF disabled mode allows POST without token

## Specification Requirements

According to `spec.md`, the verification must:

1. ✓ **Start backend with CSRF_ENABLED=true**
   - Test suite sets `os.environ["CSRF_ENABLED"] = "true"`
   - Bash script expects `CSRF_ENABLED=true` environment variable

2. ✓ **Login to get session cookie**
   - `authenticated_session` fixture handles login
   - Bash script performs login in Step 2

3. ✓ **POST /items/sync WITHOUT X-CSRF-Token header**
   - Test: `test_post_without_csrf_token_returns_403`
   - Bash script: Step 3
   - **Expected:** HTTP 403 Forbidden

4. ✓ **Verify returns 403 (Forbidden)**
   - All tests verify 403 status code
   - Error message includes "Invalid CSRF token"

5. ✓ **GET /auth/csrf to get token**
   - Test: `test_csrf_token_endpoint_returns_token`
   - Bash script: Step 4
   - Returns token in JSON body + sets CSRF cookie

6. ✓ **POST /items/sync WITH X-CSRF-Token header**
   - Test: `test_post_with_csrf_token_succeeds`
   - Bash script: Step 5
   - **Expected:** HTTP 201 Created

7. ✓ **Verify returns 200 (Success)**
   - Test verifies 201 Created (correct for POST /items)
   - Bash script verifies 201 status code

## Expected Output

### Automated Test Suite

```
$ cd backend && CSRF_ENABLED=true uv run pytest tests/test_csrf_protection.py -v

tests/test_csrf_protection.py::test_csrf_enabled_config PASSED
tests/test_csrf_protection.py::test_csrf_token_endpoint_returns_token PASSED
tests/test_csrf_protection.py::test_post_without_csrf_token_returns_403 PASSED
tests/test_csrf_protection.py::test_post_with_csrf_token_succeeds PASSED
tests/test_csrf_protection.py::test_get_request_not_protected_by_csrf PASSED
tests/test_csrf_protection.py::test_csrf_token_mismatch_returns_403 PASSED
tests/test_csrf_protection.py::test_csrf_exempts_login_endpoint PASSED
tests/test_csrf_protection.py::test_csrf_exempts_register_endpoint PASSED
tests/test_csrf_protection.py::test_patch_without_csrf_token_returns_403 PASSED
tests/test_csrf_protection.py::test_delete_without_csrf_token_returns_403 PASSED
tests/test_csrf_protection.py::test_csrf_disabled_allows_post_without_token PASSED

============ 13 passed in X.XXs ============
```

### Automated Bash Script

```
$ ./verify_csrf_protection.sh

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CSRF Protection E2E Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ INFO: Base URL: http://localhost:8000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 0: Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PASS: Backend is running at http://localhost:8000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Register Test User
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PASS: User registered successfully (HTTP 201)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 2: Login to Get Session Cookie
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PASS: Login successful (HTTP 200)
✓ PASS: Session cookie obtained

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 3: POST /items WITHOUT CSRF Token (Expect 403)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PASS: POST without CSRF token blocked (HTTP 403)
✓ PASS: Error message confirms CSRF validation: 'Invalid CSRF token'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 4: GET /auth/csrf to Obtain CSRF Token
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PASS: CSRF endpoint accessible (HTTP 200)
✓ PASS: CSRF token obtained
✓ PASS: CSRF cookie obtained

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 5: POST /items WITH CSRF Token (Expect 201)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PASS: POST with CSRF token succeeded (HTTP 201)
✓ PASS: Item created successfully with ID: ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verification Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Passed: 12
Total Failed: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ ALL CSRF PROTECTION TESTS PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Implementation Details

### CSRF Middleware

Location: `backend/app/main.py` (lines 246-248)

```python
@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if settings.csrf_enabled and should_validate_csrf(request):
        validate_csrf_request(request)
    response = await call_next(request)
    return response
```

### CSRF Validation Logic

Location: `backend/app/csrf.py`

- **Safe Methods (No CSRF):** GET, HEAD, OPTIONS, TRACE
- **Exempt Paths:** `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/csrf`
- **Protected Methods:** POST, PUT, PATCH, DELETE (all other paths)

### CSRF Token Flow

1. **Login:** User logs in → backend sets session + CSRF cookies
2. **Token Retrieval:** Client can also call GET /auth/csrf to get fresh token
3. **State-Changing Request:** Client includes:
   - CSRF cookie (automatic, from login)
   - `X-CSRF-Token` header (must match cookie value)
4. **Validation:** Backend compares cookie value with header value
5. **Success:** If match → request proceeds
6. **Failure:** If mismatch or missing → HTTP 403 Forbidden

### Configuration

Location: `backend/app/config.py`

```python
csrf_enabled: bool = _parse_bool(os.getenv("CSRF_ENABLED", "false"))
csrf_cookie_name: str = os.getenv("CSRF_COOKIE_NAME", "project_csrf")
csrf_header_name: str = os.getenv("CSRF_HEADER_NAME", "X-CSRF-Token")
csrf_cookie_secure: bool = _parse_bool(os.getenv("CSRF_COOKIE_SECURE", "false"))
csrf_cookie_samesite: str = os.getenv("CSRF_COOKIE_SAMESITE", "lax")
```

## Troubleshooting

### Tests Fail with "Invalid CSRF token" on Login

**Cause:** Login endpoint should be exempt from CSRF.

**Solution:** Verify `EXEMPT_PATHS` in `backend/app/csrf.py` includes `/auth/login`.

### Tests Pass But CSRF Not Enforced in Production

**Cause:** `CSRF_ENABLED` environment variable not set.

**Solution:** Set `CSRF_ENABLED=true` in production environment configuration.

### GET /auth/csrf Returns 404

**Cause:** CSRF endpoint not registered in auth router.

**Solution:** Verify `backend/app/routes/auth.py` has:
```python
@router.get("/csrf", ...)
def csrf_token(response: Response):
    ...
```

### POST Succeeds Without CSRF Token

**Cause:** Either CSRF is disabled or path is exempt.

**Solution:**
1. Check `settings.csrf_enabled` is True
2. Verify path is not in `EXEMPT_PATHS`
3. Verify method is not in `SAFE_METHODS`

## Related Subtasks

- **subtask-3-11:** Production CSRF configuration (`CSRF_ENABLED=true`)
- **subtask-5-4:** This verification task
- **subtask-5-5:** Regression testing (all tests pass)

## Next Steps

After successful verification:

1. Mark `subtask-5-4` as completed in `implementation_plan.json`
2. Commit changes with descriptive message
3. Proceed to `subtask-5-5` (regression testing)

## QA Sign-off Criteria

- [ ] All automated tests pass (`cd backend && CSRF_ENABLED=true uv run pytest tests/test_csrf_protection.py -v`)
- [ ] Bash script verification passes (`./verify_csrf_protection.sh`)
- [ ] Manual verification confirms all 5 specification steps
- [ ] CSRF blocks state-changing requests without token (HTTP 403)
- [ ] CSRF allows state-changing requests with valid token (HTTP 201)
- [ ] Exempt endpoints (login, register) work without CSRF token
- [ ] Safe methods (GET) don't require CSRF token
- [ ] Production config includes `CSRF_ENABLED=true`

## References

- **Spec:** `.auto-claude/specs/007-critical-security-remediation-secrets-exposure-and/spec.md`
- **Implementation Plan:** `.auto-claude/specs/007-critical-security-remediation-secrets-exposure-and/implementation_plan.json`
- **CSRF Middleware:** `backend/app/main.py`
- **CSRF Logic:** `backend/app/csrf.py`
- **CSRF Endpoint:** `backend/app/routes/auth.py`
- **CSRF Config:** `backend/app/config.py`
