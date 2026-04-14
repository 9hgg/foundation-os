import uuid
from typing import Optional

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import Resource, ResourceWithConfig


class Mail(Resource, table=True):
    __tablename__ = "mails"
    __kind__: str = "mail"
    __title__: str = "Mail"
    __description__: str = "A mail is an email sent by the application."
    __private__: bool = False

    # pending, processing, sent, failed, replaced, unknown (replaced: replaced by another mail row)
    status: str | None
    subject: str
    body: str = sqlmodel.Field(nullable=False)
    body_html: str = sqlmodel.Field(nullable=True)
    sender: str = sqlmodel.Field(nullable=False)
    # the higher the number, the higher the priority
    priority: int = sqlmodel.Field(default=0)
    recipients: list[str] = sqlmodel.Field(
        default_factory=list,
        sa_column=sa.Column(
            postgresql.ARRAY(sa.String()),
            nullable=False,
        ),
    )


class MailTemplate(Resource, table=True):
    __tablename__ = "mail_templates"
    __kind__: str = "mail_template"
    __title__: str = "Mail template"
    __description__: str = "A mail template is a template used to generate a mail."
    __private__: bool = False

    name: str = sqlmodel.Field(nullable=True)
    config: dict = sqlmodel.Field(sa_column=sa.Column(JSONB, nullable=False), default_factory=dict)


class MailSettings(ResourceWithConfig, table=True):
    __tablename__ = "mail_settings"
    __kind__: str = "mail_settings"
    __title__: str = "Mail provider settings"
    __description__: str = "A MailSettings contains the details to implement a MailProvider."
    __private__: bool = False

    __config_type__ = dict

    name: str = sqlmodel.Field(nullable=True)
    kind: str = sqlmodel.Field(nullable=False, default="smtp")  # smtp, sendgrid_api, mailgun_api, mailjet_api, ...
    config: dict = sqlmodel.Field(sa_column=sa.Column(JSONB, nullable=False), default_factory=dict)


class MailAttempt(Resource, table=True):
    __tablename__ = "mail_attempts"
    __kind__: str = "mail_attempt"
    __title__: str = "Mail attempt"
    __description__: str = "A mail attempt is an attempt to send a mail."
    __private__: bool = False

    status: Optional[str] = sqlmodel.Field(nullable=True)  # sending, sent, failed, unknown
    error: Optional[str] = sqlmodel.Field(nullable=True)
    # foreign key over Mail
    mail_id: uuid.UUID = sqlmodel.Field(nullable=False, foreign_key="mails.id")
    # foreign key over MailProvider
    mail_settings_id: uuid.UUID = sqlmodel.Field(nullable=False, foreign_key="mail_settings.id")
