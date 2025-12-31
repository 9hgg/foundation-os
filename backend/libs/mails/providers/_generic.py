import typing

from libs.logger import print
from libs.utils.types import BaseModelWithConfig

from ..models import Mail, MailSettings, MailTemplate

COMMASPACE = ", "


class GenericMailProvider(BaseModelWithConfig):
    mail_settings: MailSettings
    dry_run: bool = False
    config: typing.Any

    def process_mails(self, mails: list[Mail]):
        """Should send the mails using the provider"""
        raise NotImplementedError()

    def send_email_with_attachments(
        self,
        *,
        sender_email: str,
        recipient_emails: list[str],
        subject: str,
        text_content: str,
        html_content: str | None = None,
        attachments: list[str] = [],
        dry_run: bool = False,
    ):
        """Should send the mail using the provider"""
        raise NotImplementedError()

    def send_email_from_template(
        self,
        *,
        template: MailTemplate,
        sender_email: str,
        recipient_emails: list[str],
        subject: str,
        text_content: str,
        html_content: str | None = None,
        attachments: list[str] = [],
    ):
        """Should send the mail using the provider"""
        raise NotImplementedError()

    def print_details(
        self,
        *,
        sender_email: str,
        recipient_emails: list[str],
        subject: str,
        text_content: str,
        html_content: str | None = None,
        attachments: list[str] = [],
        headers: list[typing.Tuple[str, str]] = [],
    ):
        print()
        print("DRY RUN: email not sent")
        print(40 * "-")
        print("sender_email", sender_email)
        print("recipient_emails", recipient_emails)
        print("subject", subject)
        print("text_content", text_content)
        print("html_content", html_content)
        print("attachments", attachments)
        print("headers", headers)
        print(40 * "-")
        print("config", self.config.host)
        print()
        return
