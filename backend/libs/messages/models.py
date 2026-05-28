import uuid
from typing import Optional

import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from libs.mcp.display import ResourceDisplayProfile
from libs.resource import (
    ResourceWithConfig,
)
from libs.utils.types import BaseModelWithConfig


class MessageConfig(BaseModelWithConfig):
    # ID of the message being replied to
    reply_to: Optional[str] = None
    # reactions?: Array<{ userId: string; emoji: string }>; // For storing emoji reactions
    reactions: Optional[list[dict[str, str]]] = None


class Message(ResourceWithConfig, table=True):
    __tablename__ = "messages"
    __kind__ = "message"
    __title__ = "Message"
    __description__ = "A message object for chat support, comments on articles, backlog, etc..."
    __config_type__ = MessageConfig
    __mcp_display__ = ResourceDisplayProfile(
        kind="message",
        title_fields=("title", "content", "id"),
        subtitle_fields=("content",),
        date_fields=("time_updated", "time_created"),
        metadata_fields=("kind",),
    )

    conversation_id: uuid.UUID = Field(foreign_key="conversations.id")
    author_id: Optional[uuid.UUID] = Field(foreign_key="users.id", nullable=True)
    title: Optional[str] = None
    content: Optional[str] = None
    kind: str = "default"  # could be "agent","reaction",...
    # config can be useful when the message carries more information (to be expanded, or history...)
    config: MessageConfig = sqlmodel.Field(sa_type=JSONB, nullable=False, default_factory=lambda: MessageConfig())
