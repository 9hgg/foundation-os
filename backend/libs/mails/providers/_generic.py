import typing

import structlog

from libs.utils.types import BaseModelWithConfig

from ..models import Mail, MailSettings

logger = structlog.get_logger(__name__)

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
        cc_emails: list[str] | None = None,
        attachments: list[str] | None = None,
        dry_run: bool = False,
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
        attachments: list[str] | None = None,
        headers: list[tuple[str, str]] | None = None,
    ):
        if headers is None:
            headers = []
        if attachments is None:
            attachments = []
        logger.info(
            "mail_dry_run",
            provider=type(self).__name__,
            recipient_count=len(recipient_emails),
            attachment_count=len(attachments),
            header_count=len(headers),
            has_html=html_content is not None,
        )
        return
