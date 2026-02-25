"""Tests for email crypto service — Fernet encrypt/decrypt round-trip and key rotation."""

import pytest
from cryptography.fernet import Fernet

from app.email.crypto import CryptoService

pytestmark = pytest.mark.unit


def _gen_key() -> str:
    return Fernet.generate_key().decode()


@pytest.fixture()
def key():
    return _gen_key()


@pytest.fixture()
def crypto(key):
    return CryptoService(key=key)


class TestCryptoService:
    def test_encrypt_decrypt_roundtrip(self, crypto):
        plaintext = "my-secret-oauth-token"
        ciphertext = crypto.encrypt(plaintext)
        assert ciphertext != plaintext
        assert crypto.decrypt(ciphertext) == plaintext

    def test_encrypt_produces_different_ciphertext_each_time(self, crypto):
        plaintext = "same-input"
        c1 = crypto.encrypt(plaintext)
        c2 = crypto.encrypt(plaintext)
        assert c1 != c2  # Fernet includes random IV
        assert crypto.decrypt(c1) == plaintext
        assert crypto.decrypt(c2) == plaintext

    def test_decrypt_invalid_ciphertext_raises(self, crypto):
        with pytest.raises(ValueError, match="Failed to decrypt"):
            crypto.decrypt("not-valid-base64-ciphertext")

    def test_decrypt_with_wrong_key_raises(self, crypto):
        ciphertext = crypto.encrypt("secret")
        other_key = _gen_key()
        other_crypto = CryptoService(key=other_key)
        with pytest.raises(ValueError, match="no matching key"):
            other_crypto.decrypt(ciphertext)

    def test_no_key_raises_value_error(self, monkeypatch):
        from dataclasses import replace as dc_replace

        from app.config import settings

        no_key = dc_replace(settings, encryption_key=None)
        monkeypatch.setattr("app.email.crypto.settings", no_key)
        with pytest.raises(ValueError, match="Encryption key not configured"):
            CryptoService(key=None)

    def test_empty_string_encrypt_decrypt(self, crypto):
        ciphertext = crypto.encrypt("")
        assert crypto.decrypt(ciphertext) == ""

    def test_unicode_roundtrip(self, crypto):
        plaintext = "Sehr geehrte Frau Muller, umlauts: auoe"
        assert crypto.decrypt(crypto.encrypt(plaintext)) == plaintext


class TestKeyVersioning:
    """Versioned ciphertext format: v<N>:<fernet-token>."""

    def test_single_key_version_is_one(self):
        svc = CryptoService(key=_gen_key())
        assert svc.active_version == 1

    def test_encrypt_adds_version_prefix(self):
        svc = CryptoService(key=_gen_key())
        ct = svc.encrypt("data")
        assert ct.startswith("v1:")

    def test_legacy_ciphertext_still_decrypts(self):
        """Pre-rotation ciphertexts (no version prefix) must still work."""
        key = _gen_key()
        fernet = Fernet(key.encode())
        legacy_ct = fernet.encrypt(b"legacy-secret").decode()
        svc = CryptoService(key=key)
        assert svc.decrypt(legacy_ct) == "legacy-secret"


class TestKeyRotation:
    """Two-key keyring: active (new) + previous (old)."""

    def test_new_key_encrypts_with_latest_version(self):
        old_key = _gen_key()
        new_key = _gen_key()
        svc = CryptoService(key=f"{new_key},{old_key}")
        assert svc.active_version == 2
        ct = svc.encrypt("rotated")
        assert ct.startswith("v2:")
        assert svc.decrypt(ct) == "rotated"

    def test_old_versioned_ciphertext_decrypts(self):
        old_key = _gen_key()
        new_key = _gen_key()
        # Encrypt with old key (version 1)
        old_svc = CryptoService(key=old_key)
        old_ct = old_svc.encrypt("old-secret")
        assert old_ct.startswith("v1:")

        # Decrypt with rotated keyring
        new_svc = CryptoService(key=f"{new_key},{old_key}")
        assert new_svc.decrypt(old_ct) == "old-secret"

    def test_legacy_ciphertext_decrypts_with_keyring(self):
        old_key = _gen_key()
        new_key = _gen_key()
        fernet = Fernet(old_key.encode())
        legacy_ct = fernet.encrypt(b"legacy").decode()

        svc = CryptoService(key=f"{new_key},{old_key}")
        assert svc.decrypt(legacy_ct) == "legacy"

    def test_wrong_key_raises(self):
        svc = CryptoService(key=_gen_key())
        other = CryptoService(key=_gen_key())
        ct = other.encrypt("secret")
        with pytest.raises(ValueError, match="no matching key"):
            svc.decrypt(ct)


class TestThreeKeyRotation:
    """Three-key keyring to verify multi-generation rotation."""

    def test_all_versions_decrypt(self):
        k1 = _gen_key()
        k2 = _gen_key()
        k3 = _gen_key()

        svc1 = CryptoService(key=k1)
        ct1 = svc1.encrypt("gen1")

        svc2 = CryptoService(key=f"{k2},{k1}")
        ct2 = svc2.encrypt("gen2")

        svc3 = CryptoService(key=f"{k3},{k2},{k1}")
        assert svc3.active_version == 3
        ct3 = svc3.encrypt("gen3")

        assert svc3.decrypt(ct1) == "gen1"
        assert svc3.decrypt(ct2) == "gen2"
        assert svc3.decrypt(ct3) == "gen3"

    def test_encrypt_uses_active_key_only(self):
        k1 = _gen_key()
        k2 = _gen_key()
        k3 = _gen_key()
        svc = CryptoService(key=f"{k3},{k2},{k1}")
        ct = svc.encrypt("data")
        assert ct.startswith("v3:")
