
import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import (
    ResourceWithConfig,
)
from libs.utils.types import BaseModelWithConfig


class NotificationConfig(BaseModelWithConfig):
    __kind__ = "notificationConfig"
    __description__ = "The config of a notification."
    __title__ = "Notification config"
    __private__ = False
    __category__ = "config"

    conversation_id: str | None = None
    message_id: str | None = None
    user_id: str | None = None
    emoji: str | None = None
    reply_to_id: str | None = None

    # when the notification is related to an interaction
    interaction_id: str | None = None
    interaction_details: dict | None = None


class Notification(ResourceWithConfig, table=True):
    __tablename__ = "notifications"
    __kind__ = "notification"
    __title__ = "Notification"
    __description__ = "A notification, like you can imagine"
    __config_type__ = NotificationConfig

    kind: str = "default"
    read: bool = False
    archived: bool | None = False

    # to find a notification deterministically, we use a key
    key: str | None = None

    title: str | None = None
    content: str | None = None
    target_id: str | None = None
    target_kind: str | None = None
    config: NotificationConfig = sqlmodel.Field(
        sa_type=JSONB, nullable=False, default_factory=lambda: NotificationConfig()
    )
