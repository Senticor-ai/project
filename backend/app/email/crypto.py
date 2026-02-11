"""Encryption service for sensitive data (OAuth tokens, etc.)."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class CryptoService:
    """Fernet symmetric encryption for OAuth tokens at rest."""

    def __init__(self, key: str | None = None):
        key = key or settings.encryption_key
        if not key:
            raise ValueError(
                "Encryption key not configured. Set ENCRYPTION_KEY environment variable. "
                "Generate with: python -c "
                '"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        self._fernet = Fernet(key.encode())

    def encrypt(self, plaintext: str) -> str:
        """Encrypt plaintext and return base64-encoded ciphertext."""
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt base64-encoded ciphertext and return plaintext."""
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as e:
            raise ValueError("Failed to decrypt: invalid token or key") from e
