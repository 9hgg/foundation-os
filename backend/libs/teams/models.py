import uuid
from typing import Optional

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from libs.mcp.display import ResourceDisplayProfile
from libs.resource import ResourceWithConfig
from libs.utils.types import SQLMODEL_BASE_CONFIG_DICT, BaseModelWithConfig


class TeamConfig(BaseModelWithConfig):
    __kind__ = "teamConfig"
    __description__ = "The config of a team."
    __title__ = "Team config"
    __private__ = True
    __category__ = "config"

    details: Optional[str] = None


class Team(ResourceWithConfig, table=True):
    __tablename__ = "teams"
    __kind__ = "team"
    __title__ = "Team"
    __description__ = "A team object for collaboration and project management."
    __config_type__ = TeamConfig
    __mcp_display__ = ResourceDisplayProfile(
        kind="team",
        title_fields=("name", "title", "id"),
        metadata_fields=("owner_id",),
        date_fields=("time_updated", "time_created"),
    )

    owner_id: uuid.UUID = Field(
        sa_column=sa.Column(
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    name: str | None = Field(index=True, default=None)
    config: TeamConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: TeamConfig(),
    )


class Membership(sqlmodel.SQLModel, table=True):

    __tablename__ = "relation_memberships"
    team_id: uuid.UUID = sqlmodel.Field(
        sa_column=sa.Column(
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    user_id: uuid.UUID = sqlmodel.Field(
        sa_column=sa.Column(
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    role: str = sqlmodel.Field(
        default="member",
        nullable=False,
    )  # e.g., "admin", "member", "viewer"

    model_config = SQLMODEL_BASE_CONFIG_DICT
