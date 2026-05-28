import uuid
from datetime import datetime
from typing import Literal, Optional

import sqlmodel
from pydantic import UUID4, BaseModel, Field
from sqlalchemy.dialects.postgresql import JSONB

from libs.mcp.display import ResourceDisplayProfile
from libs.resource import ResourceWithConfig
from libs.users.config import USER_SETTINGS
from libs.utils.types import BaseModelWithConfig

# Type for notification digest frequency options
# Type for notification digest frequency options
NotificationDigestFrequency = Literal["never", "hourly", "daily", "weekly", "monthly"]
ThemeMode = Literal["light", "dark", "system"]


class EmailSubscriptionDetails(BaseModel):
    """Details for a specific email subscription/newsletter."""

    subscribed: bool = False
    frequency: Optional[NotificationDigestFrequency] = (
        None  # For future use if newsletters have frequency options
    )
    subscribed_at: Optional[str] = (
        None  # ISO datetime string when subscription was made
    )
    last_sent: Optional[str] = None  # ISO datetime string when last email was sent


class ThemeConfig(BaseModel):
    """Theme configuration for a user."""

    mode: Optional[ThemeMode] = "system"
    light: Optional[str] = None
    dark: Optional[str] = None


class BillingConfig(BaseModelWithConfig):
    __kind__ = "billingConfig"
    __description__ = "Billing linkage details for a user (external providers)."
    __title__ = "Billing Config"
    __private__ = True
    __category__ = "config"

    # Stripe linkage
    stripe_customer_id: Optional[str] = None

    # Future providers (kept for parity/extensibility)
    paddle_customer_id: Optional[str] = None


class FormerEmail(BaseModelWithConfig):
    email: str
    changed_at: datetime
    was_verified: bool


class UserConfig(BaseModelWithConfig):
    __kind__ = "userConfig"
    __description__ = "The config of a user."
    __title__ = "User config"
    __private__ = True
    __category__ = "config"

    profile_picture_id: Optional[UUID4] = None

    # Email notification preferences
    notification_digest_frequency: Optional[NotificationDigestFrequency] = None

    # Newsletter subscriptions - flexible structure for multiple newsletters
    newsletter_subscriptions: dict[str, EmailSubscriptionDetails] = Field(
        default_factory=dict
    )

    # Theme preferences
    theme: ThemeConfig = Field(default_factory=ThemeConfig)

    # Language preference
    language: Optional[str] = None

    # Billing config (always present for direct attribute access convenience)
    billing: BillingConfig = Field(default_factory=BillingConfig)

    # Former emails (history of previous email addresses)
    former_emails: list["FormerEmail"] = Field(default_factory=list)

    # App-specific user details — each app defines its own typed model for this field
    app_details: Optional[dict] = None

    def model_post_init(self, __context):
        if isinstance(self.profile_picture_id, str):
            self.profile_picture_id = uuid.UUID(self.profile_picture_id)


class User(ResourceWithConfig, table=True):
    __tablename__ = "users"
    __kind__ = "user"
    __title__ = "User"
    __description__ = "A user is a person that can access the application."
    __config_type__ = UserConfig
    __mcp_display__ = ResourceDisplayProfile(
        kind="user",
        title_fields=("pseudo", "email", "first_name", "last_name", "id"),
        subtitle_fields=("email",),
        status_fields=("email_verified",),
        metadata_fields=("email", "first_name", "last_name"),
        hidden_fields=(
            *ResourceDisplayProfile(kind="user").hidden_fields,
            "password_hashed",
            "reset_password_token",
            "email_verification_token",
            "change_email_token",
        ),
    )

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    pseudo: Optional[str] = None

    email: Optional[str] = None
    email_verified: Optional[bool] = False
    email_verification_token: Optional[str] = sqlmodel.Field(exclude=True, default=None)
    email_verification_token_expires: Optional[str] = None  # ISO datetime string
    password_hashed: Optional[str] = sqlmodel.Field(exclude=True, default=None)
    reset_password_token: Optional[str] = sqlmodel.Field(exclude=True, default=None)
    reset_password_token_expires: Optional[str] = sqlmodel.Field(
        exclude=True, default=None
    )

    pending_email: Optional[str] = sqlmodel.Field(exclude=True, default=None)
    change_email_token: Optional[str] = sqlmodel.Field(exclude=True, default=None)
    change_email_token_expires: Optional[str] = sqlmodel.Field(
        exclude=True, default=None
    )

    config: UserConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: UserConfig(),
    )

    def is_admin(
        self,
        require_verified: bool = True,
        admin_emails: Optional[list[str]] = None,
    ) -> bool:
        """
        Single source of truth for admin checks.
        By default, an admin must be in the admin emails list and have a verified email.
        """
        if not self.email:
            return False

        allowed_admin_emails = (
            admin_emails if admin_emails is not None else USER_SETTINGS.ADMIN_EMAILS
        )
        if self.email not in allowed_admin_emails:
            return False

        if require_verified and not self.email_verified:  # noqa: SIM103
            return False

        return True


EDITABLE_USER_FIELDS = ["first_name", "last_name", "pseudo"]
EDITABLE_USER_CONFIG_FIELDS = [
    "profile_picture_id",
    "notification_digest_frequency",
    "newsletter_subscriptions",
    "theme",
    "language",
    "app_details",
]
EDITABLE_BY_ADMIN_USER_FIELDS = [*EDITABLE_USER_FIELDS, "email", "email_verified"]


class PasswordResetRequestPayload(BaseModel):
    email: str | None = None


class PasswordResetSubmitPayload(BaseModel):
    token: str | None = None
    password: str | None = None


class ChangeEmailRequestPayload(BaseModel):
    new_email: str | None = None


class ChangeEmailConfirmPayload(BaseModel):
    token: str | None = None
