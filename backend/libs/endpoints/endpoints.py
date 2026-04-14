import typing
import uuid
from datetime import datetime
from enum import Enum
from urllib.parse import unquote

import fastapi
from fastapi import APIRouter, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Query as QuerySQLAlchemy
from sqlalchemy.orm import Session
from sqlalchemy.sql.expression import and_, or_

from libs.acl.methods import create_default_acls
from libs.acl.models import Acl, Operation, Who
from libs.db import context_db
from libs.folders.models import FolderToResource
from libs.logger import print, print_color
from libs.resource import Resource, ResourceManager, getattr_by_alias_or_name
from libs.resource.resource_errors import ResourceWithKindUndefinedError
from libs.sessions.models import AppSession
from libs.users.models import User
from libs.utils.deps import ClassicDeps__dep
from libs.utils.methods import deep_update_pydantic_object
from libs.utils.types import (
    EndpointError,
    EndpointOutput,
    to_snake,
)

from .types import PaginatedResponse, SimpleResponse, get_paginated_results


def check_concurrency_conflict(
    client_time_updated: str | datetime | None, resource_time_updated: datetime | None
) -> bool:
    """
    Check if there's a concurrency conflict between client and resource timestamps.

    Args:
        client_time_updated: The timestamp from the client
        resource_time_updated: The timestamp from the database resource

    Returns:
        True if there's a conflict (client is outdated), False otherwise
    """
    if client_time_updated is None or resource_time_updated is None:
        print_color("red", "check_concurrency_conflict: One of the timestamps is None")
        return False

    # Convert client timestamp to datetime if it's a string
    if isinstance(client_time_updated, str):
        try:
            # Try ISO format first (most common from JavaScript)
            client_dt = datetime.fromisoformat(
                client_time_updated.replace("Z", "+00:00")
            )
        except ValueError:
            try:
                # Fallback to basic strptime
                client_dt = datetime.strptime(
                    client_time_updated, "%Y-%m-%dT%H:%M:%S.%fZ"
                )
            except ValueError:
                return False  # If we can't parse the timestamp, assume no conflict
    elif isinstance(client_time_updated, datetime):
        client_dt = client_time_updated
    else:
        print_color(
            "red",
            "check_concurrency_conflict: client_time_updated is not a valid datetime or string",
        )
        return False
    # Compare with database timestamp
    is_inferior = client_dt < resource_time_updated
    return is_inferior  # Return True if client is outdated (conflict), False otherwise


class ItemFilter(BaseModel):
    field_name: str
    value: str | None | bool
    match_type: str = "exact"  # Default to exact match
    comparison: typing.Optional[str] = None  # For numerical and datetime comparisons


def decode_filters(
    filters: typing.Optional[list[str]],
) -> list[ItemFilter]:
    if filters is None:
        return []
    decoded_filters = []
    for filter_str in filters:
        parts = filter_str.split(":", 3)
        if len(parts) == 2:
            field, value = parts
            match_type = "exact"
            comparison = None
        elif len(parts) == 3:
            field, value, match_type = parts
            comparison = None
        elif len(parts) == 4:
            field, value, match_type, comparison = parts
        else:
            raise ValueError("Invalid filter format")

        if match_type == "p":
            match_type = "partial"
        elif match_type == "e":
            match_type = "exact"
        if match_type not in ["partial", "exact"]:
            raise ValueError("Invalid match type")

        if comparison and comparison not in ["<", ">", "<=", ">=", "<>"]:
            raise ValueError("Invalid comparison type")

        if value == "~null":
            value = None
        elif value == "~empty":
            value = ""
        elif value == "~true":
            value = True
        elif value == "~false":
            value = False
        else:
            # Decode the value if it's a string
            value = unquote(value)

        decoded_filters.append(
            ItemFilter(
                field_name=to_snake(unquote(field)),
                value=value,
                match_type=unquote(match_type),
                comparison=comparison,
            )
        )
    return decoded_filters


def add_acl_filters(
    current_user_db: User | None,
    session: AppSession | None,
    query: QuerySQLAlchemy,
    ignore_anonymous: bool = False,
    ignore_session: bool = True,
    include_admin: bool = True,
):
    """
    Add ACL filters to the query based on the current user and session.
    This function modifies the query to include only the resources that the user or session has access to.
    Optionally, it can ignore resources accessible to anonymous users.
    """

    # Build a list of conditions that grant access
    or_access_conditions = []

    # Anonymous access (if not ignored)
    if not ignore_anonymous:
        or_access_conditions.append(Acl.who == Who.anonymous.value)

    # Connected user access (any authenticated user)
    if current_user_db is not None:
        or_access_conditions.append(Acl.who == Who.connected.value)

        # Specific user access
        or_access_conditions.append(
            and_(
                Acl.who == Who.user.value,
                Acl.who_id == current_user_db.id,
            )
        )
        USING_TEAMS = ResourceManager.is_resource_registered("team")
        if USING_TEAMS:
            # Team access - check if user is member of any team that has access
            # This creates a subquery to find all team IDs the user belongs to
            from libs.teams.models import Membership

            user_teams_subquery = query.session.query(Membership.team_id).filter(
                Membership.user_id == current_user_db.id
            )

            or_access_conditions.append(
                and_(Acl.who == Who.team.value, Acl.who_id.in_(user_teams_subquery))
            )

        # Admin access (if user is admin and admin access via ACL is included)
        if include_admin and current_user_db.is_admin():
            or_access_conditions.append(Acl.who == Who.admin.value)

    # Session access (if session exists and not ignored)
    if session is not None and not ignore_session:
        or_access_conditions.append(
            and_(
                Acl.who == Who.session.value,
                Acl.who_id == session.id,
            )
        )

    # Apply the combined filter (only if we have any conditions)
    if or_access_conditions:
        query = query.filter(or_(*or_access_conditions))

    # print_color("yellow", "🛑 ACL filters applied:", query.statement.compile())

    return query


def get_resource_if_READ_allowed(
    current_user_db: User | None,
    session_db: AppSession | None,
    resource_kind: str,
    resource_id: str | uuid.UUID,
):
    """
    Get a resource if the current user has READ access to it (directly or through a team).
    """
    resource_type = ResourceManager.get_resource_by_kind(resource_kind)

    # check uuid compatibility
    if isinstance(resource_id, str):
        try:
            uuid.UUID(resource_id)
        except ValueError:
            return None

    with context_db() as db:
        query = (
            db.query(resource_type)
            .filter(resource_type.id == resource_id)
            .join(Acl, Acl.resource_id == resource_id)
            .filter(Acl.operation == Operation.READ.value)
            .filter(Acl.resource_kind == resource_kind)
        )

        # explicitly keep anonymous access
        query = add_acl_filters(
            current_user_db, session_db, query, ignore_anonymous=False
        )

        # group by resource_id to avoid duplicates
        query = query.group_by(resource_type.id)

    return query.first()


def get_resource_if_WRITE_allowed(
    current_user_db: User | None,
    session_db: AppSession | None,
    resource_kind: str,
    resource_id: str | uuid.UUID,
):
    """
    Get a resource if the current user has WRITE access to it (directly or through a team).
    """
    resource_type = ResourceManager.get_resource_by_kind(resource_kind)

    # check uuid compatibility
    if isinstance(resource_id, str):
        try:
            uuid.UUID(resource_id)
        except ValueError:
            return None

    with context_db() as db:
        query = (
            db.query(resource_type)
            .filter(resource_type.id == resource_id)
            .join(Acl, Acl.resource_id == resource_id)
            .filter(Acl.operation == Operation.WRITE.value)
            .filter(Acl.resource_kind == resource_kind)
        )

        query = add_acl_filters(
            current_user_db, session_db, query, ignore_anonymous=True
        )

        # group by resource_id to avoid duplicates
        query = query.group_by(resource_type.id)

    return query.first()


def read_all_resources(
    ResourceClass: type[Resource],
    user: User | None,
    session: AppSession | None = None,
    _db: Session | None = None,
):
    """
    List all resources without pagination.
    """

    # we list all ACLs that allow READ on the resource

    with context_db(_db) as db:
        query = db.query(ResourceClass)

        query = (
            query.join(Acl, Acl.resource_id == ResourceClass.id)
            .filter(Acl.operation == Operation.READ.value)
            .filter(Acl.resource_kind == ResourceClass.__kind__)
        )

        query = add_acl_filters(user, session, query)

        # group by resource_id to avoid duplicates
        query = query.group_by(ResourceClass.id).order_by(
            ResourceClass.time_created.asc()
        )
        result = query.all()

    return EndpointOutput(
        result=result,
    )


T = typing.TypeVar("T", bound=Resource, covariant=True)


class InputModelType(typing.Protocol[T]):
    def model_dump(self, exclude_unset: bool = False) -> dict: ...


def create_crud_endpoints(
    ResourceClass: type[T],
    prefix: str,
    tags: typing.Optional[list[typing.Union[str, Enum]]] = None,
    *,
    include_read: bool = True,
    include_all_by_app: bool = False,
    include_create: bool = False,
    include_update: bool = False,
    include_patch: bool = False,
    include_delete: bool = False,
    include_simplified: bool = False,
    include_bypass: bool = False,
    possible_proxies: typing.Optional[dict] = None,
):
    if tags is None:
        tags = []
    if possible_proxies is None:
        possible_proxies = {}

    if typing.TYPE_CHECKING:
        ResponseModelType = type[Resource]
        ResourceClass = Resource
    else:
        ResponseModelType = ResourceClass

    router = APIRouter(
        prefix=prefix,
        tags=tags,
    )

    if include_all_by_app:
        print_color("red", "include_all_by_app is true for", ResourceClass.__name__)

        @router.get(
            "/all",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[list[ResponseModelType]],
            operation_id=f"list_all_{ResourceClass.__kind__}",
            summary=f"List all accessible from {ResourceClass.__tablename__}",
            name=f"list_all_{ResourceClass.__kind__}",
        )
        def read_all_resources_endpoint(classic_deps: ClassicDeps__dep):
            """
            List all resources without pagination.
            """
            current_user_db, session, translator = classic_deps

            return read_all_resources(
                ResourceClass=ResourceClass,
                user=current_user_db,
            )

    if include_read:

        @router.get(
            "",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[PaginatedResponse[ResponseModelType]],
            operation_id=f"list_{ResourceClass.__kind__}_paginated",
            summary=(
                f"List all accessible from {ResourceClass.__tablename__}, paginated"
            ),
            response_model_by_alias=True,
        )
        def read_resources(
            request: Request,
            classic_deps: ClassicDeps__dep,
            page: int = Query(1, gt=0),
            page_size: int = Query(100, gt=0, le=1000),
            filters: typing.Optional[list[str]] = Query(None),
            ordering_by: typing.Optional[str] = Query(None),
            ignore_anonymous: bool = Query(False),
            bypass_acls: bool = Query(False),
            proxy: typing.Optional[str] = Query(None),
            proxy_value: typing.Optional[str] = Query(None),
        ):
            """
            List all resources with pagination.
            """
            current_user_db, session, translator = classic_deps

            filter_objs = decode_filters(filters)

            with context_db() as db:
                query = db.query(ResourceClass)

                if bypass_acls and include_bypass:
                    if not current_user_db or not current_user_db.is_admin():
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "You must be logged in as a verified admin to list resources."
                                ),
                                code="Unauthorized",
                            )
                        )
                elif proxy:
                    if proxy not in possible_proxies:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "Invalid proxy parameter."
                                ),
                                code="Unauthorized",
                            )
                        )
                    if not proxy_value:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Bad Request"),
                                description=translator.translate(
                                    "Missing proxy_value parameter."
                                ),
                                code="BadRequest",
                            )
                        )
                    try:
                        proxy_value_uuid = uuid.UUID(proxy_value)
                    except ValueError:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Bad Request"),
                                description=translator.translate(
                                    "Invalid proxy_value parameter."
                                ),
                                code="BadRequest",
                            )
                        )

                    # instead of filtering on ACLs directly on the resource, we filter on the proxy resource that has a relation with the resource and filter on the proxy value
                    proxy_details = possible_proxies.get(proxy)
                    if proxy_details is None:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "Invalid proxy details configuration."
                                ),
                                code="Unauthorized",
                            )
                        )
                    if not isinstance(proxy_details, dict):
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "Invalid proxy details configuration: expected a dictionary."
                                ),
                                code="Unauthorized",
                            )
                        )
                    proxy_field_name = proxy_details.get("field_name")
                    if proxy_field_name is None:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "Invalid proxy details configuration: missing field name."
                                ),
                                code="Unauthorized",
                            )
                        )
                    if not hasattr(ResourceClass, proxy_field_name):
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "Invalid proxy details configuration: unknown field name."
                                ),
                                code="Unauthorized",
                            )
                        )
                    proxy_resource_kind = proxy_details.get("resource_kind")
                    if proxy_resource_kind is None:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "Invalid proxy details configuration: missing resource kind."
                                ),
                                code="Unauthorized",
                            )
                        )
                    try:
                        proxy_resource = ResourceManager.get_resource_by_kind(
                            proxy_resource_kind
                        )
                    except ResourceWithKindUndefinedError:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate("Unauthorized"),
                                description=translator.translate(
                                    "Invalid proxy details configuration: unknown resource kind."
                                ),
                                code="Unauthorized",
                            )
                        )

                    # we join on the proxy resource and filter on the proxy value
                    query = (
                        query.join(
                            proxy_resource,
                            getattr(ResourceClass, proxy_field_name)
                            == proxy_resource.id,
                        )
                        .filter(proxy_resource.id == proxy_value_uuid)
                        .join(
                            Acl,
                            and_(
                                Acl.resource_id == proxy_resource.id,
                                Acl.resource_kind == proxy_resource_kind,
                                Acl.operation == Operation.READ.value,
                            ),
                        )
                    )

                    query = add_acl_filters(
                        current_user_db,
                        session,
                        query,
                        ignore_anonymous=ignore_anonymous,
                    )

                else:
                    # we list all ACLs that allow READ on the resource
                    query = (
                        query.join(Acl, Acl.resource_id == ResourceClass.id)
                        .filter(Acl.operation == Operation.READ.value)
                        .filter(Acl.resource_kind == ResourceClass.__kind__)
                    )

                    query = add_acl_filters(
                        current_user_db,
                        session,
                        query,
                        ignore_anonymous=ignore_anonymous,
                    )

                for filter in filter_objs:
                    if not hasattr(ResourceClass, filter.field_name):
                        raise fastapi.HTTPException(
                            status_code=400,
                            detail=f"Invalid filter field: {filter.field_name}",
                        )

                    field = getattr(ResourceClass, filter.field_name)
                    if filter.comparison:
                        if filter.comparison == "<":
                            query = query.filter(field < filter.value)
                        elif filter.comparison == ">":
                            query = query.filter(field > filter.value)
                        elif filter.comparison == "<=":
                            query = query.filter(field <= filter.value)
                        elif filter.comparison == ">=":
                            query = query.filter(field >= filter.value)
                        elif filter.comparison == "<>":
                            # Special handling for booleans: IS NOT TRUE/FALSE matches NULL too
                            if filter.value is None:
                                query = query.filter(field.isnot(None))
                            elif isinstance(filter.value, bool):
                                query = query.filter(field.isnot(filter.value))
                            else:
                                query = query.filter(field != filter.value)
                    else:
                        if filter.match_type == "exact":
                            query = query.filter(field == filter.value)
                        elif filter.match_type == "partial":
                            query = query.filter(field.ilike(f"%{filter.value}%"))
                        else:
                            raise fastapi.HTTPException(
                                status_code=400,
                                detail=f"Invalid match type: {filter.match_type}",
                            )

                # group by resource_id to avoid duplicates
                query = query.group_by(ResourceClass.id)

                # order as request (default to time created)
                if ordering_by:
                    ordering_field_name, direction = ordering_by.split(":", 2)
                    if ordering_field_name:
                        ordering_field = getattr_by_alias_or_name(
                            ResourceClass, ordering_field_name
                        )

                        if isinstance(ordering_field.type, str):
                            # if the field is a string, we lowercase it
                            ordering_field = func.lower(ordering_field)

                        if direction == "desc":
                            query = query.order_by(ordering_field.desc())
                        else:
                            query = query.order_by(ordering_field.asc())
                else:
                    query = query.order_by(ResourceClass.time_created.asc())

                # print the query
                # print_color("yellow", query)

                root_url = f"{request.base_url.scheme}://{request.base_url.netloc}{router.url_path_for('read_resources')}"
                result = get_paginated_results(
                    query,
                    page,
                    page_size,
                    root_url=root_url,
                    self=f"{root_url}?page={page}&page_size={page_size}",
                )

            return EndpointOutput(
                result=result,  # already serialized in get_paginated_results
            )

        @router.get(
            "/find-page/{resource_id}",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[SimpleResponse[dict]],
            operation_id=f"find_page_{ResourceClass.__kind__}",
            summary=f"Find the page containing a specific resource in {ResourceClass.__tablename__}",
        )
        def find_page(
            resource_id: str,
            request: Request,
            classic_deps: ClassicDeps__dep,
            page_size: int = Query(100, gt=0, le=1000),
            filters: typing.Optional[list[str]] = Query(None),
            ordering_by: typing.Optional[str] = Query(None),
        ):
            """
            Find the page containing a specific resource based on filters and ordering.
            """

            # raise error as it is not yet ready
            raise fastapi.HTTPException(
                status_code=501,
                detail="Not implemented yet",
            )

            current_user_db, session, translator = classic_deps

            filter_objs = decode_filters(filters)

            with context_db() as db:
                query = db.query(ResourceClass)

                # Apply ACL filters
                query = (
                    query.join(Acl, Acl.resource_id == ResourceClass.id)
                    .filter(Acl.operation == Operation.READ.value)
                    .filter(Acl.resource_kind == ResourceClass.__kind__)
                )

                query = add_acl_filters(current_user_db, session, query)

                # Apply additional filters
                for filter in filter_objs:
                    if not hasattr(ResourceClass, filter.field_name):
                        raise fastapi.HTTPException(
                            status_code=400,
                            detail=f"Invalid filter field: {filter.field_name}",
                        )

                    field = getattr(ResourceClass, filter.field_name)
                    if filter.comparison:
                        if filter.comparison == "<":
                            query = query.filter(field < filter.value)
                        elif filter.comparison == ">":
                            query = query.filter(field > filter.value)
                        elif filter.comparison == "<=":
                            query = query.filter(field <= filter.value)
                        elif filter.comparison == ">=":
                            query = query.filter(field >= filter.value)
                    else:
                        if filter.match_type == "exact":
                            query = query.filter(field == filter.value)
                        elif filter.match_type == "partial":
                            query = query.filter(field.ilike(f"%{filter.value}%"))
                        else:
                            raise fastapi.HTTPException(
                                status_code=400,
                                detail=f"Invalid match type: {filter.match_type}",
                            )

                # Apply ordering
                if ordering_by:
                    ordering_field_name, direction = ordering_by.split(":", 2)
                    if ordering_field_name:
                        ordering_field = getattr(ResourceClass, ordering_field_name)

                        if isinstance(ordering_field.type, str):
                            ordering_field = func.lower(ordering_field)

                        if direction == "desc":
                            query = query.order_by(ordering_field.desc())
                        else:
                            query = query.order_by(ordering_field.asc())
                else:
                    query = query.order_by(ResourceClass.time_created.asc())

                # Get the position of the resource
                subquery = query.with_entities(ResourceClass.id).subquery()
                position_query = db.query(
                    func.row_number().over(order_by=None).label("position"),
                    subquery.c.id,
                ).subquery()
                position_result = (
                    db.query(position_query.c.position)
                    .filter(position_query.c.id == resource_id)
                    .first()
                )

                if not position_result:
                    raise fastapi.HTTPException(
                        status_code=404,
                        detail="Resource not found in the filtered dataset.",
                    )

                position = position_result[0]
                page = (position - 1) // page_size + 1

                return EndpointOutput(
                    result=SimpleResponse(
                        data={"resource_id": resource_id, "page": page},
                        self=f"/find_page/{resource_id}",
                        all=f"{request.base_url.scheme}://{request.base_url.netloc}{router.url_path_for('read_resources')}?page={page}&page_size={page_size}",
                    )
                )

    if include_create:
        print_color("yellow", "include_create is true for", ResourceClass.__name__)

        @router.post(
            "",
            status_code=status.HTTP_201_CREATED,
            response_model=EndpointOutput[SimpleResponse[ResponseModelType]],
            operation_id=f"create_{ResourceClass.__kind__}",
            summary=f"Add a new row in {ResourceClass.__tablename__}",
        )
        def create_resource(
            resource_in: ResourceClass,
            classic_deps: ClassicDeps__dep,
        ):
            """
            Create a resource.
            """

            current_user_db, session, translator = classic_deps

            if current_user_db is None and session is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Unauthorized"),
                        description=translator.translate(
                            "You must be logged in to create a resource."
                        ),
                        code="Unauthorized",
                    )
                )

            resource_db = ResourceClass.create(
                obj=resource_in,
                # obj_dict=resource_in.model_dump(exclude_unset=True),
            )

            print("Resource created:", resource_db)
            print("Creating default ACLs...")
            if current_user_db:
                create_default_acls(
                    resource=resource_db,
                    who=Who.user,
                    who_id=current_user_db.id,
                )
            if session and ResourceClass.__ACL_SESSION__:
                create_default_acls(
                    resource=resource_db,
                    who=Who.session,
                    who_id=session.id,
                )
            print("Default ACLs created.")

            return EndpointOutput(
                result=SimpleResponse(
                    data=resource_db,
                    self=f"/{resource_db.id}",
                    all=router.prefix + "/?page=1",
                )
            )

    if include_read:

        @router.get(
            "/{resource_id}",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[SimpleResponse[ResponseModelType]],
            operation_id=f"get_{ResourceClass.__kind__}",
            summary=f"Get a row from {ResourceClass.__tablename__}",
        )
        def read_resource(
            resource_id: str,
            classic_deps: ClassicDeps__dep,
        ):
            """
            Retrieve a resource by ID.
            """

            current_user_db, session, translator = classic_deps

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

            with context_db() as db:
                query = (
                    db.query(ResourceClass)
                    .filter(ResourceClass.id == resource_id)
                    .join(Acl, Acl.resource_id == ResourceClass.id)
                    .filter(Acl.operation == Operation.READ.value)
                    .filter(Acl.resource_kind == ResourceClass.__kind__)
                )

                query = add_acl_filters(current_user_db, session, query)

                # group by resource_id to avoid duplicates
                query = query.group_by(ResourceClass.id)

                result = query.first()
            if result is None:
                return EndpointOutput(
                    error=EndpointError(
                        title="Item not found",
                        description="The item you are looking for does not exist or you do not have the right to read it.",
                        code="ItemNotFound",
                    )
                )

            return EndpointOutput(
                result=SimpleResponse(
                    data=result,
                    self=f"/{resource_id}",
                    all=router.prefix + "/?page=1",
                )
            )

        @router.get(
            "/by/{resource_key}/{resource_value}",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[SimpleResponse[ResponseModelType]],
            operation_id=f"get_{ResourceClass.__kind__}_by",
            summary=f"Get a row from {ResourceClass.__tablename__}",
        )
        def read_resource_by(
            resource_key: str,
            resource_value: str,
            classic_deps: ClassicDeps__dep,
        ):
            """
            Retrieve a resource by ID.
            """

            current_user_db, session, translator = classic_deps

            with context_db() as db:
                query = (
                    db.query(ResourceClass)
                    .filter(getattr(ResourceClass, resource_key) == resource_value)
                    .join(Acl, Acl.resource_id == ResourceClass.id)
                    .filter(Acl.operation == Operation.READ.value)
                    .filter(Acl.resource_kind == ResourceClass.__kind__)
                )

                query = add_acl_filters(current_user_db, session, query)

                # group by resource_id to avoid duplicates
                query = query.group_by(ResourceClass.id)

                print("Query:", query)

                result = query.first()
            if result is None:
                return EndpointOutput(
                    error=EndpointError(
                        title="Item not found",
                        description="The item you are looking for does not exist or you do not have the right to read it.",
                        code="ItemNotFound",
                    )
                )

            resource_id = getattr(result, "id", None)
            return EndpointOutput(
                result=SimpleResponse(
                    data=result,
                    self=f"/{resource_id}",
                    all=router.prefix + "/?page=1",
                )
            )

    if include_simplified:

        @router.get(
            "/{resource_id}/simplified",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[SimpleResponse[ResponseModelType]],
            operation_id=f"get_simplified_{ResourceClass.__kind__}",
            summary=f"Get a  simplified row from {ResourceClass.__tablename__}",
        )
        def read_simplified_resource(
            resource_id: str,
            classic_deps: ClassicDeps__dep,
        ):
            """
            Retrieve a resource by ID.
            """

            current_user_db, session, translator = classic_deps

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

            with context_db() as db:
                query = db.query(ResourceClass).filter(ResourceClass.id == resource_id)

                result = query.first()
            if result is None:
                return EndpointOutput(
                    error=EndpointError(
                        title="Item not found",
                        description="The item you are looking for does not exist.",
                        code="ItemNotFound",
                    )
                )

            return EndpointOutput(
                result=SimpleResponse(
                    data=result,
                    self=f"/{resource_id}",
                    all=router.prefix + "/?page=1",
                )
            )

    if include_update:
        print_color("yellow", "include_update is true for", ResourceClass.__name__)

        @router.put(
            "/{resource_id}",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[SimpleResponse[ResponseModelType]],
            operation_id=f"update_{ResourceClass.__kind__}",
            summary=f"Update a row in {ResourceClass.__tablename__}",
        )
        def update_resource(
            resource_id: str,
            resource_in: ResourceClass,
            classic_deps: ClassicDeps__dep,
        ):
            """
            Update a resource by ID.
            """
            current_user_db, session, _ = classic_deps

            # Extract time_updated from the resource data for concurrency control
            time_updated = None
            if hasattr(resource_in, "time_updated"):
                time_updated = resource_in.time_updated

            print_color(
                "yellow",
                "Updating resource:",
                resource_id,
                "with data. (",
                resource_in.time_updated,
                ")",
            )

            resource_through_acl_db: typing.Optional[Resource] = None
            with context_db() as db:
                query = (
                    db.query(ResourceClass)
                    .filter(ResourceClass.id == resource_id)
                    .join(Acl, Acl.resource_id == ResourceClass.id)
                    .filter(Acl.operation == Operation.WRITE.value)
                    .filter(Acl.resource_kind == ResourceClass.__kind__)
                )
                query = add_acl_filters(current_user_db, session, query)

                # group by resource_id to avoid duplicates
                query = query.group_by(ResourceClass.id)

                resource_through_acl_db = query.first()

                # independant of ACLs
                resource_already_exists = ResourceClass.in_db(
                    obj_id=resource_id, _db=db
                )

            resource_db: typing.Optional[Resource] = None

            if resource_already_exists:
                if resource_through_acl_db is None:
                    # resource exists but the user has not access
                    return EndpointOutput(
                        error=EndpointError(
                            title="Unauthorized",
                            description=(
                                "You do not have the right to write over this resource."
                            ),
                            code="Unauthorized",
                        )
                    )

                else:
                    # resource exists and user has access
                    print_color(
                        "yellow",
                        "Resource exists and user has access, updating resource:",
                        resource_through_acl_db.id,
                        resource_through_acl_db.time_updated,
                    )

                    # Check for concurrency conflicts
                    if check_concurrency_conflict(
                        time_updated, resource_through_acl_db.time_updated
                    ):
                        print_color(
                            "red",
                            "Concurrency conflict detected for resource",
                            resource_id,
                            "Client time_updated:",
                            time_updated,
                            "Database time_updated:",
                            resource_through_acl_db.time_updated,
                        )
                        return EndpointOutput(
                            result=SimpleResponse(
                                data=resource_through_acl_db,
                                self=f"/{resource_id}",
                                all=router.prefix + "/?page=1",
                            )
                        )

                    # NOTE:
                    #   - update will keep "unset" values to replace them with None
                    #   - if values are required, it will raise an error
                    #   - you should use patch in this case
                    resource_db = ResourceClass.update(
                        obj_id=resource_id, new_obj=resource_in
                    )
            else:
                # resource does not exists
                if current_user_db is not None or session is not None:
                    # if the user is logged in, we can create the missing resource
                    resource_db = ResourceClass.create(
                        obj_dict=resource_in.model_dump(exclude_unset=True)
                    )
                    if current_user_db:
                        create_default_acls(
                            resource=resource_db,
                            who=Who.user,
                            who_id=current_user_db.id,
                            _db=db,
                        )
                    if session and ResourceClass.__ACL_SESSION__:
                        create_default_acls(
                            resource=resource_db,
                            who=Who.session,
                            who_id=session.id,
                            _db=db,
                        )

                else:
                    return EndpointOutput(
                        error=EndpointError(
                            title="Unauthorized",
                            description="You must be logged in to create a resource.",
                            code="Unauthorized",
                        )
                    )

            # print_color("yellow", "You reach the PUT:", resource_db)
            return EndpointOutput(
                result=SimpleResponse(
                    data=resource_db,
                    self=f"/{resource_id}",
                    all=router.prefix + "/?page=1",
                )
            )

    if include_patch:
        print_color("yellow", "include_patch is true for", ResourceClass.__name__)

        @router.patch(
            "/{resource_id}",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[SimpleResponse[ResponseModelType]],
            operation_id=f"patch_{ResourceClass.__kind__}",
            summary=f"Patch a row in {ResourceClass.__tablename__}",
        )
        def patch_resource(
            resource_id: str,
            update_dict_in: dict,
            classic_deps: ClassicDeps__dep,
        ):
            """
            Patch/Update a resource by ID.
            """

            current_user_db, session, _ = classic_deps

            with context_db() as db:
                query = (
                    db.query(ResourceClass)
                    .filter(ResourceClass.id == resource_id)
                    .join(Acl, Acl.resource_id == ResourceClass.id)
                    .filter(Acl.operation == Operation.WRITE.value)
                    .filter(Acl.resource_kind == ResourceClass.__kind__)
                )
                query = add_acl_filters(current_user_db, session, query)

                # group by resource_id to avoid duplicates
                query = query.group_by(ResourceClass.id)

                resource_db: Resource = query.first()

            if resource_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title="Item not found",
                        description="The item you are looking for does not exist or "
                        + "you do not have the right to write over it.",
                        code="ItemNotFound",
                    )
                )
            # Extract time_updated from the resource data for concurrency control
            time_updated = None
            if hasattr(resource_db, "time_updated"):
                time_updated = resource_db.time_updated
            # Check for concurrency conflicts
            if check_concurrency_conflict(time_updated, resource_db.time_updated):
                print_color(
                    "red",
                    "Concurrency conflict detected for resource",
                    resource_id,
                    "Client time_updated:",
                    time_updated,
                    "Database time_updated:",
                    resource_db.time_updated,
                )
                return EndpointOutput(
                    result=SimpleResponse(
                        data=resource_db,
                        self=f"/{resource_id}",
                        all=router.prefix + "/?page=1",
                    )
                )

            # using patch with a dict is tricky as sql will just accept any dict
            # so we must ensure that the dict is valid regarding the pydantic model
            # DON'T DO : resource_db = ResourceClass.patch(
            #     obj_id=resource_id, update_dict=update_dict_in
            # )
            # instead : create a copy of the original object, update it with the update dict and validate it with pydantic,
            # then update the resource in db if validation is ok
            resource_copy = deep_update_pydantic_object(resource_db, update_dict_in)

            # temporary : serialize and deserialize the object to purge from extra fields:
            clean_resource = ResourceClass.model_validate(resource_copy.model_dump())
            clean_resource.save()

            return EndpointOutput(
                result=SimpleResponse(
                    data=clean_resource,
                    self=f"/{resource_id}",
                    all=router.prefix + "/?page=1",
                )
            )

    if include_delete:
        print_color("red", "include_delete is true for", ResourceClass.__name__)

        @router.delete(
            "/{resource_id}",
            status_code=status.HTTP_200_OK,
            response_model=EndpointOutput[SimpleResponse[ResponseModelType]],
            operation_id=f"delete_{ResourceClass.__kind__}",
            summary=f"Delete a row from {ResourceClass.__tablename__}",
        )
        def delete_resource(
            resource_id: str,
            classic_deps: ClassicDeps__dep,
        ):
            """
            Delete a resource by ID.
            """
            current_user_db, session, translator = classic_deps
            # check ACLs
            with context_db() as db:
                query = (
                    db.query(ResourceClass)
                    .filter(ResourceClass.id == resource_id)
                    .join(Acl, Acl.resource_id == ResourceClass.id)
                    .filter(Acl.operation == Operation.DELETE.value)
                    .filter(Acl.resource_kind == ResourceClass.__kind__)
                )
                query = add_acl_filters(current_user_db, session, query)

                # group by resource_id to avoid duplicates
                query = query.group_by(ResourceClass.id)

                resource_db: Resource = query.first()

            if resource_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Item not found"),
                        description=translator.translate(
                            "The item you are looking for does"
                            + " not exist or you do not have the right to delete it."
                        ),
                        details={
                            "resourceId": resource_id,
                            "e": ResourceClass.in_db(obj_id=resource_id),
                        },
                        code="ItemNotFound",
                    )
                )

            with context_db() as db:
                db.expire_on_commit = False
                ResourceClass.delete(obj_id=resource_id)
                # delete all corresponding ACLs
                (
                    db.query(Acl)
                    .filter(Acl.resource_id == resource_id)
                    .filter(Acl.resource_kind == ResourceClass.__kind__)
                ).delete()

                # delete all corresponding FolderToResource entries
                (
                    db.query(FolderToResource)
                    .filter(FolderToResource.resource_id == resource_id)
                    .filter(FolderToResource.resource_kind == ResourceClass.__kind__)
                ).delete()

                db.commit()

                return EndpointOutput(
                    result=SimpleResponse(
                        data=resource_db,
                        self=f"/{resource_id}",
                        all=router.prefix + "/?page=1",
                    )
                )

    return router
