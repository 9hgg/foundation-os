import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from cryptography.fernet import Fernet
from pydantic import BaseModel, TypeAdapter

from libs.logger import print

from ...models import Mail, MailSettings
from .._generic import COMMASPACE, GenericMailProvider
from .config import SMTP_PROVIDER_SETTINGS
from .errors import (
    MissingSMTPCipherKeyError,
    SMTPConnectionNotCreatedError,
    SMTPHTMLContentMissingTagError,
    SMTPTextContainsHTMLTagError,
)


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

            password = cipher.decrypt(
                self.config.crypted_password.encode("utf-8")
            ).decode()
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
        msg["Subject"] = subject

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

        # Attach file attachments
        for attachment in attachments:
            with open(attachment, "rb") as file:
                attachment_part = MIMEApplication(file.read())
                attachment_part.add_header(
                    "Content-Disposition", f'attachment; filename="{attachment}"'
                )
                msg.attach(attachment_part)

        # Send the email
        return self.smtp_connexion.sendmail(
            sender_email, recipient_emails, msg.as_string()
        )

    def process_mails(self, mails: list[Mail]):
        """Should send the mail using the provider"""

        # connect
        self._connect()

        # send the mails
        for mail in mails:
            sendmail_response = None
            status = "unknown"

            try:
                sendmail_response = self._send_email_with_attachments(
                    sender_email=mail.sender,
                    recipient_emails=mail.recipients,
                    subject=mail.subject,
                    text_content=mail.body,
                    html_content=None,
                    attachments=[],
                )
                # Check the delivery status for each recipient
                for recipient, (status, error) in sendmail_response.items():
                    if status == 250:
                        print(f"Email to {recipient} was delivered successfully.")
                    else:
                        print(f"Email to {recipient} failed with error: {error}")
            except Exception as e:
                sendmail_response = e

            print("sendmail_response", sendmail_response)

        # close the SMTP connection
        self._disconnect()

    def _body_contains_html(self, body: str) -> bool:
        """Should return True if the body contains HTML, False otherwise"""
        return "<html" in body
