import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

import structlog
from cryptography.fernet import Fernet
from pydantic import BaseModel, TypeAdapter

from ...models import Mail, MailSettings
from .._generic import COMMASPACE, GenericMailProvider
from .config import SMTP_PROVIDER_SETTINGS
from .errors import (
    MissingSMTPCipherKeyError,
    SMTPConnectionNotCreatedError,
    SMTPHTMLContentMissingTagError,
    SMTPTextContainsHTMLTagError,
)

logger = structlog.get_logger(__name__)


class SMTPConfig(BaseModel):
    host: str
    port: int
    username: str | None = None
    # password: str | None = None
    crypted_password: str | None = None
    extra_headers: list[list[str]] = []
    starttls: bool = True


class GenericSMTPProvider(GenericMailProvider):
    """A generic SMTP provider."""

    smtp_connexion: smtplib.SMTP | None = None
    config: SMTPConfig  # override the config Any type of the parent class

    def __init__(self, *, mail_settings: MailSettings, dry_run: bool = False, **kwargs):
        """Should create a SMTP provider using the config"""

        super().__init__(
            mail_settings=mail_settings,
            dry_run=dry_run,
            config=TypeAdapter(SMTPConfig).validate_python(mail_settings.config),
            **kwargs,
        )

    def _create_connection(self):
        """Should create a connection object (without connecting)
        to the SMTP server using the config and save it in self.smtp_connection"""

        self.smtp_connexion = smtplib.SMTP(self.config.host, self.config.port)

    def _connect(self):
        """
        Should connect to the SMTP server using
        the config and save it in self.smtp_connection
        """
        if not self.smtp_connexion:
            # create the SMTP connection
            self._create_connection()

        if self.config.starttls:
            self.smtp_connexion.starttls()
        if self.config.username and self.config.crypted_password:
            cipher_key = (
                SMTP_PROVIDER_SETTINGS.CIPHER_MAIL_SMTP.encode("utf-8")
                if SMTP_PROVIDER_SETTINGS.CIPHER_MAIL_SMTP
                else None
            )
            cipher = Fernet(cipher_key) if cipher_key else None

            if not cipher:
                raise MissingSMTPCipherKeyError()

            password = cipher.decrypt(self.config.crypted_password.encode("utf-8")).decode()
            self.smtp_connexion.login(self.config.username, password)

    def _disconnect(self):
        """
        Should disconnect from the SMTP server
        """
        if not self.smtp_connexion:
            raise SMTPConnectionNotCreatedError()
        self.smtp_connexion.quit()

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
        headers: list[list[str]] | None = None,
        dry_run: bool = False,
    ):
        if attachments is None:
            attachments = []
        if headers is None:
            headers = []
        if self.dry_run or dry_run:
            self.print_details(
                sender_email=sender_email,
                recipient_emails=recipient_emails,
                subject=subject,
                text_content=text_content,
                html_content=html_content,
                attachments=attachments,
                headers=headers,
            )
            return

        # connect
        self._connect()

        # send
        result = self._send_email_with_attachments(
            sender_email=sender_email,
            recipient_emails=recipient_emails,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            cc_emails=cc_emails,
            attachments=attachments,
            headers=headers,
        )

        # disconnect
        self._disconnect()

        return result

    def _send_email_with_attachments(
        self,
        *,
        sender_email: str,
        recipient_emails: list[str],
        subject: str,
        text_content: str,
        html_content: str | None = None,
        cc_emails: list[str] | None = None,
        attachments: list[str] | None = None,
        # headers is a list of lists (header_name, header_value)
        headers: list[list[str]] | None = None,
    ):
        if attachments is None:
            attachments = []
        if headers is None:
            headers = []
        if not self.smtp_connexion:
            raise SMTPConnectionNotCreatedError()

        # Create a MIME message
        msg = MIMEMultipart("alternative")
        msg["From"] = sender_email
        msg["To"] = COMMASPACE.join(recipient_emails)
        if cc_emails:
            msg["Cc"] = COMMASPACE.join(cc_emails)
        msg["Subject"] = subject
        # Gmail (and most receiving servers) treat mail missing these as a strong
        # spam/reject signal — real mail clients always set them, raw email.mime
        # does not unless we do it ourselves.
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain=sender_email.split("@")[-1])

        # Add extra headers
        for header in self.config.extra_headers:
            msg[header[0]] = header[1]

        # Add custom headers
        for header in headers:
            msg[header[0]] = header[1]

        # Attach the text part
        if self._body_contains_html(text_content):
            raise SMTPTextContainsHTMLTagError()
        text_part = MIMEText(text_content, "plain", "utf-8")
        msg.attach(text_part)

        # Attach the HTML part
        if html_content:
            if not self._body_contains_html(html_content):
                raise SMTPHTMLContentMissingTagError()
            html_part = MIMEText(html_content, "html", "utf-8")
            msg.attach(html_part)

        self._attach_files(msg, attachments)

        # The envelope carries the Cc addresses too: the header alone says who was copied, it does
        # not deliver to them.
        envelope = [*recipient_emails, *(cc_emails or [])]
        return self.smtp_connexion.sendmail(sender_email, envelope, msg.as_string())

    def _attach_files(self, msg: MIMEMultipart, attachments: list[str]) -> None:
        for attachment in attachments:
            with open(attachment, "rb") as file:
                attachment_part = MIMEApplication(file.read())
                attachment_part.add_header("Content-Disposition", f'attachment; filename="{attachment}"')
                msg.attach(attachment_part)

    def process_mails(self, mails: list[Mail]):
        """Should send the mail using the provider"""

        # connect
        self._connect()

        # send the mails
        for mail in mails:
            try:
                sendmail_response = self._send_email_with_attachments(
                    sender_email=mail.sender,
                    recipient_emails=mail.recipients,
                    subject=mail.subject,
                    text_content=mail.body,
                    html_content=None,
                    cc_emails=mail.config.cc,
                    attachments=[],
                )
                refused_count = len(sendmail_response)
                logger.info(
                    "mail_send_completed",
                    provider=type(self).__name__,
                    status="success" if refused_count == 0 else "partial_failure",
                    recipient_count=len(mail.recipients),
                    accepted_count=max(0, len(mail.recipients) - refused_count),
                    refused_count=refused_count,
                )
            except Exception as error:
                # Do not attach the SMTP exception: its message may contain
                # recipient addresses or server-provided sensitive details.
                logger.error(  # noqa: TRY400
                    "mail_send_failed",
                    provider=type(self).__name__,
                    status="failure",
                    recipient_count=len(mail.recipients),
                    error_type=type(error).__name__,
                )

        # close the SMTP connection
        self._disconnect()

    def _body_contains_html(self, body: str) -> bool:
        """Should return True if the body contains HTML, False otherwise"""
        return "<html" in body
