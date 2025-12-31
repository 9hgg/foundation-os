import pytest
from unittest.mock import MagicMock
from libs.auth.providers.auth_provider_manager import (
    AuthProvidersManager,
    AlreadyEnlistedAuthProviderError,
    AuthProviderNotFoundError,
    EnlistedAuthProvider,
)


def test_auth_provider_manager():
    # Reset auth_providers
    AuthProvidersManager.auth_providers = {}

    # Define a dummy auth provider
    @AuthProvidersManager.enlist_auth_provider(auth_provider_name="test_provider")
    def dummy_provider(data, is_admin, db):
        return "result"

    # Test enlistment
    assert "test_provider" in AuthProvidersManager.auth_providers
    assert AuthProvidersManager.auth_providers["test_provider"].auth_provider == dummy_provider

    # Test retrieval
    provider = AuthProvidersManager.get_auth_provider("test_provider")
    assert provider == dummy_provider
    assert provider(None, False, None) == "result"

    # Test retrieval not found
    assert AuthProvidersManager.get_auth_provider("unknown") is None

    # Test duplicate enlistment (should not raise, just return)
    @AuthProvidersManager.enlist_auth_provider(auth_provider_name="test_provider")
    def dummy_provider_2():
        pass

    assert AuthProvidersManager.auth_providers["test_provider"].auth_provider == dummy_provider


def test_exceptions():
    err = AlreadyEnlistedAuthProviderError("test")
    assert str(err) == "AuthProvider 'test' is already enlisted."

    err = AuthProviderNotFoundError("test")
    assert str(err) == "AuthProvider 'test' not found."
