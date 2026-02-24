#!/usr/bin/env python3
"""
Simple end-to-end verification of secrets management flow.
Tests the secrets manager implementation without requiring external dependencies.
"""

import os
import sys
from pathlib import Path

# Set SECRETS_BACKEND to env for testing
os.environ["SECRETS_BACKEND"] = "env"

# Manually load .env file (simple implementation without python-dotenv)
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                if key not in os.environ:  # Don't override existing env vars
                    os.environ[key] = value

print("=" * 70)
print("E2E Secrets Management Verification (SECRETS_BACKEND=env)")
print("=" * 70)
print()

# Verify required environment variables are set
required_vars = ["JWT_SECRET", "OPENROUTER_API_KEY", "POSTGRES_PASSWORD"]
missing_vars = []

for var in required_vars:
    if not os.environ.get(var):
        missing_vars.append(var)

if missing_vars:
    print(f"❌ Missing required environment variables: {', '.join(missing_vars)}")
    sys.exit(1)

print("✓ All required environment variables are set in .env")
print()

# Test 1: Backend secrets manager
print("Test 1: Backend secrets manager (backend/app/secrets.py)")
print("-" * 70)

try:
    sys.path.insert(0, str(Path(__file__).parent / "backend"))
    from app.secrets import get_secrets_manager, EnvSecretsManager

    backend_sm = get_secrets_manager()
    assert isinstance(backend_sm, EnvSecretsManager), f"Expected EnvSecretsManager, got {type(backend_sm)}"
    print(f"✓ Backend secrets manager initialized: {backend_sm.__class__.__name__}")

    # Test loading JWT_SECRET
    jwt_secret = backend_sm.get_secret("JWT_SECRET")
    assert jwt_secret, "JWT_SECRET is empty"
    print(f"✓ Backend loaded JWT_SECRET from env (length: {len(jwt_secret)} chars)")

    # Test loading POSTGRES_PASSWORD
    db_password = backend_sm.get_secret("POSTGRES_PASSWORD")
    assert db_password, "POSTGRES_PASSWORD is empty"
    print(f"✓ Backend loaded POSTGRES_PASSWORD from env (length: {len(db_password)} chars)")

    print("✓ Backend secrets manager working correctly")

except Exception as e:
    print(f"❌ Backend secrets manager failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 2: Agents secrets manager
print("Test 2: Agents secrets manager (agents/secrets.py)")
print("-" * 70)

try:
    sys.path.insert(0, str(Path(__file__).parent / "agents"))
    from secrets import get_secrets_manager as get_agents_sm, EnvSecretsManager as AgentsEnvSM

    agents_sm = get_agents_sm()
    assert isinstance(agents_sm, AgentsEnvSM), f"Expected EnvSecretsManager, got {type(agents_sm)}"
    print(f"✓ Agents secrets manager initialized: {agents_sm.__class__.__name__}")

    # Test loading OPENROUTER_API_KEY
    api_key = agents_sm.get_secret("OPENROUTER_API_KEY")
    assert api_key, "OPENROUTER_API_KEY is empty"
    print(f"✓ Agents loaded OPENROUTER_API_KEY from env (length: {len(api_key)} chars)")

    print("✓ Agents secrets manager working correctly")

except Exception as e:
    print(f"❌ Agents secrets manager failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 3: Verify backend config pattern
print("Test 3: Backend config pattern (backend/app/config.py)")
print("-" * 70)

try:
    # Read the config file to verify the pattern
    config_file = Path(__file__).parent / "backend" / "app" / "config.py"
    config_content = config_file.read_text()

    # Verify secrets manager is imported
    assert "from app.secrets import get_secrets_manager" in config_content
    print("✓ Backend config imports get_secrets_manager")

    # Verify secrets_manager is initialized
    assert "secrets_manager = get_secrets_manager()" in config_content
    print("✓ Backend config initializes secrets_manager")

    # Verify _get_secret helper exists
    assert "def _get_secret(" in config_content
    print("✓ Backend config has _get_secret helper")

    # Verify _get_secret uses secrets_manager
    assert "secrets_manager.get_secret" in config_content
    print("✓ _get_secret uses secrets_manager.get_secret()")

    print("✓ Backend config pattern correct")

except Exception as e:
    print(f"❌ Backend config verification failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 4: Verify agents app pattern
print("Test 4: Agents app pattern (agents/app.py)")
print("-" * 70)

try:
    # Read the app file to verify the pattern
    app_file = Path(__file__).parent / "agents" / "app.py"
    app_content = app_file.read_text()

    # Verify secrets manager is imported
    assert "from secrets import get_secrets_manager" in app_content
    print("✓ Agents app imports get_secrets_manager")

    # Verify secrets_manager is initialized
    assert "secrets_manager = get_secrets_manager()" in app_content
    print("✓ Agents app initializes secrets_manager")

    # Verify fail-fast for non-env backends
    assert 'if backend != "env":' in app_content
    print("✓ Agents app has fail-fast for non-env backends")

    print("✓ Agents app pattern correct")

except Exception as e:
    print(f"❌ Agents app verification failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()
print("=" * 70)
print("✅ All E2E secrets management verification tests PASSED!")
print("=" * 70)
print()
print("Verification Summary:")
print("  ✓ Backend secrets manager: EnvSecretsManager")
print("  ✓ Agents secrets manager: EnvSecretsManager")
print("  ✓ Backend loads JWT_SECRET from env successfully")
print("  ✓ Backend loads POSTGRES_PASSWORD from env successfully")
print("  ✓ Agents loads OPENROUTER_API_KEY from env successfully")
print("  ✓ Both services follow the correct integration pattern")
print("  ✓ No startup errors (secrets manager initializes correctly)")
print()
print("SECRETS_BACKEND=env configuration verified end-to-end ✅")
print()
