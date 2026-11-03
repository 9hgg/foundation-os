import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
import sqlmodel
from pydantic import ConfigDict
from pydantic import Field as PydanticField
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from libs.resource import Resource, ResourceDisplayProfile, ResourceWithConfig
from libs.utils.types import PYDANTIC_BASE_CONFIG_DICT, BaseModelWithConfig


class MailConfig(BaseModelWithConfig):
    __kind__ = "mailConfig"
    __description__ = "Everything about a mail that is not a column."
    __title__ = "Mail config"
    __private__ = True
    __category__ = "config"

    # Copied, not addressed: these ride in the Cc header and the envelope, and the reader sees who
    # the mail was written for. Used to put the product owner on one-off sends (see
    # .github/instructions/global.instructions.md).
    cc: list[str] = PydanticField(default_factory=list)


class Mail(ResourceWithConfig, table=True):
    __tablename__ = "mails"
    __kind__: str = "mail"
    __title__: str = "Mail"
    __description__: str = "A mail is an email sent by the application."
    __private__: bool = False
    __config_type__ = MailConfig
    __display_profile__ = ResourceDisplayProfile(
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
    # Anything about a mail that is not worth a column of its own -- bcc, reply-to, custom headers
    # -- belongs here rather than in another migration.
    config: MailConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: MailConfig(),
    )


class MailSettings(ResourceWithConfig, table=True):
    __tablename__ = "mail_settings"
    __kind__: str = "mail_settings"
    __title__: str = "Mail provider settings"
    __description__: str = "A MailSettings contains the details to implement a MailProvider."
    __private__: bool = False
    __display_profile__ = ResourceDisplayProfile(
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
    __display_profile__ = ResourceDisplayProfile(
        kind="mail_attempt",
        title_fields=("status", "id"),
        status_fields=("status",),
        metadata_fields=("mail_id",),
    )

    status: str | None = sqlmodel.Field(nullable=True)  # sending, sent, failed, unknown
    error: str | None = sqlmodel.Field(nullable=True)
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


class EmailVerificationConfig(BaseModelWithConfig):
    __kind__ = "email_verification_config"
    __description__ = "Free-form metadata about a verification request."
    __title__ = "Email verification config"
    __private__ = False
    __category__ = "config"

    model_config = ConfigDict(**{**PYDANTIC_BASE_CONFIG_DICT, "extra": "allow"})


class EmailVerification(ResourceWithConfig, table=True):
    __tablename__ = "email_verifications"
    __kind__ = "email_verification"
    __title__ = "Email verification"
    __description__ = (
        "Records that a given address was asked to prove itself *for one occasion*, named by "
        "`key`. It answers 'did the holder of this address click the link we sent for key XYZ', "
        "not 'is this address verified in general' — a form step verifying the same address twice "
        "for two different questions holds two rows. The key is opaque here: callers derive it "
        "(see methods.build_verification_key) so this table never needs to know about forms."
    )
    __config_type__ = EmailVerificationConfig
    __display_profile__ = ResourceDisplayProfile(
        kind="email_verification",
        title_fields=("email", "id"),
        metadata_fields=("key", "verified"),
        date_fields=("time_updated", "time_created"),
    )

    email: str = Field(sa_column=sa.Column(sa.String, nullable=False, index=True))
    # What this verification is *for*. Unique together with the email: asking again for the same
    # pair rotates the token on the existing row rather than piling up rows.
    key: str = Field(sa_column=sa.Column(sa.String, nullable=False, index=True))
    token: str = Field(sa_column=sa.Column(sa.String, nullable=False, unique=True, index=True))

    verified: bool = False
    verified_at: datetime | None = Field(default=None, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True))

    # A fresh token is minted on every send, so this doubles as "when was the last mail sent",
    # which is what the resend cooldown is measured against.
    token_created_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    )
    expires_at: datetime = Field(sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))

    # Where to send the person after they click, when the caller wants them to land somewhere
    # specific. Absent means "show the plain confirmation page".
    redirect_url: str | None = None

    config: EmailVerificationConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: EmailVerificationConfig().model_dump(),
    )

    __table_args__ = (sa.UniqueConstraint("email", "key", name="uq_email_verification_email_key"),)
