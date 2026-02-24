"""Unit tests for secrets management (VaultSecretsManager and AWSSecretsManager)."""

import os
import time
from unittest.mock import MagicMock, patch

import pytest

from app.secrets import (
    AWSSecretsManager,
    EnvSecretsManager,
    VaultSecretsManager,
    get_secrets_manager,
)

# =============================================================================
# VaultSecretsManager Tests
# =============================================================================


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_vault_secrets_manager_initialization(mock_hvac_client):
    """Test VaultSecretsManager initializes correctly with valid credentials."""
    # Mock the hvac Client
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = True
    mock_hvac_client.return_value = mock_client

    # Initialize VaultSecretsManager
    manager = VaultSecretsManager()

    # Verify Client was called with correct parameters
    mock_hvac_client.assert_called_once_with(
        url="http://vault.test:8200", token="test-token"
    )
    mock_client.is_authenticated.assert_called_once()

    # Verify cache is initialized
    assert manager._cache == {}
    assert manager._cache_ttl == 300


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_vault_get_secret_success(mock_hvac_client):
    """Test VaultSecretsManager retrieves secret successfully."""
    # Mock the hvac Client
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = True
    mock_client.secrets.kv.v2.read_secret_version.return_value = {
        "data": {"data": {"value": "secret-value-123"}}
    }
    mock_hvac_client.return_value = mock_client

    # Initialize manager and get secret
    manager = VaultSecretsManager()
    result = manager.get_secret("database/password")

    # Verify result
    assert result == "secret-value-123"
    mock_client.secrets.kv.v2.read_secret_version.assert_called_once_with(
        path="database/password"
    )


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_vault_get_secret_caching(mock_hvac_client):
    """Test VaultSecretsManager caches secrets for 5 minutes."""
    # Mock the hvac Client
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = True
    mock_client.secrets.kv.v2.read_secret_version.return_value = {
        "data": {"data": {"value": "cached-secret"}}
    }
    mock_hvac_client.return_value = mock_client

    # Initialize manager
    manager = VaultSecretsManager()

    # First call - should hit Vault
    result1 = manager.get_secret("api/key")
    assert result1 == "cached-secret"
    assert mock_client.secrets.kv.v2.read_secret_version.call_count == 1

    # Second call - should use cache
    result2 = manager.get_secret("api/key")
    assert result2 == "cached-secret"
    assert mock_client.secrets.kv.v2.read_secret_version.call_count == 1  # Not called again


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_vault_cache_expiration(mock_hvac_client):
    """Test VaultSecretsManager cache expires after 5 minutes."""
    # Mock the hvac Client
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = True
    mock_client.secrets.kv.v2.read_secret_version.return_value = {
        "data": {"data": {"value": "secret-value"}}
    }
    mock_hvac_client.return_value = mock_client

    # Initialize manager with shorter TTL for testing
    manager = VaultSecretsManager()
    manager._cache_ttl = 1  # 1 second TTL for testing

    # First call
    result1 = manager.get_secret("test/key")
    assert result1 == "secret-value"

    # Wait for cache to expire
    time.sleep(1.1)

    # Second call - should hit Vault again
    result2 = manager.get_secret("test/key")
    assert result2 == "secret-value"
    assert mock_client.secrets.kv.v2.read_secret_version.call_count == 2


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_vault_get_secrets_batch(mock_hvac_client):
    """Test VaultSecretsManager retrieves multiple secrets."""
    # Mock the hvac Client
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = True
    mock_client.secrets.kv.v2.read_secret_version.side_effect = [
        {"data": {"data": {"value": "secret1"}}},
        {"data": {"data": {"value": "secret2"}}},
    ]
    mock_hvac_client.return_value = mock_client

    # Initialize manager and get batch
    manager = VaultSecretsManager()
    result = manager.get_secrets_batch(["key1", "key2"])

    # Verify results
    assert result == {"key1": "secret1", "key2": "secret2"}
    assert mock_client.secrets.kv.v2.read_secret_version.call_count == 2


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_vault_authentication_failure(mock_hvac_client):
    """Test VaultSecretsManager raises error on authentication failure."""
    # Mock the hvac Client with failed authentication
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = False
    mock_hvac_client.return_value = mock_client

    # Should raise ConnectionError
    with pytest.raises(ConnectionError, match="Failed to authenticate with Vault"):
        VaultSecretsManager()


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200"}, clear=True)
@patch("hvac.Client")
def test_vault_missing_token(mock_hvac_client):
    """Test VaultSecretsManager raises error when VAULT_TOKEN is missing."""
    with pytest.raises(ValueError, match="VAULT_TOKEN environment variable required"):
        VaultSecretsManager()


@patch.dict(os.environ, {"VAULT_ADDR": "http://vault.test:8200", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_vault_get_secret_failure(mock_hvac_client):
    """Test VaultSecretsManager handles secret retrieval errors."""
    # Mock the hvac Client
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = True
    mock_client.secrets.kv.v2.read_secret_version.side_effect = Exception(
        "Secret not found"
    )
    mock_hvac_client.return_value = mock_client

    # Initialize manager
    manager = VaultSecretsManager()

    # Should raise exception
    with pytest.raises(Exception, match="Secret not found"):
        manager.get_secret("nonexistent/key")


# =============================================================================
# AWSSecretsManager Tests
# =============================================================================


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-west-2"})
@patch("boto3.client")
def test_aws_secrets_manager_initialization(mock_boto3_client):
    """Test AWSSecretsManager initializes correctly."""
    # Mock boto3 client
    mock_client = MagicMock()
    mock_boto3_client.return_value = mock_client

    # Initialize AWSSecretsManager
    manager = AWSSecretsManager()

    # Verify boto3 client was created with correct region
    mock_boto3_client.assert_called_once_with(
        "secretsmanager", region_name="us-west-2"
    )

    # Verify cache is initialized
    assert manager._cache == {}
    assert manager._cache_ttl == 300


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_get_secret_success(mock_boto3_client):
    """Test AWSSecretsManager retrieves secret successfully."""
    # Mock boto3 client
    mock_client = MagicMock()
    mock_client.get_secret_value.return_value = {
        "SecretString": "my-secret-value"
    }
    mock_boto3_client.return_value = mock_client

    # Initialize manager and get secret
    manager = AWSSecretsManager()
    result = manager.get_secret("database/password")

    # Verify result
    assert result == "my-secret-value"
    mock_client.get_secret_value.assert_called_once_with(
        SecretId="database/password"
    )


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_get_secret_caching(mock_boto3_client):
    """Test AWSSecretsManager caches secrets for 5 minutes."""
    # Mock boto3 client
    mock_client = MagicMock()
    mock_client.get_secret_value.return_value = {
        "SecretString": "cached-secret"
    }
    mock_boto3_client.return_value = mock_client

    # Initialize manager
    manager = AWSSecretsManager()

    # First call - should hit AWS
    result1 = manager.get_secret("api/key")
    assert result1 == "cached-secret"
    assert mock_client.get_secret_value.call_count == 1

    # Second call - should use cache
    result2 = manager.get_secret("api/key")
    assert result2 == "cached-secret"
    assert mock_client.get_secret_value.call_count == 1  # Not called again


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_cache_expiration(mock_boto3_client):
    """Test AWSSecretsManager cache expires after 5 minutes."""
    # Mock boto3 client
    mock_client = MagicMock()
    mock_client.get_secret_value.return_value = {
        "SecretString": "secret-value"
    }
    mock_boto3_client.return_value = mock_client

    # Initialize manager with shorter TTL for testing
    manager = AWSSecretsManager()
    manager._cache_ttl = 1  # 1 second TTL for testing

    # First call
    result1 = manager.get_secret("test/key")
    assert result1 == "secret-value"

    # Wait for cache to expire
    time.sleep(1.1)

    # Second call - should hit AWS again
    result2 = manager.get_secret("test/key")
    assert result2 == "secret-value"
    assert mock_client.get_secret_value.call_count == 2


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_get_secrets_batch(mock_boto3_client):
    """Test AWSSecretsManager retrieves multiple secrets."""
    # Mock boto3 client
    mock_client = MagicMock()
    mock_client.get_secret_value.side_effect = [
        {"SecretString": "secret1"},
        {"SecretString": "secret2"},
    ]
    mock_boto3_client.return_value = mock_client

    # Initialize manager and get batch
    manager = AWSSecretsManager()
    result = manager.get_secrets_batch(["key1", "key2"])

    # Verify results
    assert result == {"key1": "secret1", "key2": "secret2"}
    assert mock_client.get_secret_value.call_count == 2


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_binary_secret_error(mock_boto3_client):
    """Test AWSSecretsManager raises error for binary secrets."""
    # Mock boto3 client returning binary secret
    mock_client = MagicMock()
    mock_client.get_secret_value.return_value = {
        "SecretBinary": b"binary-secret"
    }
    mock_boto3_client.return_value = mock_client

    # Initialize manager
    manager = AWSSecretsManager()

    # Should raise ValueError for binary secrets
    with pytest.raises(ValueError, match="is binary, not string"):
        manager.get_secret("binary/key")


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_resource_not_found(mock_boto3_client):
    """Test AWSSecretsManager handles ResourceNotFoundException."""
    from botocore.exceptions import ClientError

    # Mock boto3 client
    mock_client = MagicMock()
    error_response = {"Error": {"Code": "ResourceNotFoundException"}}
    mock_client.get_secret_value.side_effect = ClientError(
        error_response, "GetSecretValue"
    )
    mock_boto3_client.return_value = mock_client

    # Initialize manager
    manager = AWSSecretsManager()
    manager.ClientError = ClientError

    # Should raise ClientError
    with pytest.raises(ClientError):
        manager.get_secret("nonexistent/key")


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_decryption_failure(mock_boto3_client):
    """Test AWSSecretsManager handles DecryptionFailure."""
    from botocore.exceptions import ClientError

    # Mock boto3 client
    mock_client = MagicMock()
    error_response = {"Error": {"Code": "DecryptionFailure"}}
    mock_client.get_secret_value.side_effect = ClientError(
        error_response, "GetSecretValue"
    )
    mock_boto3_client.return_value = mock_client

    # Initialize manager
    manager = AWSSecretsManager()
    manager.ClientError = ClientError

    # Should raise ClientError
    with pytest.raises(ClientError):
        manager.get_secret("encrypted/key")


@patch.dict(os.environ, {"AWS_DEFAULT_REGION": "us-east-1"})
@patch("boto3.client")
def test_aws_internal_service_error(mock_boto3_client):
    """Test AWSSecretsManager handles InternalServiceError."""
    from botocore.exceptions import ClientError

    # Mock boto3 client
    mock_client = MagicMock()
    error_response = {"Error": {"Code": "InternalServiceError"}}
    mock_client.get_secret_value.side_effect = ClientError(
        error_response, "GetSecretValue"
    )
    mock_boto3_client.return_value = mock_client

    # Initialize manager
    manager = AWSSecretsManager()
    manager.ClientError = ClientError

    # Should raise ClientError
    with pytest.raises(ClientError):
        manager.get_secret("api/key")


# =============================================================================
# EnvSecretsManager Tests
# =============================================================================


@patch.dict(os.environ, {"TEST_SECRET": "test-value"})
def test_env_secrets_manager_get_secret():
    """Test EnvSecretsManager retrieves secrets from environment."""
    manager = EnvSecretsManager()
    result = manager.get_secret("TEST_SECRET")
    assert result == "test-value"


@patch.dict(os.environ, {}, clear=True)
def test_env_secrets_manager_missing_key():
    """Test EnvSecretsManager raises error for missing env var."""
    manager = EnvSecretsManager()
    with pytest.raises(ValueError, match="Environment variable .* not set"):
        manager.get_secret("MISSING_KEY")


@patch.dict(os.environ, {"KEY1": "value1", "KEY2": "value2"})
def test_env_secrets_manager_batch():
    """Test EnvSecretsManager retrieves batch of secrets."""
    manager = EnvSecretsManager()
    result = manager.get_secrets_batch(["KEY1", "KEY2"])
    assert result == {"KEY1": "value1", "KEY2": "value2"}


# =============================================================================
# Factory Function Tests
# =============================================================================


@patch.dict(os.environ, {"SECRETS_BACKEND": "env", "TEST_KEY": "test-value"})
def test_get_secrets_manager_env():
    """Test get_secrets_manager returns EnvSecretsManager for 'env' backend."""
    manager = get_secrets_manager()
    assert isinstance(manager, EnvSecretsManager)
    assert manager.get_secret("TEST_KEY") == "test-value"


@patch.dict(os.environ, {"SECRETS_BACKEND": "vault", "VAULT_TOKEN": "test-token"})
@patch("hvac.Client")
def test_get_secrets_manager_vault(mock_hvac_client):
    """Test get_secrets_manager returns VaultSecretsManager for 'vault' backend."""
    mock_client = MagicMock()
    mock_client.is_authenticated.return_value = True
    mock_hvac_client.return_value = mock_client

    manager = get_secrets_manager()
    assert isinstance(manager, VaultSecretsManager)


@patch.dict(os.environ, {"SECRETS_BACKEND": "aws"})
@patch("boto3.client")
def test_get_secrets_manager_aws(mock_boto3_client):
    """Test get_secrets_manager returns AWSSecretsManager for 'aws' backend."""
    mock_boto3_client.return_value = MagicMock()

    manager = get_secrets_manager()
    assert isinstance(manager, AWSSecretsManager)


@patch.dict(os.environ, {"SECRETS_BACKEND": "invalid"})
def test_get_secrets_manager_invalid_backend():
    """Test get_secrets_manager raises error for invalid backend."""
    with pytest.raises(ValueError, match="Unknown secrets backend: invalid"):
        get_secrets_manager()


@patch.dict(os.environ, {}, clear=True)
def test_get_secrets_manager_default_env():
    """Test get_secrets_manager defaults to 'env' backend when not specified."""
    manager = get_secrets_manager()
    assert isinstance(manager, EnvSecretsManager)
