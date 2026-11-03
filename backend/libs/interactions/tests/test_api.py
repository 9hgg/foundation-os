import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.interactions.api import create_crud_interaction_router
from libs.interactions.models import Interaction
from libs.utils.deps import get_deps

app = FastAPI()
router = create_crud_interaction_router()
app.include_router(router)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    return user


@pytest.fixture
def mock_translator():
    translator = MagicMock()
    translator.translate.side_effect = lambda x: x
    return translator


@patch("libs.interactions.api._get_interactions_for")
@patch("libs.interactions.api.ResourceManager")
def test_get_interactions_by_items(mock_rm, mock_get_ints, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    mock_rm.get_resource_by_kind.return_value = MagicMock()
    mock_get_ints.return_value = {"item1": []}

    response = client.get("/api/interactions/by/test_kind")
    assert response.status_code == 200
    assert response.json()["result"] == {"item1": []}

    app.dependency_overrides = {}


@patch("libs.interactions.api._get_interaction_by_token")
def test_get_interaction_by_token(mock_get_int, client):
    # Case 1: Not found
    mock_get_int.return_value = None
    response = client.get("/api/interactions/by-token/token")
    assert response.status_code == 200
    assert response.json()["error"]["title"] == "Interaction not found"

    # Case 2: Found
    interaction = Interaction(id=uuid.uuid4(), key="test_key", config={})
    mock_get_int.return_value = interaction
    response = client.get("/api/interactions/by-token/token")
    assert response.status_code == 200
    assert response.json()["result"]["id"] == str(interaction.id)


@patch("libs.interactions.api._get_interaction_by_token")
@patch("libs.interactions.api.ResourceManager")
def test_update_interaction_by_token(mock_rm, mock_get_int, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    # Case 1: Interaction not found
    mock_get_int.return_value = None
    response = client.put("/api/interactions/by-token/token", json={"key": "kind.id"})
    assert response.status_code == 200
    assert response.json()["error"]["title"] == "Interaction not found"

    # Case 2: Item not found
    interaction = MagicMock(spec=Interaction)
    interaction.id = uuid.uuid4()
    interaction.key = "kind.id"
    interaction.config = {}
    interaction.user_id = None
    interaction.userId = None
    interaction.state = None  # host-only: the by-token save preserves the server's state
    mock_get_int.return_value = interaction

    resource_type = MagicMock()
    resource_type.by_id.return_value = None
    mock_rm.get_resource_by_kind.return_value = resource_type

    response = client.put("/api/interactions/by-token/token", json={"key": "kind.id"})
    assert response.status_code == 200
    assert "not found" in response.json()["error"]["title"]

    # Case 3: Success with notification
    item = MagicMock()
    item.id = uuid.uuid4()
    resource_type.by_id.return_value = item
    resource_type.__notify_method__ = MagicMock()

    updated_interaction = Interaction(id=uuid.uuid4(), key="kind.id", config={})
    interaction.update.return_value = updated_interaction

    response = client.put("/api/interactions/by-token/token", json={"key": "kind.id"})
    assert response.status_code == 200
    assert response.json()["result"]["id"] == str(updated_interaction.id)
    resource_type.__notify_method__.assert_called()

    # Case 4: Success without notification
    resource_type.__notify_method__ = None
    response = client.put("/api/interactions/by-token/token", json={"key": "kind.id"})
    assert response.status_code == 200

    app.dependency_overrides = {}


@patch("libs.interactions.api.context_db")
@patch("libs.interactions.api.libs.utils.tokens.create_jwt_token")
def test_create_interaction_by_token(mock_create_token, mock_context_db, client):
    db = MagicMock()
    mock_context_db.return_value.__enter__.return_value = db
    mock_create_token.return_value = "jwt_token"

    response = client.post("/api/interactions/by-token/create", json={"key": "test_key"})

    assert response.status_code == 200
    assert response.json()["result"]["interactionToken"] == "jwt_token"
    db.add.assert_called()
    db.commit.assert_called()


@patch("libs.interactions.api._get_interaction_by_token")
@patch("libs.interactions.api.ResourceManager")
def test_update_by_token_unarchives_the_session(mock_rm, mock_get_int, client, mock_user, mock_translator):
    """A guest answering into an archived session brings it back.

    Otherwise the host archives a response, the respondent keeps recording, and their answers
    land in a row hidden behind the "show archived" toggle — indistinguishable from data loss.
    """
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    interaction = MagicMock(spec=Interaction)
    interaction.id = uuid.uuid4()
    interaction.key = "form.abc"
    interaction.config = {}
    interaction.user_id = None
    interaction.userId = None
    interaction.state = "archived"
    interaction.update.return_value = interaction
    mock_get_int.return_value = interaction
    mock_rm.is_resource_registered.return_value = False

    client.put("/api/interactions/by-token/token", json={"key": "form.abc"})

    saved = interaction.update.call_args.kwargs["new_obj"]
    assert saved.state is None, "answering into an archived session must un-archive it"


@patch("libs.interactions.api._get_interaction_by_token")
@patch("libs.interactions.api.ResourceManager")
def test_update_by_token_undeletes_the_session_it_answers_into(mock_rm, mock_get_int, client, mock_user, mock_translator):
    """A deleted response is gone for the host, not for the respondent: their answers live in
    their own browser, so carrying on in the same session brings the whole thing back."""
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    interaction = MagicMock(spec=Interaction)
    interaction.id = uuid.uuid4()
    interaction.key = "form.abc"
    interaction.config = {}
    interaction.user_id = None
    interaction.userId = None
    interaction.state = "deleted"
    interaction.update.return_value = interaction
    mock_get_int.return_value = interaction
    mock_rm.is_resource_registered.return_value = False

    client.put("/api/interactions/by-token/token", json={"key": "form.abc"})

    saved = interaction.update.call_args.kwargs["new_obj"]
    assert saved.state is None, "answering into a deleted session must bring it back"


@patch("libs.interactions.api._get_interaction_by_token")
@patch("libs.interactions.api.ResourceManager")
def test_update_by_token_leaves_a_non_archived_state_alone(mock_rm, mock_get_int, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    interaction = MagicMock(spec=Interaction)
    interaction.id = uuid.uuid4()
    interaction.key = "form.abc"
    interaction.config = {}
    interaction.user_id = None
    interaction.userId = None
    interaction.state = None
    interaction.update.return_value = interaction
    mock_get_int.return_value = interaction
    mock_rm.is_resource_registered.return_value = False

    client.put("/api/interactions/by-token/token", json={"key": "form.abc"})

    saved = interaction.update.call_args.kwargs["new_obj"]
    assert saved.state is None


# --- set_interaction_state (archive/restore) -------------------------------------------

@patch("libs.interactions.api.get_resource_if_WRITE_allowed")
@patch("libs.interactions.api.Interaction")
def test_set_state_archives_when_parent_write_allowed(mock_interaction_cls, mock_write_allowed, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    interaction_id = uuid.uuid4()
    form_id = uuid.uuid4()
    existing = MagicMock()
    existing.key = f"form.{form_id}"
    mock_interaction_cls.by_id.return_value = existing
    mock_write_allowed.return_value = MagicMock()  # caller has WRITE on the form
    mock_interaction_cls.patch.return_value = Interaction(id=interaction_id, key=existing.key, state="archived", config={})

    response = client.post(f"/api/interactions/{interaction_id}/state", json={"state": "archived"})

    assert response.status_code == 200
    assert response.json()["result"]["state"] == "archived"
    # authorization resolved the parent from the key '{kind}.{id}'
    assert mock_write_allowed.call_args.args[2] == "form"
    assert mock_write_allowed.call_args.args[3] == str(form_id)
    assert mock_interaction_cls.patch.call_args.kwargs["update_dict"] == {"state": "archived"}
    app.dependency_overrides = {}


@patch("libs.interactions.api.get_resource_if_WRITE_allowed")
@patch("libs.interactions.api.Interaction")
def test_set_state_accepts_deleted(mock_interaction_cls, mock_write_allowed, client, mock_user, mock_translator):
    """Deleting is the marker that releases the storage a response's files were counting for."""
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    interaction_id = uuid.uuid4()
    existing = MagicMock()
    existing.key = f"form.{uuid.uuid4()}"
    mock_interaction_cls.by_id.return_value = existing
    mock_write_allowed.return_value = MagicMock()
    mock_interaction_cls.patch.return_value = Interaction(id=interaction_id, key=existing.key, state="deleted", config={})

    response = client.post(f"/api/interactions/{interaction_id}/state", json={"state": "deleted"})

    assert response.status_code == 200
    assert response.json()["result"]["state"] == "deleted"
    assert mock_interaction_cls.patch.call_args.kwargs["update_dict"] == {"state": "deleted"}
    app.dependency_overrides = {}


@patch("libs.interactions.api.get_resource_if_WRITE_allowed")
@patch("libs.interactions.api.Interaction")
def test_set_state_restores_with_null(mock_interaction_cls, mock_write_allowed, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    interaction_id = uuid.uuid4()
    existing = MagicMock()
    existing.key = f"form.{uuid.uuid4()}"
    mock_interaction_cls.by_id.return_value = existing
    mock_write_allowed.return_value = MagicMock()
    mock_interaction_cls.patch.return_value = Interaction(id=interaction_id, key=existing.key, state=None, config={})

    response = client.post(f"/api/interactions/{interaction_id}/state", json={"state": None})

    assert response.status_code == 200
    assert response.json()["result"]["state"] is None
    assert mock_interaction_cls.patch.call_args.kwargs["update_dict"] == {"state": None}
    app.dependency_overrides = {}


@patch("libs.interactions.api.get_resource_if_WRITE_allowed")
@patch("libs.interactions.api.Interaction")
def test_set_state_denied_without_parent_write(mock_interaction_cls, mock_write_allowed, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    existing = MagicMock()
    existing.key = f"form.{uuid.uuid4()}"
    mock_interaction_cls.by_id.return_value = existing
    mock_write_allowed.return_value = None  # no WRITE on the form

    response = client.post(f"/api/interactions/{uuid.uuid4()}/state", json={"state": "archived"})

    assert response.json()["error"]["code"] == "access_denied"
    mock_interaction_cls.patch.assert_not_called()
    app.dependency_overrides = {}


@patch("libs.interactions.api.get_resource_if_WRITE_allowed")
@patch("libs.interactions.api.Interaction")
def test_set_state_not_found(mock_interaction_cls, mock_write_allowed, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    mock_interaction_cls.by_id.return_value = None

    response = client.post(f"/api/interactions/{uuid.uuid4()}/state", json={"state": "archived"})

    assert response.json()["error"]["title"] == "Interaction not found"
    mock_write_allowed.assert_not_called()
    app.dependency_overrides = {}


@patch("libs.interactions.api.get_resource_if_WRITE_allowed")
@patch("libs.interactions.api.Interaction")
def test_set_state_rejects_unknown_value(mock_interaction_cls, mock_write_allowed, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    response = client.post(f"/api/interactions/{uuid.uuid4()}/state", json={"state": "banana"})

    assert response.json()["error"]["code"] == "invalid_state"
    mock_interaction_cls.by_id.assert_not_called()
    mock_write_allowed.assert_not_called()
    app.dependency_overrides = {}
