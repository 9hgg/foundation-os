import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from libs.utils.crypto import hash_secret, verify_secret
from libs.utils.id import deterministic_uuid
from libs.utils.tokens import create_jwt_token


# Tests for crypto.py
def test_hash_and_verify_secret():
    secret = "my_secret_password"
    hashed = hash_secret(secret)

    assert hashed != secret
    assert verify_secret(secret, hashed) is True
    assert verify_secret("wrong_password", hashed) is False


# Tests for id.py
def test_deterministic_uuid():
    data1 = "test_data"
    data2 = "test_data"
    data3 = "different_data"

    uuid1 = deterministic_uuid(data1)
    uuid2 = deterministic_uuid(data2)
    uuid3 = deterministic_uuid(data3)

    assert isinstance(uuid1, uuid.UUID)
    assert uuid1 == uuid2
    assert uuid1 != uuid3


# Tests for tokens.py
@patch("libs.utils.tokens.TOKENS_SETTINGS")
def test_create_jwt_token(mock_settings):
    # Setup mock settings
    mock_settings.APP_SECRET = "test_secret"
    mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 60
    mock_settings.encoding_algorithm = "HS256"

    token_context_key = "context"
    subject = "user123"

    # Test default expiration
    token = create_jwt_token(token_context_key, subject)
    assert isinstance(token, str)
    assert len(token) > 0

    # Test with custom expiration
    expires_delta = timedelta(minutes=30)
    token_custom = create_jwt_token(token_context_key, subject, expires_delta=expires_delta)
    assert isinstance(token_custom, str)
    assert len(token_custom) > 0

    # Test with extra data
    extra_data = {"role": "admin"}
    token_extra = create_jwt_token(token_context_key, subject, extra_data_to_encode=extra_data)
    assert isinstance(token_extra, str)

    # Verify we can decode (basic check, ideally we would verify signature if we had the key)
    # Since we are mocking settings, we can't easily use jose.jwt.decode with the same key unless we know how it's constructed
    # But we can check if it's a valid JWT structure (header.payload.signature)
    parts = token.split(".")
    assert len(parts) == 3


# Tests for files.py
@patch("libs.utils.files.os.path.isdir")
@patch("libs.utils.files.os.makedirs")
@patch("libs.utils.files.FILES_UTILS_SETTINGS")
def test_files_utils(mock_settings, mock_makedirs, mock_isdir):
    from libs.utils.files import mkdir_p, get_or_create_temp_folder, add_subfolder

    mock_settings.STORAGE_FOLDER = "/tmp/storage"

    # Test mkdir_p
    mkdir_p("/tmp/test")
    mock_makedirs.assert_called_with("/tmp/test")

    # Test mkdir_p with existing error (should pass)
    mock_makedirs.side_effect = OSError(17, "File exists")
    mock_isdir.return_value = True
    mkdir_p("/tmp/test")

    # Test mkdir_p with other error (should raise)
    mock_makedirs.side_effect = OSError(1, "Permission denied")
    with pytest.raises(OSError):
        mkdir_p("/tmp/test")

    # Reset side effect
    mock_makedirs.side_effect = None

    # Test get_or_create_temp_folder
    path = get_or_create_temp_folder("test_folder")
    assert path == "/tmp/storage/test_folder"
    mock_makedirs.assert_called_with("/tmp/storage/test_folder", exist_ok=True)

    # Test add_subfolder
    add_subfolder("/tmp/parent", "child")
    mock_makedirs.assert_called_with("/tmp/parent/child", exist_ok=True)


# Tests for origin.py
def test_get_origin():
    from libs.utils.origin import get_origin
    from unittest.mock import MagicMock

    # Test with no request
    assert get_origin(None, "default") == "default"

    # Test with forward-origin
    req = MagicMock()
    req.headers = {"forward-origin": "https://example.com/some/path"}
    assert get_origin(req) == "https://example.com"

    # Test with ba-origin
    req.headers = {"ba-origin": "https://ba.example.com"}
    assert get_origin(req) == "https://ba.example.com"

    # Test with host header
    req.headers = {"host": "host.example.com"}
    assert get_origin(req) == "host.example.com"

    # Test with no headers but default
    req.headers = {}
    assert get_origin(req, "default") == "default"


# Tests for emails.py
def test_is_email_valid():
    from libs.utils.emails import is_email_valid

    assert is_email_valid("test@example.com") is True
    assert is_email_valid("user.name+tag@example.co.uk") is True
    assert is_email_valid("invalid-email") is False
    assert is_email_valid("user@") is False
    assert is_email_valid("@example.com") is False
    assert is_email_valid("user@example") is False
