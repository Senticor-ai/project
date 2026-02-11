"""Tests for email crypto service — Fernet encrypt/decrypt round-trip."""

import pytest
from cryptography.fernet import Fernet

from app.email.crypto import CryptoService


@pytest.fixture()
def key():
    return Fernet.generate_key().decode()


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
        other_key = Fernet.generate_key().decode()
        other_crypto = CryptoService(key=other_key)
        with pytest.raises(ValueError, match="Failed to decrypt"):
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
