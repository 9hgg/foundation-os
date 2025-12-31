import uuid

from pydantic import BaseModel

from libs.acl.methods import (
    Operation,
    cannot,
    create_default_acls_by_id,
)
from libs.acl.models import Acl, Who
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.teams.methods import (
    add_to_team,
    change_team_owner,
    change_team_role,
    get_team_with_members_with_roles,
    remove_from_team,
)
from libs.users.models import User
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .models import Membership, Team


class AddUserByEmailRequest(BaseModel):
    user_email: str
    role: str = "member"


def create_crud_team_router(prefix: str = "/api/teams"):
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

    # Add a user to a team by email
    @crud_team_router.post("/{team_id}/add_by_email")
    async def add_user_to_team_by_email(
        team_id: uuid.UUID,
        request: AddUserByEmailRequest,
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

        # Find user by email
        user = User.get_first_by(email=request.user_email)
        if not user:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    description=translator.translate("No user found with this email address"),
                    code="user_not_found",
                    details={
                        "team_id": team_id,
                        "user_email": request.user_email,
                    },
                )
            )
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
                        description=translator.translate("This user is already a member of the team"),
                        code="user_already_in_team",
                        details={
                            "team_id": team_id,
                            "user_id": user.id,
                        },
                    )
                )

        # Use existing method to add user to team
        add_to_team(team_id=team_id, user_id=user.id, role=request.role)

        # Create ACL for the user on the team
        # All team members get READ access
        create_default_acls_by_id(
            resource_id=team_id,
            resource_kind=Team.__kind__,
            who=Who.user,
            who_id=user.id,
            create_read_acl=True,
            create_write_acl=(request.role == "admin"),  # Only admins get WRITE access
            create_delete_acl=False,  # Only team creator should be able to delete
        )

        return EndpointOutput(
            result={
                "team_id": team_id,
                "user_id": user.id,
                "role": request.role,
            }
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
