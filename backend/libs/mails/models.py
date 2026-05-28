import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB

from libs.mcp.display import ResourceDisplayProfile
from libs.resource import Resource, ResourceWithConfig
from libs.utils.types import BaseModelWithConfig


class Mail(Resource, table=True):
    __tablename__ = "mails"
    __kind__: str = "mail"
    __title__: str = "Mail"
    __description__: str = "A mail is an email sent by the application."
    __private__: bool = False
    __mcp_display__ = ResourceDisplayProfile(
        kind="mail",
        title_fields=("subject", "id"),
        status_fields=("status",),
        date_fields=("time_updated", "time_created"),
        metadata_fields=("sender", "priority"),
        hidden_fields=(*ResourceDisplayProfile(kind="mail").hidden_fields, "body", "body_html"),
    )

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
    __mcp_display__ = ResourceDisplayProfile(kind="mail_template", title_fields=("name", "id"))

    name: str = sqlmodel.Field(nullable=True)
    config: dict = sqlmodel.Field(sa_column=sa.Column(JSONB, nullable=False), default_factory=dict)


class MailSettings(ResourceWithConfig, table=True):
    __tablename__ = "mail_settings"
    __kind__: str = "mail_settings"
    __title__: str = "Mail provider settings"
    __description__: str = "A MailSettings contains the details to implement a MailProvider."
    __private__: bool = False
    __mcp_display__ = ResourceDisplayProfile(
        kind="mail_settings",
        title_fields=("name", "id"),
        metadata_fields=("kind",),
    )

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
    __mcp_display__ = ResourceDisplayProfile(
        kind="mail_attempt",
        title_fields=("status", "id"),
        status_fields=("status",),
        metadata_fields=("mail_id",),
    )

    status: Optional[str] = sqlmodel.Field(nullable=True)  # sending, sent, failed, unknown
    error: Optional[str] = sqlmodel.Field(nullable=True)
    # foreign key over Mail
    mail_id: uuid.UUID = sqlmodel.Field(nullable=False, foreign_key="mails.id")
    # foreign key over MailProvider
    mail_settings_id: uuid.UUID = sqlmodel.Field(nullable=False, foreign_key="mail_settings.id")


class AdminMailAttemptSummary(BaseModelWithConfig):
    id: uuid.UUID
    time_created: datetime | None = None
    time_updated: datetime | None = None
    status: str | None = None
    error: str | None = None
    mail_id: uuid.UUID
    mail_settings_id: uuid.UUID
    mail_settings_name: str | None = None
    mail_settings_kind: str | None = None


class AdminMailSummary(BaseModelWithConfig):
    id: uuid.UUID
    time_created: datetime | None = None
    time_updated: datetime | None = None
    status: str | None = None
    subject: str
    body: str
    body_html: str | None = None
    sender: str
    priority: int
    recipients: list[str]
    attempts_count: int
    attempts: list[AdminMailAttemptSummary]


class AdminMailSettingsSummary(BaseModelWithConfig):
    id: uuid.UUID
    name: str | None = None
    kind: str
    is_active: bool = False


class AdminMailOverview(BaseModelWithConfig):
    mail_settings: list[AdminMailSettingsSummary]
    mails: list[AdminMailSummary]
