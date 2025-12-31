from unittest.mock import MagicMock, patch
import pytest
from libs.users.methods import get_current_user_optional, _get_user_display_info


@patch("libs.users.methods.jwt.decode")
@patch("libs.users.methods.User.by_id")
@patch("libs.users.methods.USER_CACHE")
def test_get_current_user_optional(mock_cache, mock_by_id, mock_jwt_decode):
    # Test with no token
    assert get_current_user_optional(None) is None

    # Test with invalid token (JWTError)
    from jose.exceptions import JWTError

    mock_jwt_decode.side_effect = JWTError()
    assert get_current_user_optional("invalid_token") is None

    # Test with valid token but no sub
    mock_jwt_decode.side_effect = None
    mock_jwt_decode.return_value = {}
    mock_cache.get.return_value = None
    assert get_current_user_optional("valid_token") is None

    # Test with valid token and user found
    mock_jwt_decode.return_value = {"sub": "user_id"}
    mock_user = MagicMock()
    mock_by_id.return_value = mock_user
    assert get_current_user_optional("valid_token") == mock_user

    # Test with cache hit
    mock_cache.get.return_value = mock_user
    assert get_current_user_optional("valid_token") == mock_user


@patch("libs.users.methods.User.by_id")
def test_get_user_display_info(mock_by_id):
    # Test user not found
    mock_by_id.return_value = None
    assert _get_user_display_info("unknown_id") == ("Unknown user", "")

    # Test user with pseudo
    mock_user = MagicMock()
    mock_user.pseudo = "MyPseudo"
    mock_user.email = "test@example.com"
    mock_by_id.return_value = mock_user
    assert _get_user_display_info("user_id") == ("MyPseudo", "t***t@e***")

    # Test user without pseudo, fallback to email
    mock_user.pseudo = None
    mock_user.email = "test@example.com"
    assert _get_user_display_info("user_id") == ("test", "t***t@e***")

    # Test user with short email
    mock_user.email = "a@b.c"
    assert _get_user_display_info("user_id") == ("a", "a@b.c")

    # Test exception handling
    mock_by_id.side_effect = Exception("DB Error")
    assert _get_user_display_info("user_id") == ("Unknown user", "")
