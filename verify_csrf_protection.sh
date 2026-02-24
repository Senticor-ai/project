#!/usr/bin/env bash
#
# End-to-end verification of CSRF protection
#
# This script verifies:
# 1. Backend starts with CSRF_ENABLED=true
# 2. Login to get session cookie
# 3. POST /items WITHOUT X-CSRF-Token header returns 403
# 4. GET /auth/csrf to get token
# 5. POST /items WITH X-CSRF-Token header returns 201
#
# Requirements:
# - Backend service running with CSRF_ENABLED=true
# - jq installed (for JSON parsing)
# - curl installed

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
RESULTS_FILE="csrf_verification_results.txt"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

log_pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    FAILED=$((FAILED + 1))
}

log_info() {
    echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

log_step() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Check dependencies
if ! command -v jq &> /dev/null; then
    log_fail "jq is not installed. Please install jq to run this script."
    exit 1
fi

if ! command -v curl &> /dev/null; then
    log_fail "curl is not installed. Please install curl to run this script."
    exit 1
fi

# Create a unique test user
TEST_EMAIL="csrf_test_$(date +%s)@example.com"
TEST_PASSWORD="test_password_123"
TEST_USERNAME="csrf_test_$(date +%s)"

log_step "CSRF Protection E2E Verification"
log_info "Base URL: $BASE_URL"
log_info "Test Email: $TEST_EMAIL"

# Step 0: Check if backend is running
log_step "Step 0: Health Check"
if curl -f -s "$BASE_URL/health" > /dev/null 2>&1; then
    log_pass "Backend is running at $BASE_URL"
else
    log_fail "Backend is not running at $BASE_URL"
    log_info "Please start the backend with: CSRF_ENABLED=true cd backend && uv run uvicorn app.main:app --reload"
    exit 1
fi

# Step 1: Register a test user
log_step "Step 1: Register Test User"
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"username\":\"$TEST_USERNAME\"}")

REGISTER_BODY=$(echo "$REGISTER_RESPONSE" | head -n -1)
REGISTER_STATUS=$(echo "$REGISTER_RESPONSE" | tail -n 1)

if [ "$REGISTER_STATUS" = "201" ]; then
    log_pass "User registered successfully (HTTP 201)"
else
    log_fail "User registration failed (HTTP $REGISTER_STATUS)"
    echo "Response: $REGISTER_BODY"
    exit 1
fi

# Step 2: Login to get session cookie
log_step "Step 2: Login to Get Session Cookie"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -c cookies.txt -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | head -n -1)
LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | tail -n 1)

if [ "$LOGIN_STATUS" = "200" ]; then
    log_pass "Login successful (HTTP 200)"
else
    log_fail "Login failed (HTTP $LOGIN_STATUS)"
    echo "Response: $LOGIN_BODY"
    exit 1
fi

# Extract session cookie
SESSION_COOKIE=$(grep "project_session" cookies.txt | awk '{print $7}')
if [ -n "$SESSION_COOKIE" ]; then
    log_pass "Session cookie obtained: ${SESSION_COOKIE:0:20}..."
else
    log_fail "No session cookie found in response"
    exit 1
fi

# Step 3: POST /items WITHOUT X-CSRF-Token header (should return 403)
log_step "Step 3: POST /items WITHOUT CSRF Token (Expect 403)"
NO_CSRF_RESPONSE=$(curl -s -w "\n%{http_code}" -b cookies.txt -X POST "$BASE_URL/items" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test Item Without CSRF","source_system":"manual"}')

NO_CSRF_BODY=$(echo "$NO_CSRF_RESPONSE" | head -n -1)
NO_CSRF_STATUS=$(echo "$NO_CSRF_RESPONSE" | tail -n 1)

if [ "$NO_CSRF_STATUS" = "403" ]; then
    log_pass "POST without CSRF token blocked (HTTP 403)"
    if echo "$NO_CSRF_BODY" | jq -e '.detail' | grep -q "Invalid CSRF token"; then
        log_pass "Error message confirms CSRF validation: 'Invalid CSRF token'"
    else
        log_fail "Error message does not mention CSRF token"
        echo "Response: $NO_CSRF_BODY"
    fi
else
    log_fail "Expected HTTP 403, got HTTP $NO_CSRF_STATUS"
    echo "Response: $NO_CSRF_BODY"
fi

# Step 4: GET /auth/csrf to get CSRF token
log_step "Step 4: GET /auth/csrf to Obtain CSRF Token"
CSRF_RESPONSE=$(curl -s -w "\n%{http_code}" -c csrf_cookies.txt -X GET "$BASE_URL/auth/csrf")

CSRF_BODY=$(echo "$CSRF_RESPONSE" | head -n -1)
CSRF_STATUS=$(echo "$CSRF_RESPONSE" | tail -n 1)

if [ "$CSRF_STATUS" = "200" ]; then
    log_pass "CSRF endpoint accessible (HTTP 200)"
else
    log_fail "CSRF endpoint failed (HTTP $CSRF_STATUS)"
    echo "Response: $CSRF_BODY"
    exit 1
fi

# Extract CSRF token from response body
CSRF_TOKEN=$(echo "$CSRF_BODY" | jq -r '.csrf_token')
if [ -n "$CSRF_TOKEN" ] && [ "$CSRF_TOKEN" != "null" ]; then
    log_pass "CSRF token obtained: ${CSRF_TOKEN:0:20}..."
else
    log_fail "No CSRF token in response"
    echo "Response: $CSRF_BODY"
    exit 1
fi

# Extract CSRF cookie
CSRF_COOKIE=$(grep "project_csrf" csrf_cookies.txt | awk '{print $7}')
if [ -n "$CSRF_COOKIE" ]; then
    log_pass "CSRF cookie obtained: ${CSRF_COOKIE:0:20}..."
else
    log_fail "No CSRF cookie found in response"
    exit 1
fi

# Merge cookies (session + CSRF)
cat cookies.txt csrf_cookies.txt > combined_cookies.txt

# Step 5: POST /items WITH X-CSRF-Token header (should return 201)
log_step "Step 5: POST /items WITH CSRF Token (Expect 201)"
WITH_CSRF_RESPONSE=$(curl -s -w "\n%{http_code}" -b combined_cookies.txt -X POST "$BASE_URL/items" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    -d '{"title":"Test Item With CSRF","source_system":"manual"}')

WITH_CSRF_BODY=$(echo "$WITH_CSRF_RESPONSE" | head -n -1)
WITH_CSRF_STATUS=$(echo "$WITH_CSRF_RESPONSE" | tail -n 1)

if [ "$WITH_CSRF_STATUS" = "201" ]; then
    log_pass "POST with CSRF token succeeded (HTTP 201)"
    ITEM_ID=$(echo "$WITH_CSRF_BODY" | jq -r '.id')
    if [ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ]; then
        log_pass "Item created successfully with ID: $ITEM_ID"
    fi
else
    log_fail "Expected HTTP 201, got HTTP $WITH_CSRF_STATUS"
    echo "Response: $WITH_CSRF_BODY"
fi

# Cleanup
rm -f cookies.txt csrf_cookies.txt combined_cookies.txt

# Summary
log_step "Verification Summary"
echo "Total Passed: $PASSED"
echo "Total Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ ALL CSRF PROTECTION TESTS PASSED  ${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  ✗ SOME CSRF PROTECTION TESTS FAILED  ${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi
