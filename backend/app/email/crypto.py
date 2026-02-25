"""Encryption service for sensitive data (OAuth tokens, etc.).

Supports key versioning: new ciphertexts are prefixed with ``v<N>:`` where
*N* is the active key version.  Decryption tries the active key first, then
falls back through previous keys in the keyring so that rotation is seamless.
Legacy ciphertexts (no version prefix) are decrypted with the active key for
backward compatibility.
"""

from __future__ import annotations

import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)

# Version prefix format: "v<version>:<ciphertext>"
_VERSION_PREFIX = "v"
_VERSION_SEP = ":"


def _parse_keyring(raw: str | None) -> list[str]:
    """Parse a comma-separated keyring string into a list of keys.

    The first key is the *active* key used for encryption.
    Remaining keys are previous versions kept for decryption only.
    """
    if not raw:
        return []
    return [k.strip() for k in raw.split(",") if k.strip()]


class CryptoService:
    """Fernet symmetric encryption with key versioning.

    Encryption always uses the **active key** (version = len(keyring)).
    Decryption tries versioned lookup first, then falls back through the
    full keyring so that tokens encrypted with older keys still decrypt.

    Key layout (env ``ENCRYPTION_KEY``):
        Single key   – ``<base64-key>``  (version 1, backward compatible)
        Keyring      – ``<active>,<prev>,…``  (leftmost = newest = active)

    Ciphertext format:
        Legacy       – ``<fernet-token>``  (no prefix, decrypted with active key)
        Versioned    – ``v2:<fernet-token>``
    """

    def __init__(self, key: str | None = None):
        raw = key or settings.encryption_key
        if not raw:
            raise ValueError(
                "Encryption key not configured. Set ENCRYPTION_KEY environment variable. "
                "Generate with: python -c "
                '"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )

        keys = _parse_keyring(raw)
        if not keys:
            raise ValueError("ENCRYPTION_KEY must contain at least one key")

        self._keyring: list[Fernet] = [Fernet(k.encode()) for k in keys]
        # Active key is the first in the list; version numbers are 1-based.
        self._active_version: int = len(self._keyring)

    @property
    def active_version(self) -> int:
        return self._active_version

    def encrypt(self, plaintext: str) -> str:
        """Encrypt with the active key and prepend the version tag."""
        ciphertext = self._keyring[0].encrypt(plaintext.encode()).decode()
        return f"{_VERSION_PREFIX}{self._active_version}{_VERSION_SEP}{ciphertext}"

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt a ciphertext, handling both versioned and legacy formats."""
        version, raw_ct = self._split_version(ciphertext)

        if version is not None:
            # Try the specific version key first (1-based → 0-based index).
            idx = len(self._keyring) - version
            if 0 <= idx < len(self._keyring):
                try:
                    return self._keyring[idx].decrypt(raw_ct.encode()).decode()
                except InvalidToken:
                    pass  # fall through to brute-force

        # Brute-force: try all keys (handles edge cases like re-encrypted data).
        for fernet in self._keyring:
            try:
                return fernet.decrypt(raw_ct.encode()).decode()
            except InvalidToken:
                continue

        raise ValueError("Failed to decrypt: invalid token or no matching key in keyring")

    # ------------------------------------------------------------------

    @staticmethod
    def _split_version(ciphertext: str) -> tuple[int | None, str]:
        """Split ``v<N>:<payload>`` into (version, payload).

        Returns ``(None, original)`` for legacy ciphertexts.
        """
        if ciphertext.startswith(_VERSION_PREFIX) and _VERSION_SEP in ciphertext:
            prefix, _, rest = ciphertext.partition(_VERSION_SEP)
            tag = prefix[len(_VERSION_PREFIX) :]
            if tag.isdigit():
                return int(tag), rest
        return None, ciphertext
