import typing
import uuid

from pydantic import BaseModel, ConfigDict

from libs.acl.methods import (
    Operation,
    can,
    cannot,
)
from libs.acl.models import Who
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.folders.methods import (
    add_to_folder,
    get_folder_children,
    get_subfolders,
    get_subfolders_and_resources,
    remove_from_folder,
)
from libs.logger import print
from libs.resource import Resource, ResourceManager
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput, to_camel

from .models import Folder

T = typing.TypeVar("T", bound=Resource, covariant=True)


def create_crud_folder_router(prefix: str = "/api/folders"):
    crud_folder_router = create_crud_endpoints(
        Folder,
        prefix=prefix,
        tags=["folders"],
        include_create=True,
        # include_all_by_app=True,
        include_update=True,
        include_delete=True,
    )

    # # read recursive in query
    # @crud_folder_router.get("/for/{for_resource_kind}/{for_resource_id}")
    # async def read_folder_for_resource(
    #     classic_deps: ClassicDeps__dep,
    #     for_resource_id: uuid.UUID,
    #     for_resource_kind: str,
    #     recursive: bool = Query(False, description="Read recursively in subfolders"),
    #     include_resources: bool = Query(
    #         False, description="Include resources", alias="includeResources"
    #     ),
    # ):
    #     (
    #         current_user_db,
    #         current_matching_paths,
    #         current_session_db,
    #         translator,
    #     ) = classic_deps

    #     # # we should raise if cannot read the resource
    #     # # add at the beginning import libs.acl.methods as acl_methods
    #     # if acl_methods.cannot(
    #     #     who_id=current_user_db.id if current_user_db else None,
    #     #     resource_type=for_resource_kind,
    #     #     resource_id=for_resource_id,
    #     #     what=acl_methods.Operation.READ,
    #     #     who=acl_methods.Who.user,
    #     # ):
    #     #     return EndpointOutput(
    #     #         error=EndpointError(
    #     #             title=translator.translate("Access denied"),
    #     #             description=translator.translate("You cannot read the resource"),
    #     #             code="access_denied",
    #     #             details={
    #     #                 "for_resource_id": for_resource_id,
    #     #                 "for_resource_kind": for_resource_kind,
    #     #             },
    #     #         )
    #     #     )

    #     folder_db = Folder.get_first_by(
    #         for_id=for_resource_id, for_kind=for_resource_kind
    #     )

    #     if folder_db is None:
    #         return EndpointOutput(
    #             error=EndpointError(
    #                 title=translator.translate("Folder not found"),
    #                 description=translator.translate(
    #                     "No folder found for the resource"
    #                 ),
    #                 code="folder_not_found",
    #                 details={
    #                     "for_resource_id": for_resource_id,
    #                     "for_resource_kind": for_resource_kind,
    #                 },
    #             )
    #         )

    #     subfolders = []
    #     if recursive and include_resources:
    #         subfolders = get_subfolders_and_resources(folder_id=folder_db.id)
    #     elif recursive:
    #         subfolders = get_subfolders(folder_id=folder_db.id)

    #     return EndpointOutput(
    #         result={"rootFolder": folder_db, "subfolders": subfolders}
    #     )

    # Get subfolders of a specific folder by id
    @crud_folder_router.get("/{folder_id}/subfolders")
    async def get_folder_subfolders(
        folder_id: uuid.UUID, classic_deps: ClassicDeps__dep
    ):
        (
            current_user_db,
            current_session_db,
            translator,
        ) = classic_deps

        if cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=Folder,
            resource_id=folder_id,
            what=Operation.READ,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot read this folder"),
                    code="access_denied",
                    details={
                        "folder_id": folder_id,
                    },
                )
            )

        with context_db() as db:
            subfolders = get_subfolders(folder_id=folder_id, _db=db)
            subfolders_and_resources = get_subfolders_and_resources(
                folder_id=folder_id, _db=db
            )

        return EndpointOutput(
            result={
                "folderId": folder_id,
                "subfolders": subfolders,
                "subfoldersAndResources": subfolders_and_resources,
            }
        )

    class Truc(BaseModel):
        folder_id: uuid.UUID
        filtered_resources: dict[
            str, list[dict]
        ]  # Assuming resources are dicts with string keys and values
        model_config = ConfigDict(
            strict=False,
            # extra="forbid",
            from_attributes=True,
            alias_generator=to_camel,
            populate_by_name=True,
            populate_by_alias=True,
            arbitrary_types_allowed=True,
            validate_assignment=True,
            # json_encoders={
            #     uuid.UUID: lambda v: str(v),
            #     # datetime.datetime: lambda v: v.isoformat(),
            #     # datetime.date: lambda v: v.isoformat(),
            #     # datetime.time: lambda v: v.isoformat(),
            # },
        )

    # Get public resources of a specific folder by id
    @crud_folder_router.get(
        "/{folder_id}/public_resources",
        response_model=EndpointOutput[Truc],
        # response_model_by_alias=True,
    )
    async def get_folder_public_resources(folder_id: uuid.UUID):
        resources = get_folder_children(folder_id=folder_id)
        print("Public resources", resources, folder_id)

        filtered_resources = {}
        for resource in resources:
            if can(
                who_id=None,
                resource_type=resource.resource_kind,
                resource_id=resource.resource_id,
                what=Operation.READ,
                who=Who.anonymous,
            ):
                try:
                    resource_type = ResourceManager.get_resource_by_kind(
                        resource.resource_kind
                    )
                    r_db = resource_type.get_first_by(id=resource.resource_id)
                    if not r_db:
                        print(
                            f"Resource {resource.resource_id} of kind {resource.resource_kind} not found"
                        )
                        continue
                    # r_db.model_post_init(None)
                    # # Ensure the resource is serialized correctly
                    # r = TypeAdapter(resource_type).validate_python(r_db)
                    filtered_resources.setdefault(resource.resource_kind, []).append(
                        r_db.model_dump(by_alias=True, exclude_none=True)
                    )
                except KeyError:
                    print(f"Resource kind {resource.resource_kind} not found in models")
                    continue

        # todo : replace with resource ?

        return EndpointOutput(
            result=Truc(
                folder_id=folder_id,
                filtered_resources=filtered_resources,
            )
        )

    # Add a resource to a folder
    @crud_folder_router.get("/{folder_id}/add/{resource_kind}/{resource_id}")
    async def add_ressource_to_folder(
        folder_id: uuid.UUID,
        resource_kind: str,
        resource_id: uuid.UUID,
        classic_deps: ClassicDeps__dep,
    ):
        (
            current_user_db,
            current_session_db,
            translator,
        ) = classic_deps

        if cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=Folder,
            resource_id=folder_id,
            what=Operation.WRITE,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate(
                        "You cannot write over this folder"
                    ),
                    code="access_denied",
                    details={
                        "folder_id": folder_id,
                    },
                )
            )

        resource_type = ResourceManager.get_resource_by_kind(resource_kind)
        if cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=resource_type,
            resource_id=resource_id,
            what=Operation.WRITE,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate(
                        f"You cannot write over this {resource_kind}"
                    ),
                    code="access_denied",
                    details={
                        "resource_id": resource_id,
                    },
                )
            )
        resource_db = resource_type.get_first_by(id=resource_id)
        add_to_folder(folder_id=folder_id, resource=resource_db)

        return EndpointOutput(
            result={
                # "subfolders": subfolders,
                # "subfolders_and_resources": subfolders_and_resources,
            }
        )

    # Remove a resource from a folder
    @crud_folder_router.get("/{folder_id}/remove/{resource_kind}/{resource_id}")
    async def remove_ressource_from_folder(
        folder_id: uuid.UUID,
        resource_kind: str,
        resource_id: uuid.UUID,
        classic_deps: ClassicDeps__dep,
    ):
        (
            current_user_db,
            current_session_db,
            translator,
        ) = classic_deps

        if cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=Folder,
            resource_id=folder_id,
            what=Operation.WRITE,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate(
                        "You cannot write over this folder"
                    ),
                    code="access_denied",
                    details={
                        "folder_id": folder_id,
                    },
                )
            )

        resource_type = ResourceManager.get_resource_by_kind(resource_kind)
        if cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=resource_type,
            resource_id=resource_id,
            what=Operation.WRITE,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate(
                        f"You cannot write over this {resource_type}"
                    ),
                    code="access_denied",
                    details={
                        "resource_id": resource_id,
                    },
                )
            )
        resource_db = resource_type.get_first_by(id=resource_id)
        remove_from_folder(folder_id=folder_id, resource=resource_db)

        return EndpointOutput(
            result={
                # "subfolders": subfolders,
                # "subfolders_and_resources": subfolders_and_resources,
            }
        )

    return crud_folder_router
