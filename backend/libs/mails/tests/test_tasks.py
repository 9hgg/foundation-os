import pytest
import uuid
from unittest.mock import MagicMock, patch
from libs.mails.tasks import (
    exponential_backoff,
    send_email,
    process_emails,
    MailIdRequiredException,
    MailNotFoundException,
    MailSettingsNotFoundException,
)
from libs.mails.config import MAILS_SETTINGS


def test_exponential_backoff():
    assert exponential_backoff(0) == 0
    assert exponential_backoff(1) == 2 + 5
    assert exponential_backoff(2) == 4 + 5


@patch("libs.mails.tasks.Mail")
@patch("libs.mails.tasks.MailSettings")
@patch("libs.mails.tasks.MailAttempt")
@patch("libs.mails.tasks.GenericSMTPProvider")
def test_send_email(mock_smtp, mock_attempt, mock_settings, mock_mail):
    mail_id = uuid.uuid4()

    # Setup mocks
    mail_obj = MagicMock()
    mail_obj.id = mail_id
    mail_obj.sender = "sender@example.com"
    mail_obj.recipients = ["recipient@example.com"]
    mail_obj.subject = "Subject"
    mail_obj.body = "Body"
    mail_obj.body_html = "HTML"
    mock_mail.by_id.return_value = mail_obj

    settings_obj = MagicMock()
    settings_obj.id = uuid.uuid4()
    settings_obj.name = "Test Settings"
    mock_settings.by_id.return_value = settings_obj

    attempt_obj = MagicMock()
    attempt_obj.id = uuid.uuid4()
    mock_attempt.create.return_value = attempt_obj

    smtp_instance = MagicMock()
    smtp_instance.mail_settings.name = "Test SMTP"
    mock_smtp.return_value = smtp_instance

    # Execute success
    send_email(mail_id=mail_id)

    mock_mail.by_id.assert_called_with(mail_id)
    mock_settings.by_id.assert_called()
    mock_attempt.create.assert_called()
    mock_smtp.assert_called_with(mail_settings=settings_obj)
    smtp_instance.send_email_with_attachments.assert_called_with(
        sender_email="sender@example.com",
        recipient_emails=["recipient@example.com"],
        subject="Subject",
        text_content="Body",
        html_content="HTML",
    )
    mock_mail.patch.assert_called_with(obj_id=mail_id, update_dict={"status": "sent"})
    mock_attempt.patch.assert_called_with(obj_id=attempt_obj.id, update_dict={"status": "sent"})

    # Missing mail_id
    with pytest.raises(MailIdRequiredException):
        send_email()

    # Mail not found
    mock_mail.by_id.return_value = None
    with pytest.raises(MailNotFoundException):
        send_email(mail_id=mail_id)
    mock_mail.by_id.return_value = mail_obj

    # Settings not found
    mock_settings.by_id.return_value = None
    with pytest.raises(MailSettingsNotFoundException):
        send_email(mail_id=mail_id)
    mock_settings.by_id.return_value = settings_obj

    # Exception during send
    smtp_instance.send_email_with_attachments.side_effect = Exception("SMTP Error")
    send_email(mail_id=mail_id)

    # Verify failure updates
    # Note: patch is called multiple times, we need to check if failed status was set
    # The last calls should be for failure
    assert mock_mail.patch.call_args[1]["update_dict"]["status"] == "failed"
    assert mock_attempt.patch.call_args[1]["update_dict"]["status"] == "failed"
    assert "SMTP Error" in mock_attempt.patch.call_args[1]["update_dict"]["error"]


@patch("libs.mails.tasks.context_db")
@patch("libs.mails.tasks.Task")
@patch("libs.mails.tasks.Mail")
def test_process_emails(mock_mail, mock_task, mock_context_db):
    db = MagicMock()
    mock_context_db.return_value.__enter__.return_value = db

    # Mock query result
    mail1 = MagicMock()
    mail1.id = uuid.uuid4()
    mail1.priority = 1
    mail1.time_created = "now"

    # List of (mail, attempts_count)
    db.query.return_value.outerjoin.return_value.group_by.return_value.order_by.return_value.filter.return_value.having.return_value.limit.return_value.all.return_value = [
        (mail1, 0)
    ]

    # Mock processing query result (stuck emails)
    mail2 = MagicMock()
    mail2.id = uuid.uuid4()

    # We need to handle the second query for stuck emails
    # The first query chain ends with .all()
    # The second query starts with db.query(Mail).filter...

    # It's hard to mock separate queries on the same db mock object perfectly without side_effect
    # Let's assume the first query returns the list above, and we can check calls.

    # For the second query (stuck emails), let's make it return an empty list for now to simplify
    # or we can try to differentiate.

    process_emails()

    # Verify mail1 processed
    mock_mail.patch.assert_any_call(obj_id=mail1.id, update_dict={"status": "processing"}, _db=db)

    mock_task.create.assert_called_with(
        obj_dict={
            "method_name": "send_email",
            "arguments": {
                "kwargs": {
                    "mail_id": mail1.id,
                }
            },
            "custom_id": f"{mail1.id}-0",
        }
    )
