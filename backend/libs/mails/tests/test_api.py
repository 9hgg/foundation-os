import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.mails import models
from libs.mails.api import create_crud_mail_router
from libs.utils.deps import get_deps

app = FastAPI()
router = create_crud_mail_router()
app.include_router(router)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_translator():
    translator = MagicMock()
    translator.translate.side_effect = lambda sentence, **kwargs: sentence
    return translator


def create_admin_user():
    admin_user = MagicMock()
    admin_user.is_admin.return_value = True
    return admin_user


@patch("libs.mails.api.get_admin_mail_overview")
def test_admin_get_mail_overview(mock_get_admin_mail_overview, client, mock_translator):
    admin_user = create_admin_user()
    mail_id = uuid.uuid4()
    attempt_id = uuid.uuid4()
    mail_settings_id = uuid.uuid4()

    mock_get_admin_mail_overview.return_value = models.AdminMailOverview(
        mail_settings=[
            models.AdminMailSettingsSummary(
                id=mail_settings_id,
                name="Primary SMTP",
                kind="smtp",
                is_active=True,
            )
        ],
        mails=[
            models.AdminMailSummary(
                id=mail_id,
                time_created=None,
                time_updated=None,
                status="sent",
                subject="Subject",
                body="Body",
                body_html="<p>Body</p>",
                sender="sender@example.com",
                priority=1,
                recipients=["recipient@example.com"],
                attempts_count=1,
                attempts=[
                    models.AdminMailAttemptSummary(
                        id=attempt_id,
                        time_created=None,
                        time_updated=None,
                        status="sent",
                        error=None,
                        mail_id=mail_id,
                        mail_settings_id=mail_settings_id,
                    )
                ],
            )
        ],
    )

    app.dependency_overrides[get_deps] = lambda: (admin_user, None, mock_translator)

    response = client.get("/api/mails/admin/overview")

    assert response.status_code == 200
    assert response.json()["result"]["mailSettings"][0]["name"] == "Primary SMTP"
    assert response.json()["result"]["mails"][0]["attemptsCount"] == 1
    assert response.json()["result"]["mails"][0]["attempts"][0]["status"] == "sent"

    app.dependency_overrides = {}


def test_admin_get_mail_overview_rejects_non_admin(client, mock_translator):
    non_admin_user = MagicMock()
    non_admin_user.is_admin.return_value = False
    app.dependency_overrides[get_deps] = lambda: (non_admin_user, None, mock_translator)

    response = client.get("/api/mails/admin/overview")

    assert response.status_code == 200
    assert response.json()["error"]["code"] == "not_authorized"

    app.dependency_overrides = {}


@patch("libs.mails.api.launch_tasks_processing")
@patch("libs.mails.api.TasksManager.create_task")
@patch("libs.mails.api.models.Mail.patch")
@patch("libs.mails.api.models.Mail.by_id")
def test_admin_resend_mail(
    mock_mail_by_id,
    mock_mail_patch,
    mock_create_task,
    mock_launch_tasks_processing,
    client,
    mock_translator,
):
    admin_user = create_admin_user()
    mail_id = uuid.uuid4()
    mail = MagicMock()
    mail.id = mail_id
    mail.recipients = ["dest@example.com"]
    mail.subject = "Your invoice"
    mock_mail_by_id.return_value = mail

    app.dependency_overrides[get_deps] = lambda: (admin_user, None, mock_translator)

    response = client.post(f"/api/mails/admin/{mail_id}/resend")

    assert response.status_code == 200
    assert response.json()["result"]["message"] == "Email resend launched"
    mock_mail_patch.assert_called_once_with(obj_id=mail_id, update_dict={"status": "pending"})
    mock_create_task.assert_called_once_with(
        method_name="send_email",
        title="Re-send email",
        description="To dest@example.com — Your invoice",
        kwargs={"mail_id": mail_id},
    )
    mock_launch_tasks_processing.assert_called_once()

    app.dependency_overrides = {}


@patch("libs.mails.api.launch_tasks_processing")
@patch("libs.mails.api.TasksManager.create_task")
@patch("libs.mails.api.add_mail_to_db")
@patch("libs.mails.api.render_email_template")
def test_send_rumble_studio_transactional_email(
    mock_render_email_template,
    mock_add_mail_to_db,
    mock_create_task,
    mock_launch_tasks_processing,
    client,
):
    mock_render_email_template.return_value = "<html>rendered</html>"
    mail = MagicMock()
    mail.id = uuid.uuid4()
    mock_add_mail_to_db.return_value = mail

    response = client.post(
        "/api/mails/rumble-studio/send-transactional",
        json={
            "from_addr": "Rumble Studio <contact@rumble.studio>",
            "to_addr": "user@example.com",
            "subject": "Password less connection",
            "title": "Hi there,",
            "body": "Click the link to reset your password.",
            "link": "https://app.rumble.studio/reset",
            "action": "Connect",
            "bottom": "Copyright Rumble Studio",
        },
        headers={"X-Rumble-Secret": "rmbl-stdio-2026-9f3a7c1e5b8d4021"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    mock_render_email_template.assert_called_once()
    assert mock_render_email_template.call_args.args[0] == "transactional_rumble_studio.html"
    mock_add_mail_to_db.assert_called_once()
    mock_create_task.assert_called_once()
    mock_launch_tasks_processing.assert_called_once()


def test_send_rumble_studio_transactional_email_rejects_bad_secret(client):
    response = client.post(
        "/api/mails/rumble-studio/send-transactional",
        json={
            "from_addr": "Rumble Studio <contact@rumble.studio>",
            "to_addr": "user@example.com",
            "subject": "Password less connection",
            "title": "Hi there,",
            "body": "Click the link to reset your password.",
        },
        headers={"X-Rumble-Secret": "wrong-secret"},
    )

    assert response.status_code == 401
