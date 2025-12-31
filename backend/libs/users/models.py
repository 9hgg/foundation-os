import uuid
from typing import Literal, Optional

import sqlmodel
from pydantic import UUID4, BaseModel, Field
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import ResourceWithConfig
from libs.utils.types import BaseModelWithConfig

# Type for notification digest frequency options
# Type for notification digest frequency options
NotificationDigestFrequency = Literal["never", "hourly", "daily", "weekly", "monthly"]
ThemeMode = Literal["light", "dark", "system"]


class EmailSubscriptionDetails(BaseModel):
    """Details for a specific email subscription/newsletter."""

    subscribed: bool = False
    frequency: Optional[NotificationDigestFrequency] = None  # For future use if newsletters have frequency options
    subscribed_at: Optional[str] = None  # ISO datetime string when subscription was made
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
    newsletter_subscriptions: dict[str, EmailSubscriptionDetails] = Field(default_factory=dict)

    # Theme preferences
    theme: ThemeConfig = Field(default_factory=ThemeConfig)

    # Language preference
    language: Optional[str] = None

    # Billing config (always present for direct attribute access convenience)
    billing: BillingConfig = Field(default_factory=BillingConfig)

    def model_post_init(self, __context):
        if isinstance(self.profile_picture_id, str):
            self.profile_picture_id = uuid.UUID(self.profile_picture_id)


class User(ResourceWithConfig, table=True):
    __tablename__ = "users"
    __kind__ = "user"
    __title__ = "User"
    __description__ = "A user is a person that can access the application."
    __config_type__ = UserConfig

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    pseudo: Optional[str] = None

    email: Optional[str] = None
    email_verified: Optional[bool] = False
    email_verification_token: Optional[str] = None
    email_verification_token_expires: Optional[str] = None  # ISO datetime string
    password_hashed: Optional[str] = sqlmodel.Field(exclude=True, default=None)
    reset_password_token: Optional[str] = sqlmodel.Field(exclude=True, default=None)
    reset_password_token_expires: Optional[str] = sqlmodel.Field(exclude=True, default=None)

    config: UserConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: UserConfig(),
    )


EDITABLE_USER_FIELDS = ["first_name", "last_name", "pseudo"]
EDITABLE_USER_CONFIG_FIELDS = [
    "profile_picture_id",
    "notification_digest_frequency",
    "newsletter_subscriptions",
    "theme",
    "language",
]


class PasswordResetRequestPayload(BaseModel):
    email: str | None = None


class PasswordResetSubmitPayload(BaseModel):
    token: str | None = None
    password: str | None = None
