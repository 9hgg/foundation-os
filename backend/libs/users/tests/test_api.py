import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from libs.users.api import create_crud_user_router
from libs.users.models import User
from libs.i18n.deps import get_translator
from libs.utils.deps import get_deps

app = FastAPI()
router = create_crud_user_router()
app.include_router(router)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_translator():
    translator = MagicMock()
    translator.translate.side_effect = lambda *args, **kwargs: args[0] if args else "translated"
    return translator


@patch("libs.users.api.User.get_first_by")
@patch("libs.users.api.User.patch")
@patch("libs.users.api.add_mail_to_db")
@patch("libs.users.api.TasksManager.create_task")
@patch("libs.users.api.launch_tasks_processing")
def test_request_password_reset(
    mock_launch, mock_create_task, mock_add_mail, mock_patch, mock_get_first_by, client, mock_translator
):
    app.dependency_overrides[get_translator] = lambda: mock_translator

    # Case 1: User not found
    mock_get_first_by.return_value = None
    response = client.post("/api/users/password/request-reset", json="unknown@example.com")
    assert response.status_code == 200
    assert "result" in response.json()
    assert "message" in response.json()["result"]

    # Case 2: User found
    user = MagicMock()
    user.id = "user_id"
    user.email = "test@example.com"
    mock_get_first_by.return_value = user

    response = client.post("/api/users/password/request-reset", json="test@example.com")
    assert response.status_code == 200
    mock_patch.assert_called_once()
    mock_add_mail.assert_called_once()
    mock_create_task.assert_called_once()

    app.dependency_overrides = {}


@patch("libs.users.api.User.get_first_by")
def test_request_password_reset_no_email(mock_get_first_by, client, mock_translator):
    app.dependency_overrides[get_translator] = lambda: mock_translator

    response = client.post("/api/users/password/request-reset", json="")
    assert response.status_code == 200
    assert "error" in response.json()
    assert response.json()["error"]["code"] == "no_email_provided"

    app.dependency_overrides = {}
