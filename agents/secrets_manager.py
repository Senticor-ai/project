import logging
import os
import time
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class SecretsManager(ABC):
    """Abstract base class for secrets management backends."""

    @abstractmethod
    def get_secret(self, key: str) -> str:
        """Retrieve a single secret by key."""
        pass

    @abstractmethod
    def get_secrets_batch(self, keys: list[str]) -> dict[str, str]:
        """Retrieve multiple secrets at once."""
        pass


class VaultSecretsManager(SecretsManager):
    """HashiCorp Vault implementation using hvac."""

    def __init__(self):
        try:
            import hvac
        except ImportError as e:
            raise ImportError("hvac package not installed. Install with: pip install hvac") from e

        vault_addr = os.environ.get("VAULT_ADDR", "http://localhost:8200")
        vault_token = os.environ.get("VAULT_TOKEN")

        if not vault_token:
            raise ValueError("VAULT_TOKEN environment variable required for Vault backend")

        self.client = hvac.Client(url=vault_addr, token=vault_token)

        # Verify connection
        if not self.client.is_authenticated():
            raise ConnectionError(f"Failed to authenticate with Vault at {vault_addr}")

        logger.info(f"Initialized Vault secrets manager at {vault_addr}")

        # In-memory cache with 5-minute TTL
        self._cache: dict[str, tuple[str, float]] = {}
        self._cache_ttl = 300  # 5 minutes

    def _get_from_cache(self, key: str) -> str | None:
        """Get secret from cache if not expired."""
        if key in self._cache:
            value, timestamp = self._cache[key]
            if time.time() - timestamp < self._cache_ttl:
                return value
            else:
                # Expired, remove from cache
                del self._cache[key]
        return None

    def _set_cache(self, key: str, value: str) -> None:
        """Store secret in cache with current timestamp."""
        self._cache[key] = (value, time.time())

    def get_secret(self, key: str) -> str:
        # Check cache first
        cached_value = self._get_from_cache(key)
        if cached_value is not None:
            return cached_value

        try:
            response = self.client.secrets.kv.v2.read_secret_version(path=key)
            value = response["data"]["data"]["value"]
            self._set_cache(key, value)
            return value
        except Exception as e:
            logger.error(f"Failed to retrieve secret {key} from Vault: {e}")
            raise

    def get_secrets_batch(self, keys: list[str]) -> dict[str, str]:
        return {key: self.get_secret(key) for key in keys}


class AWSSecretsManager(SecretsManager):
    """AWS Secrets Manager implementation using boto3."""

    def __init__(self):
        try:
            import boto3
            from botocore.exceptions import ClientError
        except ImportError as e:
            raise ImportError("boto3 package not installed. Install with: pip install boto3") from e

        region = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

        try:
            self.client = boto3.client("secretsmanager", region_name=region)
            self.ClientError = ClientError
            logger.info(f"Initialized AWS Secrets Manager in region {region}")
        except Exception as e:
            logger.error(f"Failed to initialize AWS Secrets Manager: {e}")
            raise

        # In-memory cache with 5-minute TTL
        self._cache: dict[str, tuple[str, float]] = {}
        self._cache_ttl = 300  # 5 minutes

    def _get_from_cache(self, key: str) -> str | None:
        """Get secret from cache if not expired."""
        if key in self._cache:
            value, timestamp = self._cache[key]
            if time.time() - timestamp < self._cache_ttl:
                return value
            else:
                # Expired, remove from cache
                del self._cache[key]
        return None

    def _set_cache(self, key: str, value: str) -> None:
        """Store secret in cache with current timestamp."""
        self._cache[key] = (value, time.time())

    def get_secret(self, key: str) -> str:
        # Check cache first
        cached_value = self._get_from_cache(key)
        if cached_value is not None:
            return cached_value

        try:
            response = self.client.get_secret_value(SecretId=key)
            if "SecretString" in response:
                value = response["SecretString"]
                self._set_cache(key, value)
                return value
            else:
                raise ValueError(f"Secret {key} is binary, not string")
        except self.ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code == "ResourceNotFoundException":
                logger.error(f"Secret {key} not found in AWS Secrets Manager")
            elif error_code == "DecryptionFailure":
                logger.error(f"Failed to decrypt secret {key}")
            elif error_code == "InternalServiceError":
                logger.error(f"AWS Secrets Manager internal error for {key}")
            raise

    def get_secrets_batch(self, keys: list[str]) -> dict[str, str]:
        return {key: self.get_secret(key) for key in keys}


class EnvSecretsManager(SecretsManager):
    """Environment variable fallback for development (not recommended for production)."""

    def __init__(self):
        logger.warning("Using environment variables for secrets (not recommended for production)")

    def get_secret(self, key: str) -> str:
        value = os.environ.get(key)
        if value is None:
            raise ValueError(f"Environment variable {key} not set")
        return value

    def get_secrets_batch(self, keys: list[str]) -> dict[str, str]:
        return {key: self.get_secret(key) for key in keys}


def get_secrets_manager() -> SecretsManager:
    """Factory function to create secrets manager based on SECRETS_BACKEND env var."""
    backend = os.environ.get("SECRETS_BACKEND", "env").lower()

    if backend == "vault":
        return VaultSecretsManager()
    elif backend == "aws":
        return AWSSecretsManager()
    elif backend == "env":
        return EnvSecretsManager()
    else:
        raise ValueError(f"Unknown secrets backend: {backend}. Use 'vault', 'aws', or 'env'")
