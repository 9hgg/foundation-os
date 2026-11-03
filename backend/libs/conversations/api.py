import uuid

from fastapi import status

from libs.acl.methods import cannot, create_default_acls
from libs.acl.models import Acl, Operation, Who
from libs.articles.models import Article
from libs.db.methods import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.endpoints import add_acl_filters
from libs.messages.models import Message
from libs.resource import ResourceManager
from libs.users.models import User
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput, unauthorized_output

from .models import Conversation


def create_crud_conversation_router(prefix: str = "/api/conversations"):  # noqa: C901
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

        # Support/backlog tickets must be manageable by admins: grant the admin group
        # full READ/WRITE/DELETE on the underlying article so they can triage them (and
        # so admin notifications about the ticket can actually load it). Without this,
        # newly created tickets only carry the author's ACLs.
        ResourceType = ResourceManager.get_resource_by_kind(conversation_db.resource_kind)
        resource_db = ResourceType.by_id(resource_id) if resource_id else None
        if resource_db and resource_db.__kind__ == Article.__kind__ and resource_db.kind == "support":
            create_default_acls(
                resource=resource_db,
                who=Who.admin,
            )
        elif resource_db and resource_db.__kind__ == Article.__kind__ and resource_db.kind == "backlog":
            create_default_acls(
                resource=resource_db,
                who=Who.admin,
            )
            # let anonymous users read the backlog article (public roadmap)
            create_default_acls(
                resource=resource_db,
                who=Who.anonymous,
                create_write_acl=False,
                create_read_acl=True,
                create_delete_acl=False,
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


    @crud_conversation_router.get(
        "/{conversation_id}/transcript",
        status_code=status.HTTP_200_OK,
    )
    async def get_conversation_transcript(
        conversation_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        """Admin-only: the whole conversation as a flat transcript.

        Everything the client needs to render/copy it in one call — every message (not a page)
        with its author's pseudo and email resolved server-side, so the client doesn't have to
        paginate then fan out one public-details request per author.
        """
        current_user_db, _, translator = classic_deps

        if current_user_db is None or not current_user_db.is_admin():
            return unauthorized_output(translator)

        try:
            conversation_uuid = uuid.UUID(conversation_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(title=translator.translate("Invalid conversation ID"), code="invalid_conversation_id")
            )

        with context_db() as db:
            messages = (
                db.query(Message)
                .filter(Message.conversation_id == conversation_uuid)
                .order_by(Message.time_created.asc())
                .all()
            )
            author_ids = {message.author_id for message in messages if message.author_id}
            authors = db.query(User).filter(User.id.in_(author_ids)).all() if author_ids else []

        authors_by_id = {author.id: author for author in authors}
        entries = []
        for message in messages:
            author = authors_by_id.get(message.author_id) if message.author_id else None
            entries.append(
                {
                    "id": str(message.id),
                    "timeCreated": message.time_created,
                    "authorId": str(message.author_id) if message.author_id else None,
                    "authorPseudo": (author.pseudo if author and author.pseudo else None),
                    "authorEmail": (author.email if author else None),
                    "kind": message.kind,
                    "content": message.content,
                }
            )

        return EndpointOutput(result={"conversationId": conversation_id, "messages": entries})

    return crud_conversation_router
