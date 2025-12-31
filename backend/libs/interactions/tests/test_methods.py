import pytest
import uuid
from unittest.mock import MagicMock, patch
from libs.interactions.methods import get_interaction_by_token, _get_interactions_for
from libs.interactions.models import Interaction
from libs.users.models import User
from libs.sessions.models import AppSession
from libs.resource.resource import Resource


@patch("libs.interactions.methods.jwt")
@patch("libs.interactions.methods.Interaction")
@patch("libs.interactions.methods.INTERACTIONS_SETTINGS")
def test_get_interaction_by_token(mock_settings, mock_interaction, mock_jwt):
    mock_settings.APP_SECRET = "secret"

    # Case 1: No token
    assert get_interaction_by_token(None) is None

    # Case 2: JWT Error
    from jose.exceptions import JWTError

    mock_jwt.decode.side_effect = JWTError("JWT Error")
    assert get_interaction_by_token("token") is None

    # Case 3: No sub
    mock_jwt.decode.side_effect = None
    mock_jwt.decode.return_value = {}
    assert get_interaction_by_token("token") is None

    # Case 4: Success
    mock_jwt.decode.return_value = {"sub": "interaction_id"}
    mock_interaction.by_id.return_value = "interaction_obj"
    assert get_interaction_by_token("token") == "interaction_obj"
    mock_interaction.by_id.assert_called_with("interaction_id")


@patch("libs.interactions.methods.context_db")
@patch("libs.interactions.methods.add_acl_filters")
def test_get_interactions_for(mock_add_acl, mock_context_db):
    db = MagicMock()
    mock_context_db.return_value.__enter__.return_value = db

    # Mock query chain
    query = MagicMock()
    db.query.return_value = query
    query.join.return_value = query
    query.filter.return_value = query
    mock_add_acl.return_value = query

    # Mock result
    resource_type = MagicMock()
    resource_type.id = uuid.uuid4()
    resource_type.__kind__ = "test_kind"

    item = MagicMock()
    item.id = uuid.uuid4()
    interaction = MagicMock()

    # Result tuple: (ResourceType, Acl, Interaction)
    query.all.return_value = [(item, MagicMock(), interaction)]

    result = _get_interactions_for(None, None, resource_type)

    assert item.id in result
    assert result[item.id]["item"] == item
    assert result[item.id]["interactions"] == [interaction]
