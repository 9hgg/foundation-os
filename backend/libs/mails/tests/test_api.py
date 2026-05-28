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
    mock_mail_by_id.return_value = mail

    app.dependency_overrides[get_deps] = lambda: (admin_user, None, mock_translator)

    response = client.post(f"/api/mails/admin/{mail_id}/resend")

    assert response.status_code == 200
    assert response.json()["result"]["message"] == "Email resend launched"
    mock_mail_patch.assert_called_once_with(obj_id=mail_id, update_dict={"status": "pending"})
    mock_create_task.assert_called_once_with(
        method_name="send_email",
        title="send_email",
        description="Re-send email",
        kwargs={"mail_id": mail_id},
    )
    mock_launch_tasks_processing.assert_called_once()

    app.dependency_overrides = {}
