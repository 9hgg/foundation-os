import uuid

from fastapi import APIRouter
from rich import print

from libs.acl.models import Acl
from libs.db import context_db
from libs.mails.methods import add_mail_to_db
from libs.sessions.deps import CurrentSession__dep
from libs.users.deps import CurrentUser__dep
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .endpoints import get_resource_if_READ_allowed, get_resource_if_WRITE_allowed


def create_dummy_test_endpoints_router():
    api_test_router = APIRouter()

    # test endpoint
    @api_test_router.get("/test-api/state")
    async def test(
        current_user_db: CurrentUser__dep,
        current_session_db: CurrentSession__dep,
    ):
        """
        This endpoint is used to test the API.
        It returns the current app, user, session and matching paths.
        """

        if current_user_db:
            print("user", current_user_db.email)
        if current_session_db:
            print("session", current_session_db.id)

    # test endpoint
    @api_test_router.get("/test-api/stateless")
    async def test_nothing():
        return None

    # test endpoint
    @api_test_router.get("/test-api/exit/{exit_code}")
    def test_exit(exit_code: int):
        """
        This endpoint is used to test the API.
        It returns the current app, user, session and matching paths.
        """

        print("exit test", exit_code)
        exit(exit_code)

    @api_test_router.get("/test-api/sentry-debug")
    async def trigger_error():
        division_by_zero = 1 / 0
        return division_by_zero

    return api_test_router


def create_resource_router():
    """
    Create a router for global resource operations.
    """
    router = APIRouter(prefix="/api/resources", tags=["resources"])

    @router.get("/for/{resource_kind}/{resource_id}/acls")
    async def list_resource_acls(
        resource_kind: str,
        resource_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        """
        List all ACLs for a specific resource.
        Checks if the user has at least READ access (including team-inherited access).
        """
        current_user_db, session_db, _ = classic_deps

        # check uuid compatibility
        try:
            uuid.UUID(resource_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid resource ID",
                    description="The resource ID is invalid",
                    code="BadRequest",
                )
            )

        # Check if user has READ access (including team-inherited access)

        resource_db = get_resource_if_READ_allowed(current_user_db, session_db, resource_kind, resource_id)

        if resource_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="Unauthorized",
                    description="You are not allowed to view ACLs for this resource",
                    code="Unauthorized",
                )
            )

        # If allowed, return ALL ACLs for this resource

        can_write = get_resource_if_WRITE_allowed(current_user_db, session_db, resource_kind, resource_id) is not None

        with context_db() as db:
            acls = db.query(Acl).filter(Acl.resource_kind == resource_kind).filter(Acl.resource_id == resource_id).all()

        return EndpointOutput(result={"acls": acls, "canWrite": can_write})

    @router.post("/for/{resource_kind}/{resource_id}/update-rights")
    async def update_resource_rights(
        resource_kind: str,
        resource_id: str,
        request_data: dict,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Update ACL rights for a who (user/team/etc) on a specific resource.
        Checks if the user has WRITE access (including team-inherited access).
        """
        current_user_db, session_db, _ = classic_deps

        # Validate required fields
        if "whoKind" not in request_data or "whoId" not in request_data or "rights" not in request_data:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid request",
                    description="Missing required fields: whoKind, whoId, or rights",
                    code="BadRequest",
                ),
            )

        who_kind = request_data["whoKind"]
        who_id = request_data["whoId"]
        rights = request_data["rights"]

        # Check if user has WRITE access (including team-inherited access)

        resource_db = get_resource_if_WRITE_allowed(current_user_db, session_db, resource_kind, resource_id)

        if resource_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="Unauthorized",
                    description="You are not allowed to modify access rights for this resource",
                    code="Unauthorized",
                )
            )

        # Update rights
        from libs.acl.methods import update_acl_rights

        result_acls = update_acl_rights(
            resource_kind=resource_kind,
            resource_id=resource_id,
            who_kind=who_kind,
            who_id=who_id,
            rights=rights,
        )

        return EndpointOutput(result=result_acls)

    @router.post("/invite-by-email")
    async def invite_by_email(
        request_data: dict,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Send a transactional email to invite a user to the platform.
        """
        current_user_db, _, _ = classic_deps

        if "email" not in request_data:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid request",
                    description="Missing required field: email",
                    code="BadRequest",
                ),
            )

        email = request_data["email"].lower()

        # Simple invitation email
        subject = f"Invitation"
        body = f"Hello,\n\nYou have been invited by {current_user_db.email}.\n\nPlease register at your earliest convenience."

        add_mail_to_db(
            sender_email="contact@example.com",
            recipient_emails=[email],
            subject=subject,
            text_content=body,
            html_content=f"<p>{body}</p>",
        )

        return EndpointOutput(result={"message": "Invitation sent"})

    return router
