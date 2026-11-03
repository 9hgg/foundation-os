import uuid

import structlog
from fastapi import Request

from libs.acl.methods import (
    Operation,
    cannot,
    create_default_acls_by_id,
)
from libs.acl.models import Acl, Who
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.teams.config import TEAM_SETTINGS
from libs.teams.invitations import (
    find_invitation,
    find_invitation_for_email,
    mint_invitation,
    normalise_email,
    read_link_token,
    refresh_invitation,
)
from libs.teams.mails import send_invitation_email
from libs.teams.methods import (
    add_to_team,
    change_team_owner,
    change_team_role,
    get_team_with_members_with_roles,
    remove_from_team,
    set_team_invitations,
)
from libs.users.models import User
from libs.utils.deps import ClassicDeps__dep
from libs.utils.origin import get_preferred_origin
from libs.utils.types import BaseModelWithConfig, EndpointError, EndpointOutput

from .models import Membership, Team, TeamInvitation, TeamInvitationPublic

logger = structlog.get_logger(__name__)


class InviteByEmailRequest(BaseModelWithConfig):
    email: str
    role: str = "member"


class ClaimInvitationRequest(BaseModelWithConfig):
    token: str


class ClaimedInvitation(BaseModelWithConfig):
    """What the join page needs to say "you are in" and send the person somewhere."""

    team_id: uuid.UUID
    team_name: str | None
    role: str


def _display_name(user: User | None) -> str | None:
    """What to put in front of "invited you". None when a profile says nothing about who it is --
    the mail then leads with the team instead of a stranger's name."""
    if not user:
        return None
    full_name = " ".join(part for part in (user.first_name, user.last_name) if part).strip()
    return user.pseudo or full_name or None


def _public_invitation(invitation: TeamInvitation) -> TeamInvitationPublic:
    return TeamInvitationPublic(**invitation.model_dump(exclude={"token_hash"}))


def create_crud_team_router(prefix: str = "/api/teams"):  # noqa: C901  (router factory: one function, many endpoints)
    crud_team_router = create_crud_endpoints(
        Team,
        prefix=prefix,
        tags=["teams"],
        include_create=True,
        include_update=True,
        include_delete=True,
        include_simplified=True,
    )

    # Add a user to a team
    @crud_team_router.get("/{team_id}/add/{user_id}/{role}")
    async def add_user_to_team(
        team_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, _, translator = classic_deps

        team = Team.by_id(team_id)
        if not team:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Team not found"),
                    description=translator.translate("The specified team does not exist"),
                    code="team_not_found",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        if (
            cannot(
                who_id=current_user_db.id if current_user_db else None,
                resource_type=Team,
                resource_id=team_id,
                what=Operation.WRITE,
                who=Who.user,
            )
            and team.owner_id != current_user_db.id
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot write over this team"),
                    code="access_denied",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        # if no owner_id is provided, use the current user as the owner
        if not team.owner_id:
            change_team_owner(team_id=team_id, new_owner_id=current_user_db.id)

        add_to_team(team_id=team_id, user_id=user_id, role=role)

        # Create ACL for the user on the team
        # All team members get READ access
        create_default_acls_by_id(
            resource_id=team_id,
            resource_kind=Team.__kind__,
            who=Who.user,
            who_id=user_id,
            create_read_acl=True,
            create_write_acl=(role == "admin"),  # Only admins get WRITE access
            create_delete_acl=False,  # Only team creator should be able to delete
        )

        return EndpointOutput(
            result={
                "team_id": team_id,
                "user_id": user_id,
                "role": role,
            }
        )

    # Remove a user from a team
    @crud_team_router.get("/{team_id}/remove/{user_id}")
    async def remove_user_from_team(
        team_id: uuid.UUID,
        user_id: uuid.UUID,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, _, translator = classic_deps

        team = Team.by_id(team_id)
        if not team:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Team not found"),
                    description=translator.translate("The specified team does not exist"),
                    code="team_not_found",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        if (
            cannot(
                who_id=current_user_db.id if current_user_db else None,
                resource_type=Team,
                resource_id=team_id,
                what=Operation.WRITE,
                who=Who.user,
            )
            and team.owner_id != current_user_db.id
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot write over this team"),
                    code="access_denied",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        remove_from_team(team_id=team_id, user_id=user_id)

        if team.owner_id != user_id:
            # Remove all ACLs for this user on this team
            with context_db() as db:
                (
                    db.query(Acl)
                    .filter(Acl.resource_id == team_id)
                    .filter(Acl.resource_kind == Team.__kind__)
                    .filter(Acl.who == Who.user)
                    .filter(Acl.who_id == user_id)
                ).delete()
                db.commit()
        return EndpointOutput(
            result={
                "team_id": team_id,
                "user_id": user_id,
            }
        )

    # Change a user's role in a team
    @crud_team_router.get("/{team_id}/change_role/{user_id}/{new_role}")
    async def change_user_role_in_team(
        team_id: uuid.UUID,
        user_id: uuid.UUID,
        new_role: str,
        classic_deps: ClassicDeps__dep,
    ):
        (
            current_user_db,
            _,
            translator,
        ) = classic_deps

        team = Team.by_id(team_id)
        if not team:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Team not found"),
                    description=translator.translate("The specified team does not exist"),
                    code="team_not_found",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        if team.owner_id != current_user_db.id and cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=Team,
            resource_id=team_id,
            what=Operation.WRITE,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot write over this team"),
                    code="access_denied",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        change_team_role(team_id=team_id, user_id=user_id, new_role=new_role)

        # Update ACLs based on new role
        with context_db() as db:
            # Remove existing WRITE ACL if any
            (
                db.query(Acl)
                .filter(Acl.resource_id == team_id)
                .filter(Acl.resource_kind == Team.__kind__)
                .filter(Acl.who == Who.user)
                .filter(Acl.who_id == user_id)
                .filter(Acl.operation == Operation.WRITE)
            ).delete()

            # Add WRITE ACL if new role is admin
            if new_role == "admin":
                Acl.create(
                    obj_dict={
                        "name": f"WRITE {Team.__kind__} {team_id}",
                        "operation": Operation.WRITE.value,
                        "resource_kind": Team.__kind__,
                        "resource_id": team_id,
                        "who": Who.user.value,
                        "who_id": user_id,
                    },
                    _db=db,
                )
            db.commit()

        return EndpointOutput(
            result={
                "team_id": team_id,
                "user_id": user_id,
                "new_role": new_role,
            }
        )

    # Get team with members and roles
    @crud_team_router.get("/{team_id}/members_with_roles")
    async def get_team_with_members_and_roles(
        team_id: uuid.UUID,
        classic_deps: ClassicDeps__dep,
    ):
        (
            current_user_db,
            _,
            translator,
        ) = classic_deps

        team = Team.by_id(team_id)
        if not team:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Team not found"),
                    description=translator.translate("The specified team does not exist"),
                    code="team_not_found",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        if (
            cannot(
                who_id=current_user_db.id if current_user_db else None,
                resource_type=Team,
                resource_id=team_id,
                what=Operation.READ,
                who=Who.user,
            )
            and team.owner_id != current_user_db.id
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot read this team"),
                    code="access_denied",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        result = get_team_with_members_with_roles(team_id=team_id)

        return EndpointOutput(result=result)

    # Invite somebody to a team by email
    @crud_team_router.post("/{team_id}/invitations")
    async def invite_user_to_team_by_email(
        team_id: uuid.UUID,
        request: InviteByEmailRequest,
        http_request: Request,
        classic_deps: ClassicDeps__dep,
    ):
        """Send an invitation, whether or not the address already has an account.

        Nobody is added by this call. Somebody who already uses the app is invited exactly like
        somebody who does not -- joining a team is theirs to accept, and an admin knowing your
        address is not consent.
        """

        current_user_db, _, translator = classic_deps

        team = Team.by_id(team_id)
        if not team:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Team not found"),
                    description=translator.translate("The specified team does not exist"),
                    code="team_not_found",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        if (
            cannot(
                who_id=current_user_db.id if current_user_db else None,
                resource_type=Team,
                resource_id=team_id,
                what=Operation.WRITE,
                who=Who.user,
            )
            and team.owner_id != current_user_db.id
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot write over this team"),
                    code="access_denied",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        email = normalise_email(request.email)
        if not email:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("No email provided"),
                    description=translator.translate("An invitation needs an address to go to"),
                    code="no_email_provided",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        # Already a member? Then there is nothing to offer -- checked before minting, so a second
        # invitation is never sent to somebody who has already joined.
        user = User.get_first_by(email=email)
        if user:
            with context_db() as db:
                member = (
                    db.query(Membership)
                    .filter(
                        Membership.team_id == team_id,
                        Membership.user_id == user.id,
                    )
                    .first()
                )
                if member:
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("User already in team"),
                            description=translator.translate(
                                "This user is already a member of the team"
                            ),
                            code="user_already_in_team",
                            details={
                                "team_id": team_id,
                                "user_id": user.id,
                            },
                        )
                    )

        # Re-inviting rotates the existing invitation rather than adding a second one, so an
        # address never has two live links and the newest mail is the only one that works.
        invitations = dict(team.config.invitations)
        existing = find_invitation_for_email(invitations, email)
        if existing:
            invitation, token = refresh_invitation(existing, role=request.role)
        else:
            invitation, token = mint_invitation(
                email=email,
                role=request.role,
                invited_by=str(current_user_db.id) if current_user_db else None,
            )
        invitations[invitation.id] = invitation
        set_team_invitations(team_id=team_id, invitations=invitations)

        frontend_url = get_preferred_origin(http_request, TEAM_SETTINGS.FRONTEND_URL)
        if not frontend_url:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Frontend URL not configured"),
                    description=translator.translate(
                        "Please set FRONTEND_URL environment variable"
                    ),
                    code="frontend_url_not_configured",
                )
            )

        send_invitation_email(
            recipient_email=email,
            team_id=team_id,
            team_name=team.name,
            role=invitation.role,
            token=token,
            invited_by_name=_display_name(current_user_db),
            frontend_url=frontend_url,
            translator=translator,
        )
        logger.info("team_invitation_sent", team_id=str(team_id), refreshed=bool(existing))

        return EndpointOutput(result=_public_invitation(invitation))

    # Revoke an invitation
    @crud_team_router.post("/{team_id}/invitations/{invitation_id}/revoke")
    async def revoke_team_invitation(
        team_id: uuid.UUID,
        invitation_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, _, translator = classic_deps

        team = Team.by_id(team_id)
        if not team:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Team not found"),
                    description=translator.translate("The specified team does not exist"),
                    code="team_not_found",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        if (
            cannot(
                who_id=current_user_db.id if current_user_db else None,
                resource_type=Team,
                resource_id=team_id,
                what=Operation.WRITE,
                who=Who.user,
            )
            and team.owner_id != current_user_db.id
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot write over this team"),
                    code="access_denied",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        invitations = dict(team.config.invitations)
        if invitation_id not in invitations:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invitation not found"),
                    description=translator.translate("This invitation is no longer pending"),
                    code="invitation_not_found",
                    details={
                        "team_id": team_id,
                        "invitation_id": invitation_id,
                    },
                )
            )

        invitations.pop(invitation_id)
        set_team_invitations(team_id=team_id, invitations=invitations)
        logger.info("team_invitation_revoked", team_id=str(team_id))

        return EndpointOutput(result={"team_id": team_id, "invitation_id": invitation_id})

    # Claim an invitation
    @crud_team_router.post("/invitations/claim")
    async def claim_team_invitation(
        request: ClaimInvitationRequest,
        classic_deps: ClassicDeps__dep,
    ):
        """Join the team a link was minted for.

        Authorized by the token alone -- the person claiming has no rights on the team yet, which
        is the whole point. The role granted is the one the invitation carries now, not the one it
        carried when the mail went out.
        """

        current_user_db, _, translator = classic_deps

        if not current_user_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    description=translator.translate("Sign in to accept this invitation"),
                    code="unauthorized",
                )
            )

        # One error for every way a link can fail to open something, so a stranger holding a token
        # learns nothing about which teams exist or which invitations are live.
        invalid = EndpointOutput(
            error=EndpointError(
                title=translator.translate("Invitation not valid"),
                description=translator.translate(
                    "This invitation link is invalid, or it has expired"
                ),
                code="invitation_not_valid",
            )
        )

        read = read_link_token(request.token)
        if not read:
            return invalid
        team_id, token = read

        team = Team.by_id(team_id)
        if not team:
            return invalid

        invitation = find_invitation(team.config.invitations, token)
        if not invitation:
            return invalid

        if not current_user_db.email or normalise_email(current_user_db.email) != invitation.email:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invitation is for another address"),
                    description=translator.translate(
                        "Sign in with the address this invitation was sent to"
                    ),
                    code="invitation_other_email",
                    details={
                        "invited_email": invitation.email,
                    },
                )
            )

        add_to_team(team_id=team_id, user_id=current_user_db.id, role=invitation.role)
        create_default_acls_by_id(
            resource_id=team_id,
            resource_kind=Team.__kind__,
            who=Who.user,
            who_id=current_user_db.id,
            create_read_acl=True,
            create_write_acl=(invitation.role == "admin"),
            create_delete_acl=False,
        )

        # Cleared once claimed: the link is spent, and a team's config should not keep a record of
        # who was invited to become somebody who is simply a member now.
        invitations = dict(team.config.invitations)
        invitations.pop(invitation.id, None)
        set_team_invitations(team_id=team_id, invitations=invitations)
        logger.info("team_invitation_claimed", team_id=str(team_id))

        return EndpointOutput(
            result=ClaimedInvitation(
                team_id=team_id,
                team_name=team.name,
                role=invitation.role,
            )
        )

    # Change team ownership
    @crud_team_router.put("/{team_id}/change_owner/{new_owner_id}")
    async def change_team_ownership(
        team_id: uuid.UUID,
        new_owner_id: uuid.UUID,
        classic_deps: ClassicDeps__dep,
    ):
        (
            current_user_db,
            _,
            translator,
        ) = classic_deps

        team = Team.by_id(team_id)
        if not team:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Team not found"),
                    description=translator.translate("The specified team does not exist"),
                    code="team_not_found",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        if current_user_db.id != team.owner_id:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You are not the owner of this team"),
                    code="access_denied",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        # Verify the new owner exists
        new_owner = User.get_first_by(id=new_owner_id)
        if not new_owner:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    description=translator.translate("The new owner user does not exist"),
                    code="user_not_found",
                    details={
                        "team_id": team_id,
                        "new_owner_id": new_owner_id,
                    },
                )
            )

        # Change the team owner
        success = change_team_owner(team_id=team_id, new_owner_id=new_owner_id)

        if not success:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Failed to change owner"),
                    description=translator.translate("Could not change team owner"),
                    code="change_owner_failed",
                    details={
                        "team_id": team_id,
                    },
                )
            )

        # Update ACLs: Give the new owner full access (READ, WRITE, DELETE)
        with context_db() as db:
            # Remove any existing ACLs for the new owner on this team before recreating them
            (
                db.query(Acl)
                .filter(Acl.resource_id == team_id)
                .filter(Acl.resource_kind == Team.__kind__)
                .filter(Acl.who == Who.user)
                .filter(Acl.who_id == new_owner_id)
            ).delete()

            # Create full access ACLs for the new owner
            create_default_acls_by_id(
                resource_id=team_id,
                resource_kind=Team.__kind__,
                who=Who.user,
                who_id=new_owner_id,
                create_read_acl=True,
                create_write_acl=True,
                create_delete_acl=True,
                _db=db,
            )
            db.commit()

        return EndpointOutput(
            result={
                "team_id": team_id,
                "old_owner_id": current_user_db.id if current_user_db else None,
                "new_owner_id": new_owner_id,
            }
        )

    # @crud_team_router.post(
    #     "/{team_id}/acl/update",
    #     response_model=EndpointOutput[list[Acl]],
    # )
    # async def update_team_acl_rights(
    #     team_id: str,
    #     request_data: dict,
    #     current_user_db: User = Depends(get_current_user_optional),
    # ):
    #     """
    #     Update ACL rights for a team on a resource.
    #     Used to "(un)share with a team"
    #     """

    #     # Validate required fields
    #     if "resourceId" not in request_data or "resourceKind" not in request_data or "rights" not in request_data:
    #         return EndpointOutput(
    #             error=EndpointError(
    #                 title="Invalid request",
    #                 description="Missing required fields: resourceId, resourceKind, or rights",
    #                 code="BadRequest",
    #             ),
    #         )

    #     resource_id = request_data["resourceId"]
    #     resource_kind: str = request_data["resourceKind"]
    #     rights = request_data["rights"]

    #     is_team_member = False
    #     if current_user_db:
    #         # Check if the current user is a member of the team
    #         with context_db() as db:
    #             is_team_member = (
    #                 db.query(Membership)
    #                 .filter(
    #                     Membership.team_id == team_id,
    #                     Membership.user_id == current_user_db.id,
    #                 )
    #                 .first()
    #             ) is not None

    #     # Check if current user has WRITE permission on the team OR is a MEMBER of the team
    #     if (
    #         cannot(
    #             who_id=(current_user_db.id if current_user_db else None),
    #             what=Operation.WRITE,
    #             resource_type=Team,
    #             resource_id=team_id,
    #         )
    #         and not is_team_member
    #     ):
    #         return EndpointOutput(
    #             error=EndpointError(
    #                 title="Unauthorized",
    #                 description="You have no write access to this team or are not a member of the team",
    #                 code="Unauthorized",
    #             ),
    #         )

    #     result_acls = update_acl_rights(
    #         resource_kind=resource_kind,
    #         resource_id=resource_id,
    #         who_kind=Who.team,
    #         who_id=team_id,
    #         rights=rights,
    #     )
    #     print(f"Updated ACLs: {result_acls}")
    #     return EndpointOutput(result=result_acls)

    return crud_team_router
