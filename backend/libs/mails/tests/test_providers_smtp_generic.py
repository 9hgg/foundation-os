import smtplib
from unittest.mock import patch

from libs.mails.models import MailSettings
from libs.mails.providers.smtp._generic import GenericSMTPProvider


def _build_provider() -> GenericSMTPProvider:
    mail_settings = MailSettings(
        name="test",
        kind="smtp",
        config={"host": "smtp.example.com", "port": 587, "starttls": True},
    )
    provider = GenericSMTPProvider(mail_settings=mail_settings)
    # A bare, unconnected SMTP instance — real enough to satisfy the pydantic
    # isinstance check, its sendmail() gets patched below so nothing actually
    # hits the network.
    provider.smtp_connexion = smtplib.SMTP.__new__(smtplib.SMTP)
    return provider


def test_send_email_sets_date_and_message_id_headers():
    # Gmail (and most receiving servers) silently drop/heavily filter mail
    # missing these — real mail clients always set them, raw email.mime does
    # not unless we do it ourselves. Regression test for that silent-drop bug.
    provider = _build_provider()

    with patch.object(provider.smtp_connexion, "sendmail") as sendmail_mock:
        provider._send_email_with_attachments(
            sender_email="sender@example.com",
            recipient_emails=["recipient@example.com"],
            subject="Test subject",
            text_content="Test body",
        )

    sent_message = sendmail_mock.call_args[0][2]
    assert "\nDate: " in sent_message
    assert "\nMessage-ID: " in sent_message
