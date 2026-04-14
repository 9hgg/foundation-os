import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from libs.users.api import create_crud_user_router
from libs.users.methods import get_current_user_optional
from libs.users.models import User, UserConfig
from libs.i18n.deps import get_translator

app = FastAPI()
router = create_crud_user_router()
app.include_router(router)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_translator():
    translator = MagicMock()

    def _translate(sentence, **kwargs):
        rendered = sentence
        for key, value in (kwargs.get("kv") or {}).items():
            rendered = rendered.replace(f"§{key}", value)
        return rendered

    translator.translate.side_effect = _translate
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
    assert "2 hours" in mock_add_mail.call_args.kwargs["html_content"]
    assert "§hours" not in mock_add_mail.call_args.kwargs["html_content"]

    app.dependency_overrides = {}


@patch("libs.users.api.User.patch")
@patch("libs.users.api.add_mail_to_db")
@patch("libs.users.api.TasksManager.create_task")
@patch("libs.users.api.launch_tasks_processing")
def test_send_verification_email_renders_expiry_hours(
    mock_launch, mock_create_task, mock_add_mail, mock_patch, client, mock_translator
):
    user = MagicMock()
    user.id = "user_id"
    user.email = "test@example.com"
    user.email_verified = False

    app.dependency_overrides[get_translator] = lambda: mock_translator
    app.dependency_overrides[get_current_user_optional] = lambda: user

    response = client.post("/api/users/email/send-verification")

    assert response.status_code == 200
    mock_patch.assert_called_once()
    mock_add_mail.assert_called_once()
    mock_create_task.assert_called_once()
    assert "2 hours" in mock_add_mail.call_args.kwargs["html_content"]
    assert "§hours" not in mock_add_mail.call_args.kwargs["html_content"]

    app.dependency_overrides = {}


@patch("libs.users.api.User.get_first_by")
def test_request_password_reset_no_email(mock_get_first_by, client, mock_translator):
    app.dependency_overrides[get_translator] = lambda: mock_translator

    response = client.post("/api/users/password/request-reset", json="")
    assert response.status_code == 200
    assert "error" in response.json()
    assert response.json()["error"]["code"] == "no_email_provided"

    app.dependency_overrides = {}


# --- Change Email Endpoints ---


@patch("libs.users.api.User.patch")
@patch("libs.users.api.add_mail_to_db")
@patch("libs.users.api.TasksManager.create_task")
@patch("libs.users.api.launch_tasks_processing")
@patch("libs.users.api.libs.utils.emails.is_email_valid", return_value=True)
@patch("libs.users.api.models.User.get_first_by", return_value=None)
def test_request_email_change_success(
    mock_get_first_by,
    mock_is_valid,
    mock_launch,
    mock_create_task,
    mock_add_mail,
    mock_patch,
    client,
    mock_translator,
):
    user = MagicMock()
    user.id = "user_id"
    user.email = "old@example.com"

    app.dependency_overrides[get_translator] = lambda: mock_translator
    app.dependency_overrides[get_current_user_optional] = lambda: user

    with patch("libs.users.api.USER_SETTINGS.FRONTEND_URL", "https://app.example.com"):
        response = client.post("/api/users/email/request-change", json={"newEmail": "new@example.com"})

    assert response.status_code == 200
    assert "result" in response.json()
    mock_patch.assert_called_once()
    mock_add_mail.assert_called_once()
    # confirmation email goes to the new address
    assert mock_add_mail.call_args.kwargs["recipient_emails"] == ["new@example.com"]
    assert "2 hours" in mock_add_mail.call_args.kwargs["html_content"]
    assert "§hours" not in mock_add_mail.call_args.kwargs["html_content"]

    app.dependency_overrides = {}


def test_request_email_change_not_authenticated(client, mock_translator):
    app.dependency_overrides[get_translator] = lambda: mock_translator
    app.dependency_overrides[get_current_user_optional] = lambda: None

    response = client.post("/api/users/email/request-change", json={"newEmail": "new@example.com"})

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "not_authenticated"

    app.dependency_overrides = {}


@patch("libs.users.api.libs.utils.emails.is_email_valid", return_value=False)
def test_request_email_change_invalid_email(mock_is_valid, client, mock_translator):
    user = MagicMock()
    user.email = "old@example.com"

    app.dependency_overrides[get_translator] = lambda: mock_translator
    app.dependency_overrides[get_current_user_optional] = lambda: user

    response = client.post("/api/users/email/request-change", json={"newEmail": "not-an-email"})

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "email_incorrect"

    app.dependency_overrides = {}


@patch("libs.users.api.libs.utils.emails.is_email_valid", return_value=True)
def test_request_email_change_same_as_current(mock_is_valid, client, mock_translator):
    user = MagicMock()
    user.email = "same@example.com"

    app.dependency_overrides[get_translator] = lambda: mock_translator
    app.dependency_overrides[get_current_user_optional] = lambda: user

    response = client.post("/api/users/email/request-change", json={"newEmail": "same@example.com"})

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "email_unchanged"

    app.dependency_overrides = {}


@patch("libs.users.api.libs.utils.emails.is_email_valid", return_value=True)
@patch("libs.users.api.models.User.get_first_by")
def test_request_email_change_already_used(mock_get_first_by, mock_is_valid, client, mock_translator):
    user = MagicMock()
    user.email = "old@example.com"
    other_user = MagicMock()
    mock_get_first_by.return_value = other_user

    app.dependency_overrides[get_translator] = lambda: mock_translator
    app.dependency_overrides[get_current_user_optional] = lambda: user

    response = client.post("/api/users/email/request-change", json={"newEmail": "taken@example.com"})

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "email_already_used"

    app.dependency_overrides = {}


@patch("libs.users.api.User.patch")
def test_confirm_email_change_missing_token(mock_patch, client, mock_translator):
    app.dependency_overrides[get_translator] = lambda: mock_translator

    response = client.post("/api/users/email/confirm-change", json={})

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "missing_token"

    app.dependency_overrides = {}


@patch("libs.users.api.context_db")
def test_confirm_email_change_invalid_token(mock_context_db, client, mock_translator):
    db = MagicMock()
    db.query.return_value.where.return_value.first.return_value = None
    mock_context_db.return_value.__enter__ = MagicMock(return_value=db)
    mock_context_db.return_value.__exit__ = MagicMock(return_value=False)

    app.dependency_overrides[get_translator] = lambda: mock_translator

    response = client.post("/api/users/email/confirm-change", json={"token": "bad-token"})

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "invalid_token"

    app.dependency_overrides = {}


@patch("libs.users.api.User.patch")
@patch("libs.users.api.context_db")
def test_confirm_email_change_token_expired(mock_context_db, mock_patch, client, mock_translator):
    from datetime import datetime, timedelta

    user = MagicMock()
    user.change_email_token = "expired-token"
    user.change_email_token_expires = (datetime.now() - timedelta(hours=1)).isoformat()
    user.pending_email = "new@example.com"

    db = MagicMock()
    db.query.return_value.where.return_value.first.return_value = user
    mock_context_db.return_value.__enter__ = MagicMock(return_value=db)
    mock_context_db.return_value.__exit__ = MagicMock(return_value=False)

    app.dependency_overrides[get_translator] = lambda: mock_translator

    response = client.post("/api/users/email/confirm-change", json={"token": "expired-token"})

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "token_expired"
    mock_patch.assert_not_called()

    app.dependency_overrides = {}


@patch("libs.users.api.User.patch")
@patch("libs.users.api.context_db")
def test_confirm_email_change_success(mock_context_db, mock_patch, client, mock_translator):
    from datetime import datetime, timedelta

    config = MagicMock()
    config.former_emails = []
    config.model_dump.return_value = {"formerEmails": ["old@example.com"]}

    user = MagicMock()
    user.id = "user-id"
    user.email = "old@example.com"
    user.pending_email = "new@example.com"
    user.change_email_token = "valid-token"
    user.change_email_token_expires = (datetime.now() + timedelta(hours=1)).isoformat()
    user.config = config

    db = MagicMock()
    db.query.return_value.where.return_value.first.return_value = user
    mock_context_db.return_value.__enter__ = MagicMock(return_value=db)
    mock_context_db.return_value.__exit__ = MagicMock(return_value=False)

    app.dependency_overrides[get_translator] = lambda: mock_translator

    response = client.post("/api/users/email/confirm-change", json={"token": "valid-token"})

    assert response.status_code == 200
    assert "result" in response.json()
    mock_patch.assert_called_once()
    patch_call = mock_patch.call_args
    update_dict = patch_call.kwargs["update_dict"]
    assert update_dict["email"] == "new@example.com"
    assert update_dict["email_verified"] is True
    assert update_dict["pending_email"] is None
    assert update_dict["change_email_token"] is None

    app.dependency_overrides = {}


@patch("libs.users.api.User.patch")
@patch("libs.users.api.context_db")
def test_confirm_email_change_archives_former_email_with_timestamp(mock_context_db, mock_patch, client, mock_translator):
    from datetime import datetime, timedelta

    config = UserConfig()

    user = MagicMock()
    user.id = "user-id"
    user.email = "old@example.com"
    user.pending_email = "new@example.com"
    user.change_email_token = "valid-token"
    user.change_email_token_expires = (datetime.now() + timedelta(hours=1)).isoformat()
    user.config = config

    db = MagicMock()
    db.query.return_value.where.return_value.first.return_value = user
    mock_context_db.return_value.__enter__ = MagicMock(return_value=db)
    mock_context_db.return_value.__exit__ = MagicMock(return_value=False)

    app.dependency_overrides[get_translator] = lambda: mock_translator

    before = datetime.now()
    response = client.post("/api/users/email/confirm-change", json={"token": "valid-token"})
    after = datetime.now()

    assert response.status_code == 200
    assert len(config.former_emails) == 1
    archived = config.former_emails[0]
    assert archived.email == "old@example.com"
    assert isinstance(archived.changed_at, datetime)
    assert before <= archived.changed_at <= after
    assert archived.was_verified is True

    app.dependency_overrides = {}


@patch("libs.users.api.tokens.create_jwt_token")
@patch("libs.users.api.models.User.by_id")
def test_admin_get_connect_as_link(
    mock_user_by_id,
    mock_create_jwt_token,
    client,
    mock_translator,
):
    admin_user = MagicMock(spec=User)
    admin_user.id = "admin-id"
    admin_user.is_admin.return_value = True

    target_user = MagicMock()
    target_user.id = "2f0f3d54-bbf3-4326-bca6-5f6225c11d1b"
    mock_user_by_id.return_value = target_user
    mock_create_jwt_token.return_value = "signed-token"

    app.dependency_overrides[get_translator] = lambda: mock_translator
    app.dependency_overrides[get_current_user_optional] = lambda: admin_user

    with patch("libs.users.api.USER_SETTINGS.FRONTEND_URL", "https://some.domain"):
        response = client.get(
            f"/api/users/admin/connect-as-link/{target_user.id}"
        )

    assert response.status_code == 200
    assert response.json()["result"]["url"] == "https://some.domain?authToken=signed-token"
    mock_create_jwt_token.assert_called_once()

    app.dependency_overrides = {}
