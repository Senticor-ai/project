"""Rate limiting configuration using SlowAPI.

This module provides rate limiting functionality for API endpoints using SlowAPI.
The limiter uses the client's IP address as the key for rate limiting.

For production deployments with multiple instances, configure Redis storage
backend via REDIS_URL environment variable. For local development, the in-memory
storage backend is used by default.

Rate limiting can be disabled for tests by setting TESTING=true.
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_enabled = os.environ.get("TESTING") != "true"
_storage_uri = os.environ.get("REDIS_URL", "").strip() or "memory://"

# Initialize limiter with IP-based rate limiting.
# Use Redis when REDIS_URL is configured so limits are shared across workers/instances.
limiter = Limiter(
    key_func=get_remote_address,
    enabled=_enabled,
    storage_uri=_storage_uri,
)
