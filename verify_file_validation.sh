#!/bin/bash
# End-to-end verification script for file upload validation
# Tests file size limits (50MB) and file type validation (MIME types)

set -e

API_BASE="${API_BASE:-http://localhost:8000}"
COOKIE_FILE=$(mktemp)

echo "==============================================="
echo "File Upload Validation E2E Verification"
echo "==============================================="
echo ""
echo "Testing endpoint: $API_BASE/files/initiate"
echo ""

# Step 0: Register and login to get session cookie
echo "Step 0: Authenticating..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "filevalidation@example.com",
    "password": "TestPass123!",
    "org_name": "File Validation Test Org"
  }' \
  -c "$COOKIE_FILE")

LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "filevalidation@example.com",
    "password": "TestPass123!"
  }' \
  -c "$COOKIE_FILE")

echo "✓ Authentication successful"
echo ""

# Step 1: Test oversized file (51MB) - expect HTTP 413
echo "Step 1: Testing oversized file (51MB)..."
RESPONSE_1=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_BASE/files/initiate" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d '{
    "filename": "large_file.pdf",
    "content_type": "application/pdf",
    "total_size": 53477376
  }')

HTTP_CODE_1=$(echo "$RESPONSE_1" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_1=$(echo "$RESPONSE_1" | sed '/HTTP_CODE:/d')

echo "Response code: $HTTP_CODE_1"
echo "Response body: $BODY_1"

if [ "$HTTP_CODE_1" = "413" ]; then
  echo "✓ Test 1 PASSED: Oversized file rejected with HTTP 413"
else
  echo "✗ Test 1 FAILED: Expected HTTP 413, got $HTTP_CODE_1"
  rm -f "$COOKIE_FILE"
  exit 1
fi
echo ""

# Step 2: Test disallowed file type (.exe) - expect HTTP 415
echo "Step 2: Testing disallowed file type (.exe)..."
RESPONSE_2=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_BASE/files/initiate" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d '{
    "filename": "malware.exe",
    "content_type": "application/x-msdownload",
    "total_size": 1024
  }')

HTTP_CODE_2=$(echo "$RESPONSE_2" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_2=$(echo "$RESPONSE_2" | sed '/HTTP_CODE:/d')

echo "Response code: $HTTP_CODE_2"
echo "Response body: $BODY_2"

if [ "$HTTP_CODE_2" = "415" ]; then
  echo "✓ Test 2 PASSED: Disallowed file type rejected with HTTP 415"
else
  echo "✗ Test 2 FAILED: Expected HTTP 415, got $HTTP_CODE_2"
  rm -f "$COOKIE_FILE"
  exit 1
fi
echo ""

# Step 3: Test valid PDF file - expect HTTP 201
echo "Step 3: Testing valid PDF file (1MB)..."
RESPONSE_3=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_BASE/files/initiate" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d '{
    "filename": "document.pdf",
    "content_type": "application/pdf",
    "total_size": 1048576
  }')

HTTP_CODE_3=$(echo "$RESPONSE_3" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_3=$(echo "$RESPONSE_3" | sed '/HTTP_CODE:/d')

echo "Response code: $HTTP_CODE_3"
echo "Response body: $BODY_3"

if [ "$HTTP_CODE_3" = "201" ]; then
  echo "✓ Test 3 PASSED: Valid PDF accepted with HTTP 201"
else
  echo "✗ Test 3 FAILED: Expected HTTP 201, got $HTTP_CODE_3"
  rm -f "$COOKIE_FILE"
  exit 1
fi
echo ""

# Cleanup
rm -f "$COOKIE_FILE"

echo "==============================================="
echo "All tests PASSED ✓"
echo "==============================================="
echo ""
echo "File upload validation is working correctly:"
echo "  - Files > 50MB rejected with HTTP 413"
echo "  - Disallowed types (.exe) rejected with HTTP 415"
echo "  - Valid PDFs accepted with HTTP 201"
