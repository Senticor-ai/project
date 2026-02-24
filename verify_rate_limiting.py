#!/usr/bin/env python3
"""
End-to-end verification script for rate limiting on auth endpoints.

Tests that:
1. First 5 POST requests to /auth/login return 401 (invalid credentials)
2. 6th POST request returns 429 (rate limited)
3. Response includes Retry-After header
"""

import sys
import time
import requests
from typing import List, Dict, Any


def test_auth_rate_limiting() -> bool:
    """
    Test rate limiting on /auth/login endpoint.

    Returns:
        True if all tests pass, False otherwise
    """
    base_url = "http://localhost:8000"
    endpoint = f"{base_url}/auth/login"

    # Invalid credentials payload
    payload = {
        "email": "test@example.com",
        "password": "wrongpassword"
    }

    headers = {
        "Content-Type": "application/json"
    }

    print("🧪 Testing rate limiting on /auth/login endpoint...")
    print(f"📍 Endpoint: {endpoint}")
    print(f"🔑 Rate limit: 5 requests/minute")
    print()

    responses: List[Dict[str, Any]] = []

    # Send 6 requests
    for i in range(1, 7):
        try:
            response = requests.post(
                endpoint,
                json=payload,
                headers=headers,
                timeout=5
            )

            responses.append({
                "request_num": i,
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "body": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            })

            print(f"✓ Request {i}: HTTP {response.status_code}")

            # Small delay to ensure requests are distinct
            time.sleep(0.1)

        except requests.exceptions.RequestException as e:
            print(f"❌ Request {i} failed: {e}")
            return False

    print()
    print("=" * 60)
    print("VERIFICATION RESULTS")
    print("=" * 60)
    print()

    # Verify first 5 requests return 401
    all_passed = True

    for i in range(5):
        response = responses[i]
        expected_status = 401
        actual_status = response["status_code"]

        if actual_status == expected_status:
            print(f"✅ Request {i+1}: Expected {expected_status}, Got {actual_status} - PASS")
        else:
            print(f"❌ Request {i+1}: Expected {expected_status}, Got {actual_status} - FAIL")
            all_passed = False

    print()

    # Verify 6th request returns 429
    sixth_response = responses[5]
    expected_status = 429
    actual_status = sixth_response["status_code"]

    if actual_status == expected_status:
        print(f"✅ Request 6: Expected {expected_status} (Rate Limited), Got {actual_status} - PASS")
    else:
        print(f"❌ Request 6: Expected {expected_status} (Rate Limited), Got {actual_status} - FAIL")
        all_passed = False

    print()

    # Verify Retry-After header is present
    retry_after = sixth_response["headers"].get("retry-after") or sixth_response["headers"].get("Retry-After")

    if retry_after:
        print(f"✅ Retry-After header present: {retry_after} seconds - PASS")
    else:
        print(f"❌ Retry-After header missing - FAIL")
        print(f"   Available headers: {list(sixth_response['headers'].keys())}")
        all_passed = False

    print()
    print("=" * 60)

    if all_passed:
        print("🎉 ALL TESTS PASSED")
        print()
        print("Summary:")
        print("  ✓ Requests 1-5 correctly returned 401 (invalid credentials)")
        print("  ✓ Request 6 correctly returned 429 (rate limited)")
        print(f"  ✓ Retry-After header present: {retry_after} seconds")
    else:
        print("❌ SOME TESTS FAILED")
        print()
        print("Summary:")
        print("  Please review the failures above.")

    print("=" * 60)

    return all_passed


if __name__ == "__main__":
    # Check if backend is running
    try:
        response = requests.get("http://localhost:8000/health", timeout=2)
        print(f"✓ Backend is running (health check: {response.status_code})")
        print()
    except requests.exceptions.RequestException:
        print("❌ Backend is not running on http://localhost:8000")
        print("   Please start the backend service first:")
        print("   cd backend && uv run uvicorn app.main:app --reload --port 8000")
        print()
        sys.exit(1)

    # Run the test
    success = test_auth_rate_limiting()

    # Exit with appropriate code
    sys.exit(0 if success else 1)
