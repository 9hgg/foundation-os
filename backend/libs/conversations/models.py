import uuid
from typing import Optional

import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import ResourceWithConfig
from libs.utils.types import BaseModelWithConfig


class ConversationConfig(BaseModelWithConfig):
    """
    Configuration for the conversation model.
    This can include settings like available reactions, rich text support, etc.
    """

    available_reactions: Optional[list[str]] = None  # e.g., ["👍", "👎", "❤️"]
    display_reactions: bool = True  # Whether to display reactions
    rich_text: Optional[bool] = None  # Whether to allow rich text formatting


class Conversation(ResourceWithConfig, table=True):
    """
    A conversation will also supports reactions (like emojis) using specific kind of messages.
    When a message.kind = reaction is sent we should update the config details of the conversation to count each reactions.
    """

    __tablename__ = "conversations"
    __kind__ = "conversation"
    __title__ = "Conversation"
    __description__ = "A conversation object for chat support, comments on articles, backlog, etc..."
    __config_type__ = ConversationConfig

    # key (unique and indexed)
    key: str = sqlmodel.Field(
        index=True,
        nullable=False,
    )

    resource_kind: str | None = None
    resource_id: uuid.UUID | None = sqlmodel.Field(default=None, index=True)

    # enum active, hidden, disabled
    status: str = sqlmodel.Field(
        default="active",
        nullable=False,
    )
    title: Optional[str] = None
    config: ConversationConfig = sqlmodel.Field(
        sa_type=JSONB, nullable=False, default_factory=lambda: ConversationConfig()
    )
