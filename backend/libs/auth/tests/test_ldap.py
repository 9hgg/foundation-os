import uuid
from unittest.mock import MagicMock, patch

import pytest

from libs.auth.providers.ldap import (
    EmailNotFoundError,
    InvalidLDAPDataError,
    LDAPAuthenticatedUser,
    NoLDAPDataError,
    process_token,
)
from libs.users.models import User


@patch("libs.auth.providers.ldap.User")
@patch("libs.auth.providers.ldap.libs.utils.tokens.create_jwt_token")
@patch("libs.auth.providers.ldap.LDAPProvider.authenticate")
@patch("libs.auth.providers.ldap.context_db")
def test_process_token(
    mock_context_db,
    mock_authenticate,
    mock_create_token,
    mock_user,
):
    db = MagicMock()
    mock_context_db.return_value.__enter__.return_value = db
    mock_create_token.return_value = "jwt_token"

    with pytest.raises(NoLDAPDataError):
        process_token({})

    with pytest.raises(NoLDAPDataError):
        process_token({"login": "alice"})

    mock_authenticate.side_effect = InvalidLDAPDataError()
    with pytest.raises(InvalidLDAPDataError):
        process_token({"login": "alice", "password": "secret"})

    mock_authenticate.side_effect = EmailNotFoundError()
    with pytest.raises(EmailNotFoundError):
        process_token({"login": "alice", "password": "secret"})

    mock_authenticate.side_effect = None
    mock_authenticate.return_value = LDAPAuthenticatedUser(
        email="test@example.com",
        first_name="Test",
        last_name="User",
        display_name="Test User",
        dn="cn=test,dc=example,dc=com",
    )

    user_db = User(
        id=uuid.uuid4(),
        email="test@example.com",
        email_verified=True,
        first_name="Test",
        last_name="User",
        pseudo="testuser",
        password_hashed="hashed",
    )
    mock_user.patch = MagicMock()
    mock_user.get_first_by.return_value = user_db

    result = process_token({"login": "alice", "password": "secret"})
    assert result.auth_token == "jwt_token"
    assert result.user == user_db
    assert result.status == "registered"

    user_db.email_verified = False
    process_token({"login": "alice", "password": "secret"})
    mock_user.patch.assert_called_with(
        obj_id=user_db.id,
        update_dict={"email_verified": True},
        _db=None,
    )

    mock_user.get_first_by.return_value = None
    result = process_token({"login": "alice", "password": "secret"}, register_user=False)
    assert result.auth_token is None
    assert result.user is None
    assert result.status == "unregistered"

    new_user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        email_verified=True,
        first_name="Test",
        last_name="User",
        pseudo="testuser",
        password_hashed="hashed",
    )
    mock_user.return_value = new_user

    config_class_mock = MagicMock()
    config_instance_mock = MagicMock()
    config_instance_mock.model_dump.return_value = {}
    config_class_mock.return_value = config_instance_mock
    mock_user.__config_type__ = config_class_mock

    result = process_token({"login": "alice", "password": "secret"}, register_user=True)
    assert result.auth_token == "jwt_token"
    assert result.user == new_user
    db.add.assert_called_with(new_user)
    db.commit.assert_called()
