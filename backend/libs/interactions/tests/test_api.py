import pytest
import uuid
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from libs.interactions.api import create_crud_interaction_router
from libs.interactions.models import Interaction
from libs.utils.deps import get_deps
from libs.utils.types import EndpointError

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
    interaction = MagicMock()
    interaction.id = uuid.uuid4()
    interaction.key = "test_key"
    interaction.config = {}
    # Ensure it behaves like a Pydantic model or dict as needed by EndpointOutput
    interaction.model_dump.return_value = {"id": str(interaction.id), "key": "test_key", "config": {}}
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
    interaction = MagicMock()
    interaction.id = uuid.uuid4()
    interaction.key = "kind.id"
    interaction.config = {}
    interaction.model_dump.return_value = {"id": str(interaction.id), "key": "kind.id", "config": {}}
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

    updated_interaction = MagicMock()
    updated_interaction.id = uuid.uuid4()
    updated_interaction.key = "kind.id"
    updated_interaction.config = {}
    updated_interaction.model_dump.return_value = {"id": str(updated_interaction.id), "key": "kind.id", "config": {}}
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
