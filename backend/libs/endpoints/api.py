import uuid

import structlog
from fastapi import APIRouter

from libs.acl.models import Acl
from libs.db import context_db
from libs.mails.methods import add_mail_to_db
from libs.sessions.deps import CurrentSession__dep
from libs.users.config import USER_SETTINGS
from libs.users.deps import CurrentUser__dep
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .endpoints import get_resource_if_READ_allowed, get_resource_if_WRITE_allowed

logger = structlog.get_logger(__name__)


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

        logger.warning("test_api_exit_requested", exit_code=exit_code)
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
        from libs.acl.methods import count_other_holders, update_acl_rights

        # No resource kind carries an owner column, so its ACL rows are the only record of who may
        # touch it. Dropping the last write seals it for everybody and dropping the last read hides
        # it from everybody, with no way back through the product: granting the right again needs a
        # right nobody holds any more. Handing a resource over still works -- give the other party
        # the right first, then drop your own.
        for guarded, verb in (("write", "edit"), ("read", "see")):
            if rights.get(guarded) == "remove" and (
                count_other_holders(
                    operation=guarded,
                    resource_kind=resource_kind,
                    resource_id=resource_id,
                    who_kind=who_kind,
                    who_id=who_id,
                )
                == 0
            ):
                return EndpointOutput(
                    error=EndpointError(
                        title=f"Someone has to keep {guarded} access",
                        description=(
                            f"Removing this {guarded} access would leave nobody able to {verb} "
                            f"this {resource_kind}. Give {guarded} access to someone else first."
                        ),
                        code="LastHolder",
                    )
                )

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

        if not current_user_db or not current_user_db.email_verified:
            return EndpointOutput(
                error=EndpointError(
                    title="Unauthorized",
                    description="A verified account is required to send invitations.",
                    code="Unauthorized",
                ),
            )

        if "email" not in request_data:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid request",
                    description="Missing required field: email",
                    code="BadRequest",
                ),
            )

        email = request_data["email"].lower()

        # Fixed template, not sourced from request_data: the invited address is the
        # only untrusted input, and it never flows into the body — keeps this endpoint
        # unusable to relay attacker-chosen content.
        subject = "Invitation"
        body = f"Hello,\n\nYou have been invited by {current_user_db.email}.\n\nPlease register at your earliest convenience."

        add_mail_to_db(
            sender_email=USER_SETTINGS.SENDER_EMAIL,
            recipient_emails=[email],
            subject=subject,
            text_content=body,
            html_content=f"<p>{body}</p>",
        )

        return EndpointOutput(result={"message": "Invitation sent"})

    return router
