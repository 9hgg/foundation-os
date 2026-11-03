import uuid

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from libs.resource import ResourceDisplayProfile, ResourceWithConfig
from libs.utils.types import SQLMODEL_BASE_CONFIG_DICT, BaseModelWithConfig


class TeamInvitation(BaseModelWithConfig):
    """Someone asked to join a team, before they have said yes.

    The role lives here rather than in the token, so an admin can change their mind about what
    they are offering without reissuing the link -- what the invitation says at the moment it is
    claimed is what gets granted.

    Only a hash of the token is kept. A team's config is readable by everyone already in the team,
    so a raw token here would let any member claim an invitation addressed to somebody else, at
    whatever role it carried.
    """

    __kind__ = "teamInvitation"
    __description__ = "A pending invitation to join a team."
    __title__ = "Team invitation"
    __private__ = True
    __category__ = "config"

    id: str
    email: str
    role: str
    token_hash: str
    invited_by: str | None = None
    created_at: str
    expires_at: str


class TeamInvitationPublic(BaseModelWithConfig):
    """An invitation as the team page may see it -- everything but the hash.

    The hash is irreversible, so showing it would leak nothing; it is left out because a member
    reading the list of people who have been invited has no use for it, and a field nobody needs
    is a field somebody eventually builds on.
    """

    __kind__ = "teamInvitationPublic"
    __description__ = "A pending invitation to join a team, without its secret."
    __title__ = "Team invitation"
    __category__ = "config"

    id: str
    email: str
    role: str
    invited_by: str | None = None
    created_at: str
    expires_at: str


class TeamConfig(BaseModelWithConfig):
    __kind__ = "teamConfig"
    __description__ = "The config of a team."
    __title__ = "Team config"
    __private__ = True
    __category__ = "config"

    details: str | None = None
    #: Pending invitations by id. Empty for every team that existed before invitations did, which
    #: is why this needs no backfill: absent and "nobody is invited" are the same thing.
    invitations: dict[str, TeamInvitation] = Field(default_factory=dict)


class Team(ResourceWithConfig, table=True):
    __tablename__ = "teams"
    __kind__ = "team"
    __title__ = "Team"
    __description__ = "A team object for collaboration and project management."
    __config_type__ = TeamConfig
    __display_profile__ = ResourceDisplayProfile(
        kind="team",
        title_fields=("name", "title", "id"),
        metadata_fields=("owner_id",),
        date_fields=("time_updated", "time_created"),
    )

    owner_id: uuid.UUID | None = Field(
        default=None,
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
