from typing import Optional

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

    conversation_id: Optional[str] = None
    message_id: Optional[str] = None
    user_id: Optional[str] = None
    emoji: Optional[str] = None
    reply_to_id: Optional[str] = None

    # when the notification is related to an interaction
    interaction_id: Optional[str] = None
    interaction_details: Optional[dict] = None


class Notification(ResourceWithConfig, table=True):
    __tablename__ = "notifications"
    __kind__ = "notification"
    __title__ = "Notification"
    __description__ = "A notification, like you can imagine"
    __config_type__ = NotificationConfig

    kind: str = "default"
    read: bool = False
    archived: Optional[bool] = False

    # to find a notification deterministically, we use a key
    key: Optional[str] = None

    title: Optional[str] = None
    content: Optional[str] = None
    target_id: Optional[str] = None
    target_kind: Optional[str] = None
    config: NotificationConfig = sqlmodel.Field(
        sa_type=JSONB, nullable=False, default_factory=lambda: NotificationConfig()
    )
