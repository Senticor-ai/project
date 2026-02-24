"""Rate limiting configuration using SlowAPI.

This module provides rate limiting functionality for API endpoints using SlowAPI.
The limiter uses the client's IP address as the key for rate limiting.

For production deployments with multiple instances, configure Redis storage
backend via REDIS_URL environment variable. For local development, the in-memory
storage backend is used by default.

Rate limiting is automatically disabled during tests (when TESTING env var is set).
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Disable rate limiting during tests
_enabled = os.environ.get("TESTING") != "true"

# Initialize limiter with IP-based rate limiting
# Storage backend (Redis vs in-memory) is configured when attaching to app.state
limiter = Limiter(key_func=get_remote_address, enabled=_enabled)
