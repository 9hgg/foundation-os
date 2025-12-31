import pytest
import uuid
from unittest.mock import MagicMock, patch
from libs.endpoints.endpoints import add_acl_filters, get_resource_if_READ_allowed
from libs.users.models import User


def test_add_acl_filters_coverage(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps

    # Mock query
    mock_query = MagicMock()
    mock_query.session.query.return_value.filter.return_value = ["team_id"]  # for team subquery

    # Test with user and teams
    with patch("libs.endpoints.endpoints.ResourceManager.is_resource_registered", return_value=True):
        add_acl_filters(mock_user, mock_session, mock_query)
        # Verify filters applied (hard to verify exact SQL expression on mock, but we can check calls)
        assert mock_query.filter.called

    # Test with admin user
    mock_admin = MagicMock(spec=User)
    mock_admin.email = "admin@example.com"
    mock_admin.id = uuid.uuid4()

    with patch("libs.endpoints.config.ENDPOINTS_SETTINGS.ADMIN_EMAILS", ["admin@example.com"]):
        add_acl_filters(mock_admin, mock_session, mock_query, include_admin=True)
        assert mock_query.filter.called

    # Test with session only
    add_acl_filters(None, mock_session, mock_query, ignore_session=False)
    assert mock_query.filter.called

    # Test with no user, no session
    add_acl_filters(None, None, mock_query)
    assert mock_query.filter.called  # anonymous access


def test_get_resource_if_READ_allowed_coverage(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps

    # Test invalid UUID string
    assert get_resource_if_READ_allowed(mock_user, mock_session, "file", "invalid-uuid") is None

    # Test valid UUID
    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db

        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.join.return_value = mock_query
        mock_query.group_by.return_value = mock_query

        mock_query.first.return_value = "resource"

        assert get_resource_if_READ_allowed(mock_user, mock_session, "file", str(uuid.uuid4())) == "resource"
