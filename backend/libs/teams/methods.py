import uuid

from sqlalchemy.orm import Session

from libs.db import context_db
from libs.users.models import User

from .models import Membership, Team


def add_to_team(
    *,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str = "member",
    _db: Session | None = None,
) -> None:
    # 1) Check if already in the team
    with context_db(_db) as db:
        already_in_team = (
            db.query(Membership)
            .filter(
                Membership.team_id == team_id,
                Membership.user_id == user_id,
            )
            .first()
        )
        if already_in_team:
            return

    # 2) If not, add it to the team
    with context_db(_db) as db:
        db.add(
            Membership(
                team_id=team_id,
                user_id=user_id,
                role=role,
            )
        )
        db.commit()


def remove_from_team(
    *,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    _db: Session | None = None,
) -> None:
    with context_db(_db) as db:
        team_to_resource = (
            db.query(Membership)
            .filter(
                Membership.team_id == team_id,
                Membership.user_id == user_id,
            )
            .first()
        )

        if team_to_resource:
            db.delete(team_to_resource)
            db.commit()


def change_team_role(
    *,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    new_role: str,
    _db: Session | None = None,
) -> None:
    with context_db(_db) as db:
        membership = (
            db.query(Membership)
            .filter(
                Membership.team_id == team_id,
                Membership.user_id == user_id,
            )
            .first()
        )

        if membership:
            membership.role = new_role
            db.commit()


def get_team_with_members_with_roles(
    *,
    team_id: uuid.UUID,
    _db: Session | None = None,
) -> dict:
    with context_db(_db) as db:
        # First, get the team
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            return {"team": None, "members": []}

        # Then get all members with their roles
        results = (
            db.query(User, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .filter(Membership.team_id == team_id)
            .all()
        )

        members_with_roles = [
            {
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "firstName": user.first_name,
                    "lastName": user.last_name,
                    "pseudo": user.pseudo,
                    "profilePictureId": (
                        user.config.profile_picture_id if user.config else None
                    ),
                },
                "role": role,
            }
            for user, role in results
        ]

        return {"team": team, "members": members_with_roles}


def change_team_owner(
    *,
    team_id: uuid.UUID,
    new_owner_id: uuid.UUID,
    _db: Session | None = None,
) -> bool:
    """
    Change the owner of a team.

    Args:
        team_id: The ID of the team
        new_owner_id: The ID of the new owner
        _db: Optional database session

    Returns:
        bool: True if the owner was changed successfully, False if team not found
    """
    with context_db(_db) as db:
        team = db.query(Team).filter(Team.id == team_id).first()

        if not team:
            return False

        team.owner_id = new_owner_id
        db.commit()
        return True
