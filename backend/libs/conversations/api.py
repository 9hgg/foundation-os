import uuid

from fastapi import status

from libs.acl.methods import cannot, create_default_acls
from libs.acl.models import Acl, Operation, Who
from libs.db.methods import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.endpoints import add_acl_filters
from libs.resource import ResourceManager
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .models import Conversation


def create_crud_conversation_router(prefix: str = "/api/conversations"):
    crud_conversation_router = create_crud_endpoints(
        Conversation,
        prefix=prefix,
        tags=["conversations"],
        include_create=True,
        include_update=True,
        include_delete=True,
        include_simplified=True,
    )

    @crud_conversation_router.post(
        "/for/{resource_kind}/{resource_id}/{key}",
        status_code=status.HTTP_200_OK,
    )
    async def create_conversation_for(
        resource_id: str,
        resource_kind: str,
        key: str,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Get conversation by key
        Redundant with resource endpoint "by/{key}" but needed to
        create a new conversation if it does not exist ensuring the ACL on the targeted resource.
        key can be used to have multiple conversations about the same resource.
        """

        try:
            uuid.UUID(resource_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid resource ID",
                    description="The resource ID is invalid",
                    details={
                        "resourceId": resource_id,
                    },
                )
            )

        current_user_db, session_db, translator = classic_deps

        # check if user is authenticated
        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in to create a resource."),
                    code="Unauthorized",
                )
            )

        if cannot(
            who_id=current_user_db.id,
            resource_type=resource_kind,
            resource_id=resource_id,
            what=Operation.WRITE,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You are not allowed to write this resource."),
                    code="Unauthorized",
                )
            )

        conversation_db = Conversation.get_first_by(
            key=key,
            resource_kind=resource_kind,
            resource_id=resource_id,
        )

        if conversation_db:
            return EndpointOutput(
                result={"keyAvailable": False, "key": key, "conversation": conversation_db, "created": False},
            )

        # create conversation if not exists
        conversation_db = Conversation.create(
            obj_dict={
                "key": key,
                "resource_kind": resource_kind,
                "resource_id": resource_id,
                "config": {"availableReactions": ["👍", "❤️", "😂", "🤔", "😢", "🙏"]},
            }
        )

        create_default_acls(
            resource=conversation_db,
            who=Who.user,
            who_id=current_user_db.id,
        )

        return EndpointOutput(
            result={"keyAvailable": True, "key": key, "conversation": conversation_db, "created": True},
        )

    @crud_conversation_router.get(
        "/for/{resource_kind}/{resource_id}/{key}",
        status_code=status.HTTP_200_OK,
    )
    async def get_conversation_for(
        resource_id: str,
        resource_kind: str,
        key: str,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Get conversation by key. Does not create a new conversation if it does not exist.
        Bypass conversation ACL but check the resource ACL.
        eg: if the article is readable by the user, its conversation is readable too.
        """

        current_user_db, session_db, translator = classic_deps

        # return error if resource id is not uuid compatible
        try:
            uuid.UUID(resource_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid resource ID",
                    description="The resource ID is invalid",
                    details={
                        "resourceId": resource_id,
                    },
                )
            )

        resource_type = ResourceManager.get_resource_by_kind(resource_kind)

        if current_user_db and current_user_db.is_admin():
            resource_db = resource_type.by_id(resource_id)
        else:
            with context_db() as db:
                query = (
                    resource_type.query(db)
                    .filter(resource_type.id == resource_id)
                    .join(Acl, Acl.resource_id == resource_id)
                    .filter(Acl.operation == Operation.READ.value)
                    .filter(Acl.resource_kind == resource_kind)
                )

                query = add_acl_filters(current_user_db, session_db, query)

                # group by resource_id to avoid duplicates
                query = query.group_by(resource_type.id)

                resource_db = query.first()
        if resource_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="Conversation target not found",
                    description="The conversation resource you are looking for does not exist or you do not have the right to read it.",
                    code="ConversationResourceNotFound",
                    details={
                        "resourceId": resource_id,
                        "resourceKind": resource_kind,
                    },
                )
            )

        # resource exists and user has access to it

        # get conversation
        conversation_db = Conversation.get_first_by(
            key=key,
            resource_kind=resource_kind,
            resource_id=resource_id,
        )

        return EndpointOutput(
            result={"conversation": conversation_db},
        )

    return crud_conversation_router
