import datetime
import uuid

import sqlalchemy as sa
import sqlmodel
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlmodel import Field

from libs.resource import ResourceDisplayProfile, ResourceWithConfig
from libs.utils.types import BaseModelWithConfig


class ArticleConfig(BaseModelWithConfig):
    __kind__ = "articleConfig"
    __description__ = "The config of an article."
    __title__ = "Article config"
    __private__ = True
    __category__ = "config"

    images: dict[str, dict[str, str]] | None = None
    deltas: dict | None = None  # Placeholder for Delta type
    comments_enabled: bool | None = False


class Article(ResourceWithConfig, table=True):
    __tablename__ = "articles"
    __kind__ = "article"
    __title__ = "Article"
    __description__ = "An article object for blog support, knowledge management, tutorials, backlog items... "
    __config_type__ = ArticleConfig
    __display_profile__ = ResourceDisplayProfile(
        kind="article",
        title_fields=("title", "slug", "id"),
        subtitle_fields=("summary",),
        status_fields=("draft", "featured"),
        date_fields=("time_published", "time_updated", "time_created"),
        metadata_fields=("slug", "kind", "featured", "time_published"),
    )

    title: str | None = Field(index=True, default=None)
    slug: str | None = Field(index=True, unique=True, default_factory=lambda: str(uuid.uuid4()))
    summary: str | None = Field(default=None)
    content: str | None = Field(default=None)

    author_id: uuid.UUID | None = Field(foreign_key="users.id", default=None)

    kind: str = "default"  # can also be 'support', 'backlog', 'assistant'
    # None is live; 'archived' takes it out of the lists without deleting anything.
    state: str | None = Field(default=None, index=True)
    draft: bool = True
    featured: bool = Field(default=False)
    time_published: datetime.datetime | None = sqlmodel.Field(
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


class SetArticleStateRequest(BaseModelWithConfig):
    """What an admin asks of an article: None to bring it back, 'archived' to file it away."""

    state: str | None = None
