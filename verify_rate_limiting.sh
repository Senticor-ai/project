#!/bin/bash
#
# End-to-end verification script for rate limiting on auth endpoints.
#
# Tests that:
# 1. First 5 POST requests to /auth/login return 401 (invalid credentials)
# 2. 6th POST request returns 429 (rate limited)
# 3. Response includes Retry-After header
#

set -e

BASE_URL="http://localhost:8000"
ENDPOINT="${BASE_URL}/auth/login"

echo "🧪 Testing rate limiting on /auth/login endpoint..."
echo "📍 Endpoint: ${ENDPOINT}"
echo "🔑 Rate limit: 5 requests/minute"
echo ""

# Check if backend is running
if ! curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
    echo "❌ Backend is not running on ${BASE_URL}"
    echo "   Please start the backend service first:"
    echo "   cd backend && uv run uvicorn app.main:app --reload --port 8000"
    echo ""
    exit 1
fi

echo "✓ Backend is running"
echo ""

# Store results
declare -a status_codes
retry_after_header=""

# Send 6 requests
for i in {1..6}; do
    # Get status code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${ENDPOINT}" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"wrongpassword"}')

    status_codes+=("$status_code")

    # For the 6th request, also capture the Retry-After header
    if [ "$i" -eq 6 ]; then
        retry_after_header=$(curl -s -I -X POST "${ENDPOINT}" \
            -H "Content-Type: application/json" \
            -d '{"email":"test@example.com","password":"wrongpassword"}' \
            | grep -i "retry-after:" | cut -d' ' -f2 | tr -d '\r\n' || echo "")
    fi

    echo "✓ Request ${i}: HTTP ${status_code}"

    # Small delay between requests
    sleep 0.1
done

echo ""
echo "============================================================"
echo "VERIFICATION RESULTS"
echo "============================================================"
echo ""

all_passed=true

# Verify first 5 requests return 401
for i in {0..4}; do
    request_num=$((i + 1))
    status_code="${status_codes[$i]}"
    expected_status=401

    if [ "$status_code" -eq "$expected_status" ]; then
        echo "✅ Request ${request_num}: Expected ${expected_status}, Got ${status_code} - PASS"
    else
        echo "❌ Request ${request_num}: Expected ${expected_status}, Got ${status_code} - FAIL"
        all_passed=false
    fi
done

echo ""

# Verify 6th request returns 429
status_code="${status_codes[5]}"
expected_status=429

if [ "$status_code" -eq "$expected_status" ]; then
    echo "✅ Request 6: Expected ${expected_status} (Rate Limited), Got ${status_code} - PASS"
else
    echo "❌ Request 6: Expected ${expected_status} (Rate Limited), Got ${status_code} - FAIL"
    all_passed=false
fi

echo ""

# Verify Retry-After header is present
if [ -n "$retry_after_header" ]; then
    echo "✅ Retry-After header present: ${retry_after_header} seconds - PASS"
else
    echo "❌ Retry-After header missing - FAIL"
    all_passed=false
fi

echo ""
echo "============================================================"

if [ "$all_passed" = true ]; then
    echo "🎉 ALL TESTS PASSED"
    echo ""
    echo "Summary:"
    echo "  ✓ Requests 1-5 correctly returned 401 (invalid credentials)"
    echo "  ✓ Request 6 correctly returned 429 (rate limited)"
    echo "  ✓ Retry-After header present: ${retry_after_header} seconds"
else
    echo "❌ SOME TESTS FAILED"
    echo ""
    echo "Summary:"
    echo "  Please review the failures above."
fi

echo "============================================================"

if [ "$all_passed" = true ]; then
    exit 0
else
    exit 1
fi
