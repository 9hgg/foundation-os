import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.messages.api import create_crud_message_router
from libs.messages.models import Message
from libs.users.models import User
from libs.utils.deps import get_deps

# Setup app
app = FastAPI()
router = create_crud_message_router()
app.include_router(router)
client = TestClient(app)


@pytest.fixture
def mock_deps():
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()
    mock_user.email = "test@example.com"
    mock_user.is_admin.return_value = False
    mock_session = MagicMock()
    mock_translator = MagicMock()
    mock_translator.translate.side_effect = lambda x: x
    return mock_user, mock_session, mock_translator


def test_read_messages_no_conversation_id(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    response = client.get("/api/messages")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "BadRequest"

    app.dependency_overrides = {}


def test_read_messages_invalid_conversation_id(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    response = client.get("/api/messages?filters=conversation_id:invalid")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert "Invalid conversation ID" in data["error"]["title"]

    app.dependency_overrides = {}


@patch("libs.messages.api.purge_acls_for_resource")
def test_admin_can_delete_message(mock_purge_acls, mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    mock_user.email = "admin@example.com"
    mock_user.email_verified = True
    mock_user.is_admin.return_value = True
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    message_id = uuid.uuid4()
    message = Message(
        id=message_id,
        conversation_id=uuid.uuid4(),
        author_id=mock_user.id,
        content="Remove this",
        kind="default",
        config={},
    )

    with (
        patch.object(Message, "by_id", return_value=message),
        patch.object(Message, "delete") as mock_delete,
    ):
        response = client.delete(f"/api/messages/admin/{message_id}")

    assert response.status_code == 200
    assert response.json()["result"]["data"]["id"] == str(message_id)
    mock_delete.assert_called_once_with(obj_id=message_id)
    mock_purge_acls.assert_called_once_with(resource_kind=Message.__kind__, resource_id=message_id)
    app.dependency_overrides = {}


@patch("libs.messages.api.Conversation")
def test_read_messages_conversation_not_found(mock_conversation, mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_conversation.by_id.return_value = None
    conv_id = str(uuid.uuid4())

    response = client.get(f"/api/messages?filters=conversation_id:{conv_id}")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "NotFound"

    app.dependency_overrides = {}


@patch("libs.messages.api.Conversation")
@patch("libs.messages.api.get_resource_if_READ_allowed")
def test_read_messages_resource_not_allowed(mock_get_resource, mock_conversation, mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_conv = MagicMock()
    mock_conv.resource_kind = "file"
    mock_conv.resource_id = uuid.uuid4()
    mock_conversation.by_id.return_value = mock_conv

    mock_get_resource.return_value = None

    conv_id = str(uuid.uuid4())
    response = client.get(f"/api/messages?filters=conversation_id:{conv_id}")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "ConversationResourceNotFound"

    app.dependency_overrides = {}


@patch("libs.messages.api.Conversation")
@patch("libs.messages.api.get_resource_if_READ_allowed")
@patch("libs.messages.api.context_db")
def test_read_messages_success(mock_context_db, mock_get_resource, mock_conversation, mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_conv = MagicMock()
    mock_conv.resource_kind = "file"
    mock_conv.resource_id = uuid.uuid4()
    mock_conv.status = "active"
    mock_conversation.by_id.return_value = mock_conv

    mock_get_resource.return_value = MagicMock()

    # Mock DB query
    mock_db = MagicMock()
    mock_context_db.return_value.__enter__.return_value = mock_db
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.group_by.return_value = mock_query
    mock_query.order_by.return_value = mock_query

    # Mock result
    mock_message = MagicMock(spec=Message)
    mock_message.id = uuid.uuid4()
    mock_query.limit.return_value.offset.return_value.all.return_value = [mock_message]
    mock_query.count.return_value = 1

    conv_id = str(uuid.uuid4())
    response = client.get(f"/api/messages?filters=conversation_id:{conv_id}")

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert len(data["result"]["data"]) == 1

    app.dependency_overrides = {}


@patch("libs.messages.api.Message")
@patch("libs.messages.api.Conversation")
@patch("libs.messages.api.ResourceManager")
@patch("libs.messages.api.get_user_writers")
@patch("libs.messages.api.notify")
@patch("libs.messages.api.User")
def test_toggle_reaction_success(mock_user_model, mock_notify, mock_writers, mock_rm, mock_conversation, mock_message, mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    # Mock Message
    mock_msg = MagicMock()
    mock_msg.id = uuid.uuid4()
    mock_msg.author_id = uuid.uuid4()
    mock_msg.conversation_id = uuid.uuid4()
    mock_msg.config.reactions = []
    mock_message.by_id.return_value = mock_msg
    mock_message.update.return_value = mock_msg
    mock_user_model.by_id.return_value = MagicMock()

    # Mock Conversation
    mock_conv = MagicMock()
    mock_conv.status = "active"
    mock_conv.resource_kind = "file"
    mock_conv.resource_id = uuid.uuid4()
    mock_conv.config.available_reactions = ["👍"]
    mock_conversation.by_id.return_value = mock_conv

    # Mock Resource Manager
    mock_resource_type = MagicMock()
    mock_resource_type.by_id.return_value = MagicMock()
    mock_rm.get_resource_by_kind.return_value = mock_resource_type

    # Mock Writers
    mock_writers.return_value = []

    msg_id = str(mock_msg.id)
    response = client.post(f"/api/messages/{msg_id}/reaction/toggle", json="👍")

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "message" in data["result"]

    # Verify update called
    mock_message.update.assert_called_once()

    app.dependency_overrides = {}
