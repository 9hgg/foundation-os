import datetime
import uuid
from typing import Optional

import sqlalchemy as sa
import sqlmodel
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlmodel import Field

from libs.mcp.display import ResourceDisplayProfile
from libs.resource import ResourceWithConfig
from libs.utils.types import BaseModelWithConfig


class ArticleConfig(BaseModelWithConfig):
    __kind__ = "articleConfig"
    __description__ = "The config of an article."
    __title__ = "Article config"
    __private__ = True
    __category__ = "config"

    images: Optional[dict[str, dict[str, str]]] = None
    deltas: Optional[dict] = None  # Placeholder for Delta type
    comments_enabled: Optional[bool] = False


class Article(ResourceWithConfig, table=True):
    __tablename__ = "articles"
    __kind__ = "article"
    __title__ = "Article"
    __description__ = "An article object for blog support, knowledge management, tutorials, backlog items... "
    __config_type__ = ArticleConfig
    __mcp_display__ = ResourceDisplayProfile(
        kind="article",
        title_fields=("title", "slug", "id"),
        subtitle_fields=("summary",),
        status_fields=("draft", "featured"),
        date_fields=("time_published", "time_updated", "time_created"),
        metadata_fields=("slug", "kind", "featured", "time_published"),
    )

    title: str | None = Field(index=True, default=None)
    slug: Optional[str] = Field(index=True, unique=True, default_factory=lambda: str(uuid.uuid4()))
    summary: Optional[str] = Field(default=None)
    content: Optional[str] = Field(default=None)

    author_id: Optional[uuid.UUID] = Field(foreign_key="users.id", default=None)

    kind: str = "default"  # can also be 'support', 'backlog', 'assistant'
    draft: bool = True
    featured: bool = Field(default=False)
    time_published: Optional[datetime.datetime] = sqlmodel.Field(
        sa_type=sa.DateTime(timezone=True), nullable=True, default=None
    )

    # Storing tags as a PostgreSQL array of strings.
    tags: list[str] = Field(default_factory=list, sa_column=Column(ARRAY(String), nullable=False))

    config: ArticleConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: ArticleConfig(),
    )

    def model_post_init(self, __context):
        super().model_post_init(__context)
        if isinstance(self.time_published, str):
            self.time_published = datetime.datetime.fromisoformat(self.time_published)


class AdminArticleFolderAssignment(BaseModelWithConfig):
    folder_id: uuid.UUID
