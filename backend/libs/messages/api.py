import typing
import uuid

import fastapi
from fastapi import Body, Query, Request, status
from sqlalchemy import func

from libs.acl.methods import create_default_acls, get_user_writers, purge_acls_for_resource
from libs.acl.models import Acl, Operation, Who
from libs.conversations.models import Conversation
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.endpoints import add_acl_filters, decode_filters, get_resource_if_READ_allowed
from libs.endpoints.types import PaginatedResponse, SimpleResponse, get_paginated_results
from libs.logger.customLogger import print_color
from libs.notifications.methods import notify, notify_to_writers
from libs.resource import ResourceManager, getattr_by_alias_or_name
from libs.users.models import User
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .models import Message


def create_crud_message_router(prefix: str = "/api/messages"):
    """
    Create a CRUD router for messages with custom endpoints.
    """
    # custom endpoints for Message to check author_id
    crud_message_router = create_crud_endpoints(
        Message,
        prefix=prefix,
        tags=["messages"],
        include_read=False,  # to bypass: reading messages needs to know if the conversation target is readable
        include_create=False,  # to bypass: creating messages needs to check author_id
        include_update=False,  # to bypass: updating messages needs to check author_id
        include_delete=True,
    )

    @crud_message_router.delete(
        "/admin/{message_id}",
        status_code=status.HTTP_200_OK,
        response_model=EndpointOutput[SimpleResponse[Message]],
    )
    def delete_message_as_admin(
        message_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, _, translator = classic_deps
        if not current_user_db or not current_user_db.email_verified:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    description=translator.translate("You must be logged in with a verified email to delete messages."),
                    code="Unauthorized",
                )
            )
        if not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    description=translator.translate("You must be an administrator to delete messages."),
                    code="Unauthorized",
                )
            )

        try:
            parsed_message_id = uuid.UUID(message_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid resource ID",
                    description="The resource ID is invalid.",
                    code="BadRequest",
                )
            )

        message_db = Message.by_id(parsed_message_id)
        if not message_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Message not found."),
                    code="NotFound",
                )
            )

        Message.delete(obj_id=parsed_message_id)
        purge_acls_for_resource(resource_kind=Message.__kind__, resource_id=parsed_message_id)
        return EndpointOutput(
            result=SimpleResponse(
                data=message_db,
                self=f"/admin/{message_id}",
                all=crud_message_router.prefix + "/?page=1",
            )
        )

    @crud_message_router.get(
        "",
        status_code=status.HTTP_200_OK,
        response_model=EndpointOutput[PaginatedResponse[Message]],
        operation_id=f"list_{Message.__kind__}_paginated",
        summary=(f"List all accessible from {Message.__tablename__}, paginated"),
    )
    def read_resources(
        request: Request,
        classic_deps: ClassicDeps__dep,
        page: int = Query(1, gt=0),
        page_size: int = Query(100, gt=0, le=1000),
        filters: typing.Optional[list[str]] = Query(None),
        ordering_by: typing.Optional[str] = Query(None),
    ):
        """
        List all messages with pagination and filters.
        """
        current_user_db, session_db, translator = classic_deps

        filter_objs = decode_filters(filters)

        conversation_id = None

        # check we have a conversation filter
        # if not any(f.field_name == "conversation_id" for f in filter_objs):
        for f in filter_objs:
            if f.field_name == "conversation_id":
                conversation_id = f.value
                break
        if not conversation_id:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Bad Request"),
                    description=translator.translate("You must provide a conversation_id filter."),
                    details={
                        "filters": filters,
                    },
                    code="BadRequest",
                )
            )

        try:
            uuid.UUID(conversation_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid conversation ID",
                    description="The conversation ID is invalid",
                    details={
                        "conversationId": conversation_id,
                    },
                )
            )

        conversation_db = Conversation.by_id(conversation_id)
        if not conversation_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Conversation not found."),
                    code="NotFound",
                )
            )

        # check if the user has access to the conversation resource
        if conversation_db.resource_kind is not None and not (current_user_db and current_user_db.is_admin()):
            resource_db = get_resource_if_READ_allowed(
                current_user_db, session_db, conversation_db.resource_kind, conversation_db.resource_id
            )

            if resource_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title="Conversation target not found",
                        description="The conversation resource you are looking for does not exist or you do not have the right to read it.",
                        code="ConversationResourceNotFound",
                        details={
                            "resourceId": conversation_db.resource_id,
                            "resourceKind": conversation_db.resource_kind,
                        },
                    )
                )

        # check if the conversation is active or disabled
        if conversation_db.status not in ["active", "disabled"]:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Bad Request"),
                    description=translator.translate("Conversation is not available."),
                    details={
                        "conversation_id": conversation_id,
                        "conversation_status": conversation_db.status,
                    },
                    code="BadRequest",
                )
            )

        with context_db() as db:
            query = db.query(Message)
            # no acl filters, just query filters
            for f in filter_objs:
                if not hasattr(Message, f.field_name):
                    raise fastapi.HTTPException(
                        status_code=400,
                        detail=f"Invalid filter field: {f.field_name}",
                    )

                field = getattr(Message, f.field_name)
                if f.comparison:
                    if f.comparison == "<":
                        query = query.filter(field < f.value)
                    elif f.comparison == ">":
                        query = query.filter(field > f.value)
                    elif f.comparison == "<=":
                        query = query.filter(field <= f.value)
                    elif f.comparison == ">=":
                        query = query.filter(field >= f.value)
                else:
                    if f.match_type == "exact":
                        query = query.filter(field == f.value)
                    elif f.match_type == "partial":
                        print_color(
                            "yellow",
                            "Partial match on",
                            field,
                            "using:",
                            (f.value.lower() if isinstance(f.value, str) else f.value),
                            "for",
                            f.value,
                        )

                        query = query.filter(field.ilike(f"%{f.value}%"))

                    else:
                        raise fastapi.HTTPException(
                            status_code=400,
                            detail=f"Invalid match type: {f.match_type}",
                        )

            # group by resource_id to avoid duplicates
            query = query.group_by(Message.id)

            # order as request (default to time created)
            if ordering_by:
                ordering_field_name, direction = ordering_by.split(":", 2)
                if ordering_field_name:
                    ordering_field = getattr_by_alias_or_name(Message, ordering_field_name)

                    if isinstance(ordering_field.type, str):
                        # if the field is a string, we lowercase it
                        ordering_field = func.lower(ordering_field)

                    if direction == "desc":
                        query = query.order_by(ordering_field.desc())
                    else:
                        query = query.order_by(ordering_field.asc())
            else:
                query = query.order_by(Message.time_created.asc())

            # print the query
            # print_color("yellow", query)

            root_url = f"{request.base_url.scheme}://{request.base_url.netloc}{crud_message_router.url_path_for('read_resources')}"
            result = get_paginated_results(
                query,
                page,
                page_size,
                root_url=root_url,
                self=f"{root_url}?page={page}&page_size={page_size}",
            )

        return EndpointOutput(
            result=result,
        )

    @crud_message_router.get(
        "/{message_id}",
        status_code=status.HTTP_200_OK,
        response_model=EndpointOutput[SimpleResponse[Message]],
        operation_id=f"get_{Message.__kind__}",
        summary=f"Get a row from {Message.__tablename__}",
    )
    def read_resource(
        message_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Retrieve a message by ID.
        """

        current_user_db, session_db, translator = classic_deps

        # return error if resource id is not uuid compatible
        try:
            uuid.UUID(message_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title="Invalid resource ID",
                    description="The resource ID is invalid",
                    details={
                        "resourceId": message_id,
                    },
                )
            )

        message_db = Message.by_id(message_id)
        if not message_db:
            return EndpointOutput(
                error=EndpointError(
                    title="Item not found",
                    description="The item you are looking for does not exist or you do not have the right to read it.",
                    code="ItemNotFound",
                )
            )

        conversation_db = Conversation.by_id(message_db.conversation_id)

        if not conversation_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Conversation not found."),
                    code="NotFound",
                )
            )

        # check if the user has access to the conversation resource
        if conversation_db.resource_kind is not None and not (current_user_db and current_user_db.is_admin()):
            resource_type = ResourceManager.get_resource_by_kind(conversation_db.resource_kind)
            resource_id = conversation_db.resource_id
            resource_kind = conversation_db.resource_kind

            with context_db() as db:
                query = (
                    db.query(resource_type)
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

        # check if the conversation is active or disabled
        if conversation_db.status not in ["active", "disabled"]:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Bad Request"),
                    description=translator.translate("Conversation is not available."),
                    details={
                        "conversation_id": conversation_db.id,
                        "conversation_status": conversation_db.status,
                    },
                    code="BadRequest",
                )
            )

        return EndpointOutput(
            result=SimpleResponse(
                data=message_db,
                self=f"/{message_id}",
                all=crud_message_router.prefix + "/?page=1",
            )
        )

    @crud_message_router.put(
        "/{message_id}",
        status_code=status.HTTP_200_OK,
        response_model=EndpointOutput[SimpleResponse[Message]],
        operation_id=f"update_{Message.__kind__}",
        summary=f"Update a row in {Message.__tablename__}",
    )
    def update_resource(
        message_id: str,
        message_in: Message,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Update a message by ID.
        """
        current_user_db, session, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in to create a resource."),
                    code="Unauthorized",
                )
            )

        with context_db() as db:
            query = (
                db.query(Message)
                .filter(Message.id == message_id)
                .join(Acl, Acl.resource_id == Message.id)
                .filter(Acl.operation == Operation.WRITE.value)
                .filter(Acl.resource_kind == Message.__kind__)
            )
            query = add_acl_filters(current_user_db, session, query)

            # group by resource_id to avoid duplicates
            query = query.group_by(Message.id)

            message_through_acl_db = query.first()

            # independant of ACLs
            message_already_exists = Message.in_db(obj_id=message_id, _db=db)

        message_db: typing.Optional[Message] = None

        if message_already_exists:
            if message_through_acl_db is None:
                # resource exists but the user has not access
                return EndpointOutput(
                    error=EndpointError(
                        title="Unauthorized",
                        description=("You do not have the right to write over this resource."),
                        code="Unauthorized",
                    )
                )

            else:
                # resource exists and user has access
                # NOTE:
                #   - update will keep "unset" values to replace them with None
                #   - if values are required, it will raise an error
                #   - you should use patch in this case

                # check if message_in.author_id is same as current_user_db.id
                if str(message_in.author_id) != str(current_user_db.id):
                    return EndpointOutput(
                        error=EndpointError(
                            title="Unauthorized",
                            description="You are not allowed to update this resource.",
                            details={
                                "message_in.author_id": message_in.author_id,
                                "current_user_db.id": current_user_db.id,
                            },
                            code="Unauthorized",
                        )
                    )

                message_db = Message.update(obj_id=message_id, new_obj=message_in)
        else:
            # resource does not exists
            # as the user is logged in, we can create the missing resource
            # check if message_in.author_id is same as current_user_db.id
            if str(message_in.author_id) != str(current_user_db.id):
                return EndpointOutput(
                    error=EndpointError(
                        title="Unauthorized",
                        description="You are not allowed to create this resource.",
                        details={
                            "message_in.author_id": message_in.author_id,
                            "current_user_db.id": current_user_db.id,
                        },
                        code="Unauthorized",
                    )
                )
            else:
                print("message_in.author_id is same as current_user_db.id")

            message_db = Message.create(obj_dict=message_in.model_dump(exclude_unset=True))
            if current_user_db:
                create_default_acls(
                    resource=message_db,
                    who=Who.user,
                    who_id=current_user_db.id,
                    _db=db,
                )
            if session and Message.__ACL_SESSION__:
                create_default_acls(
                    resource=message_db,
                    who=Who.session,
                    who_id=session.id,
                    _db=db,
                )

        # notify the conversation OWNER(s) about the new message
        conversation_db = Conversation.by_id(message_db.conversation_id)
        if not conversation_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Conversation not found."),
                    code="NotFound",
                )
            )

        resource_type = ResourceManager.get_resource_by_kind(conversation_db.resource_kind)
        resource_id = conversation_db.resource_id
        resource_db = resource_type.by_id(resource_id) if resource_id else None

        notify_to_writers(
            resource_id=conversation_db.resource_id,
            resource_kind=conversation_db.resource_kind,
            current_user_db=current_user_db,
            config={
                "conversationId": str(conversation_db.id),
                "messageId": str(message_db.id),
                "userId": str(current_user_db.id),
            },
            kind="comment",
            content="A comment on the conversation of your resource",
            include_admins=True,
            for_key=f"conversation_{conversation_db.id}",
        )

        # if the message has a config["replyTo"] field, notify the user that sent the original message
        if message_db.config.reply_to is not None:
            reply_to_message_db = Message.by_id(message_db.config.reply_to)
            if reply_to_message_db:
                reply_to_user_db = User.by_id(reply_to_message_db.author_id) if reply_to_message_db.author_id else None
                if reply_to_user_db and reply_to_user_db.id != current_user_db.id:
                    notify(
                        resource=resource_db,
                        config={
                            "conversationId": str(conversation_db.id),
                            "messageId": str(message_db.id),
                            "replyToId": str(reply_to_message_db.id),
                            "userId": str(current_user_db.id),
                        },
                        kind="reply",
                        content="A reply to your message",
                        user=reply_to_user_db,  # <= notify the author of the original message
                        for_key=f"user:{reply_to_user_db.id}_conversation_{conversation_db.id}",
                    )

        return EndpointOutput(
            result=SimpleResponse(
                data=message_db,
                self=f"/{message_id}",
                all=crud_message_router.prefix + "/?page=1",
            )
        )

    @crud_message_router.post("/{message_id}/reaction/toggle", status_code=status.HTTP_200_OK)
    def toggle_message_reaction(
        message_id: str,
        classic_deps: ClassicDeps__dep,
        reaction: str = Body(..., description="Reaction emoji"),
    ):
        """
        Toggle a reaction on a message.
        """
        current_user_db, session, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in to react to a message."),
                    code="Unauthorized",
                )
            )
        # check if message exists
        message_db = Message.by_id(message_id)
        if not message_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Message not found."),
                    code="NotFound",
                )
            )

        message_author = User.by_id(message_db.author_id) if message_db.author_id else None

        # get conversation
        conversation_db = Conversation.by_id(message_db.conversation_id)
        if not conversation_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Conversation not found."),
                    code="NotFound",
                )
            )

        resource_type = ResourceManager.get_resource_by_kind(conversation_db.resource_kind)
        resource = resource_type.by_id(conversation_db.resource_id) if conversation_db.resource_id else None

        resource_write_acls = (
            get_user_writers(
                resource_id=conversation_db.resource_id,
                resource_kind=conversation_db.resource_kind,
            )
            if conversation_db.resource_kind and conversation_db.resource_id
            else []
        )

        # check if reaction is allowed
        availableReactions = conversation_db.config.available_reactions or ["👍", "❤️", "😂", "🤔", "😢", "🙏"]
        if reaction not in availableReactions:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Bad Request"),
                    description=translator.translate("Reaction not allowed."),
                    details={
                        "availableReactions": availableReactions,
                        "reaction": reaction,
                    },
                    code="BadRequest",
                )
            )

        # check if conversation status is active
        if conversation_db.status != "active":
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Bad Request"),
                    description=translator.translate("Conversation is not active."),
                    code="BadRequest",
                )
            )

        if message_db.config.reactions is None:
            message_db.config.reactions = []

        # replace the reaction if it already exists or add it if it does not exist or remove it if it is the same

        existingReactions = message_db.config.reactions

        shouldNotify = False

        for existingReaction in existingReactions:
            print("Existing reaction", existingReaction)
            if existingReaction.get("userId") != str(current_user_db.id):
                # skip if the reaction is not from the current user
                continue
            # check if reaction is the same
            if existingReaction.get("emoji") == reaction:
                # remove the reaction
                print("Removing reaction", existingReaction)
                existingReactions.remove(existingReaction)
                shouldNotify = True
                break
            else:
                # update the reaction
                print("Updating reaction", existingReaction)
                existingReaction["emoji"] = reaction
                shouldNotify = True
                break
        else:
            # add the reaction
            existingReactions.append({"userId": str(current_user_db.id), "emoji": reaction})
            shouldNotify = True

        # update the message
        message_db.config.reactions = existingReactions
        message_db = Message.update(obj_id=message_id, new_obj=message_db)

        if shouldNotify and resource:
            # notify the conversation OWNER(s) about the reaction (=writers of the resource)
            notified_users = set()  # to avoid notifying the same user multiple times
            for acl in resource_write_acls:
                if acl.who_id in notified_users:
                    continue
                resource_writer_db = User.by_id(acl.who_id) if acl.who_id else None
                if not resource_writer_db:
                    continue
                notify(
                    resource=resource,
                    config={
                        "conversationId": str(conversation_db.id),
                        "messageId": str(message_db.id),
                        "userId": str(current_user_db.id),
                        "emoji": reaction,
                    },
                    kind="reaction",
                    content="A reaction to a message of the conversation of your resource",
                    # read=False,
                    # title="",
                    user=resource_writer_db,  # <= notify the writer of the resource
                    for_key=f"user:{resource_writer_db.id}_conversation_{conversation_db.id}",
                )
                notified_users.add(resource_writer_db.id)

            # notify the message author about the reaction (if different from the current user)
            if message_author and message_author.id != current_user_db.id and message_author.id not in notified_users:
                notify(
                    resource=resource,
                    config={
                        "conversationId": str(conversation_db.id),
                        "messageId": str(message_db.id),
                        "userId": str(current_user_db.id),
                        "emoji": reaction,
                    },
                    kind="reaction",
                    content="A reaction to your message",
                    read=False,
                    title="",
                    user=message_author,  # <= notify the author of the message
                    for_key=f"user:{message_author.id}_conversation_{conversation_db.id}",
                )
                notified_users.add(message_author.id)

        # return the updated message
        return EndpointOutput(result={"message": message_db})

    return crud_message_router
