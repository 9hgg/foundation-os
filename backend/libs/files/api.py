import datetime
import os
import time
import uuid
from email.utils import format_datetime

import fastapi
import structlog
from fastapi import (
    BackgroundTasks,
    Body,
    HTTPException,
    Path,
    Query,
    Request,
    status,
)
from fastapi.responses import RedirectResponse, Response

from libs.acl.methods import Operation, cannot, create_default_acls
from libs.acl.models import Who
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.types import SimpleResponse
from libs.files.processors.magic_bytes.types import infer_type_from_extension
from libs.files.storage.methods import (
    describe_alternative,
    get_and_cache_presigned_url,
    get_onetime_presigned_url,
    named_with_extension,
    sanitized_download_name,
)
from libs.folders.methods import add_to_folder
from libs.folders.models import Folder
from libs.tasks.methods import sync_launch_tasks_processing
from libs.tasks.tasks_manager import TasksManager
from libs.users.deps import CurrentUser__dep
from libs.utils.deps import ClassicDeps__dep
from libs.utils.origin import get_origin
from libs.utils.text import slugify
from libs.utils.types import EndpointError, EndpointOutput

from .methods.deps import CurrentStorage__dep
from .models import File
from .storage import LocalStorage, get_file_storage

logger = structlog.get_logger(__name__)

# CACHE_REFRESH_THRESHOLD_SECONDS = (
#     60  # Refresh URL if it will expire in less than 1 minute
# )


# # Create a TTLCache, e.g., up to 1024 entries, each expiring after 120 seconds.
# FILE_PRESIGNED_URLS_CACHE: cachetools.TTLCache = cachetools.TTLCache(
#     maxsize=1024, ttl=10 * CACHE_REFRESH_THRESHOLD_SECONDS
# )


def create_crud_file_router(prefix: str = "/api/files"):  # noqa: C901
    crud_file_router = create_crud_endpoints(
        File,
        prefix=prefix,
        tags=["files"],
        include_create=False,
        include_delete=True,
        include_update=True,
        include_simplified=True,
    )

    @crud_file_router.post(
        "/storage/get-upload-details",
        response_model=EndpointOutput[SimpleResponse[File]],
        response_model_by_alias=True,
    )
    async def get_upload_details(  # noqa: C901
        request: Request,
        classic_deps: ClassicDeps__dep,
        current_storage_: CurrentStorage__dep,
        # current_user_db: CurrentUser__dep,
        # translator: Translator__dep,
        file_name: str = Body(..., alias="fileName"),
        content_type: str | None = Body(None, alias="contentType"),
        file_size: int | None = Body(None, alias="fileSize"),
        hash_client: str | None = Body(None, alias="hashClient"),
        alternative: str = Body("original", alias="alternative"),
        file_id: uuid.UUID | None = Body(None, alias="fileId"),
        folder_id: uuid.UUID | None = Body(None, alias="folderId"),
        folder_path: str | None = Body(None, alias="folderPath"),
        folder_for_id: uuid.UUID | None = Body(None, alias="folderForId"),
        folder_for_kind: str | None = Body(None, alias="folderForKind"),
    ):
        current_user_db, session, translator = classic_deps

        storage_to_use = current_storage_

        # origin is used for presigned resumable PUT url
        origin = get_origin(request=request, default_origin=request.headers.get("origin"))

        # folder management
        parent_id = None
        if folder_id is not None:
            # A caller that already holds the target folder addresses it directly: `folder_path`
            # walks a tree anchored on `folder_for_id`/`folder_for_kind` and creates what is
            # missing, which cannot reach a folder that is not anchored on such a resource.
            logger.debug("file_upload_folder_id_received", folder_id=folder_id)
            folder_db = Folder.by_id(folder_id)
            if folder_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Folder not found"),
                        description=translator.translate("The folder you are trying to upload into does not exist"),
                        code="folder_not_found",
                    )
                )
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
                        description=translator.translate("You cannot write over this folder"),
                        code="access_denied",
                    )
                )
            parent_id = folder_db.id
        elif folder_path is None:
            logger.debug("file_upload_folder_path_missing")
        else:
            logger.debug("file_upload_folder_path_received", folder_path=folder_path)
            # should start with /, contains no / at the end
            if not folder_path.startswith("/"):
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate("The folder path should start with /"),
                        code="invalid_folder_path",
                    )
                )
            if folder_path.endswith("/"):
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate("The folder path should not end with /"),
                        code="invalid_folder_path",
                    )
                )
            if len(folder_path) == 1:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate("The folder path should not be /"),
                        code="invalid_folder_path",
                    )
                )

            if "//" in folder_path:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate("The folder path should not contain //"),
                        code="invalid_folder_path",
                    )
                )

            # now we have something like : /my/folder/path

            folder_names = folder_path.split("/")[1:]

            logger.debug("file_upload_folder_names_resolved", folder_names=folder_names)

            # root folder:
            folder_db = Folder.get_first_by(
                for_id=folder_for_id,
                for_kind=folder_for_kind,
            )

            if folder_db is None:
                logger.debug("file_upload_root_folder_creating", folder_name=folder_names[0])
                folder_db = Folder.create(
                    obj_dict={
                        "for_id": folder_for_id,
                        "for_kind": folder_for_kind,
                        "name": folder_names[0],
                        # "parent_id": parent_id,
                    }
                )
                logger.info("file_upload_root_folder_created", folder_id=folder_db.id)
            else:
                logger.debug("file_upload_root_folder_found", folder_id=folder_db.id)
            parent_id = folder_db.id

            # check if sub folder exists -> create it if not

            for folder_level, folder_name in enumerate(folder_names[1:]):
                logger.debug("file_upload_folder_level_resolving", folder_level=folder_level, parent_id=parent_id)

                if len(folder_name) == 0:
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("Invalid folder path"),
                            description=translator.translate("The folder path should not contain empty folder names"),
                            code="invalid_folder_path",
                        )
                    )

                folder_db = Folder.get_first_by(
                    parent_id=parent_id,
                    name=folder_name,
                )
                logger.debug("file_upload_subfolder_resolving", folder_level=folder_level, folder_name=folder_name)
                if folder_db is None:
                    logger.debug("file_upload_subfolder_creating", folder_level=folder_level, folder_name=folder_name)
                    folder_db = Folder.create(
                        obj_dict={
                            "name": folder_name,
                            "parent_id": parent_id,
                        }
                    )
                    logger.info("file_upload_subfolder_created", folder_id=folder_db.id, folder_level=folder_level)
                else:
                    logger.debug("file_upload_subfolder_found", folder_id=folder_db.id, folder_level=folder_level)
                parent_id = folder_db.id

        # now we have the parent_id of the last folder, hence the target folder

        if file_id is not None:
            if alternative != "original":
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Not allowed"),
                        description=translator.translate(
                            "You can't set a file id to upload " + "another alternative than the original"
                        ),
                    )
                )
            # check if file is not already uploaded
            file_db = File.by_id(file_id)
            if file_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("File not found"),
                        description=translator.translate("The file you are trying to upload does not exist"),
                        code="file_not_found",
                    )
                )
            if file_db.in_storage:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Original file already in storage"),
                        description=translator.translate("The file you are trying to upload is already in storage"),
                    )
                )

            storage_folder_path = str(file_id)
            file_storage = get_file_storage(file_db.storage_id)
            storage_to_use = file_storage or current_storage_
            upload_url = storage_to_use.get_upload_url(
                storage_folder_path=storage_folder_path,
                alternative=alternative,
                content_type=content_type,
                origin=origin,
            )

            # update the file
            file_db = File.patch(
                obj_id=file_id,
                update_dict={
                    "upload_url": upload_url,
                },
            )

        else:
            # create a new file on the fly
            file_id = uuid.uuid4()

            storage_folder_path = str(file_id)
            extension_client = os.path.splitext(file_name)[1]
            upload_url = storage_to_use.get_upload_url(
                storage_folder_path=storage_folder_path,
                alternative=alternative,
                content_type=content_type,
                origin=origin,
            )

            file = File(
                id=file_id,
                original_filename=file_name,
                # fill public_filename with the same
                #  value as original_filename at creation
                public_filename=file_name,
                # description="",
                # extension="",
                # kind="",
                extension_client=extension_client,
                mime_client=content_type,
                size_client=file_size,
                hash_client=hash_client,
                # unprocessable=False,
                # mime="",
                # size=0,
                storage_id=storage_to_use.storage_settings.id,
                storage_folder_path=storage_folder_path,
                in_storage=False,
                upload_url=upload_url,
            )
            logger.debug("file_upload_record_creating", file_id=file_id)
            with context_db() as db:
                db.expire_on_commit = False
                file_db = File.create(obj=file, _db=db)
                logger.info("file_upload_record_created", file_id=file_db.id)

                # add acl if user is logged in
                if current_user_db is not None:
                    create_default_acls(
                        resource=file_db,
                        who=Who.user,
                        who_id=current_user_db.id,
                        _db=db,
                    )
                if session is not None:
                    create_default_acls(
                        resource=file_db,
                        who=Who.session,
                        who_id=session.id,
                        _db=db,
                    )

        # add file to folder
        if parent_id:
            logger.debug("file_upload_adding_to_folder", file_id=file_db.id, folder_id=parent_id)
            add_to_folder(folder_id=parent_id, resource=file_db)

        return EndpointOutput(result=SimpleResponse(data=file_db))

    @crud_file_router.post(
        "/storage/create-empty-file",
        response_model=EndpointOutput[SimpleResponse[File]],
        response_model_by_alias=True,
    )
    async def create_empty_file(
        request: Request,
        classic_deps: ClassicDeps__dep,
        current_storage: CurrentStorage__dep,
    ):
        current_user_db, session, translator = classic_deps
        # create a new file on the fly
        file_id = uuid.uuid4()

        storage_folder_path = str(file_id)
        file = File(
            id=file_id,
            storage_id=current_storage.storage_settings.id,
            storage_folder_path=storage_folder_path,
            in_storage=False,
        )
        logger.debug("empty_file_record_creating", file_id=file_id)
        with context_db() as db:
            db.expire_on_commit = False
            file_db = File.create(obj=file, _db=db)
            logger.info("empty_file_record_created", file_id=file_db.id)

            # add acl if user is logged in
            if current_user_db is not None:
                create_default_acls(
                    resource=file_db,
                    who=Who.user,
                    who_id=current_user_db.id,
                    _db=db,
                )
            if session is not None:
                create_default_acls(
                    resource=file_db,
                    who=Who.session,
                    who_id=session.id,
                    _db=db,
                )

        return EndpointOutput(result=SimpleResponse(data=file_db))

    @crud_file_router.get(
        "/storage/get-chunk-upload-url/{fileId}/{alternative}/{startBytes}/{endBytes}",
        response_model=EndpointOutput,
        response_model_by_alias=True,
    )
    async def get_chunk_upload_url(
        request: Request,
        classic_deps: ClassicDeps__dep,
        current_storage_: CurrentStorage__dep,
        file_id: str = Path(..., alias="fileId"),
        alternative: str = Path(..., alias="alternative"),
        start_bytes: int = Path(..., alias="startBytes"),
        end_bytes: int = Path(..., alias="endBytes"),
    ):
        current_user_db, session, translator = classic_deps

        # TODO: make it safe with sessions, until then : critical backdoor to upload unlimited storage

        # check file exists
        file_db = File.by_id(file_id)
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File not found",
                    description=("The file you are trying to access does not exist"),
                    code="file_not_found",
                )
            )

        if file_db.storage_id is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage",
                    description=("The file you are trying to access has no storage"),
                )
            )
        storage_to_use = get_file_storage(file_db.storage_id)

        if file_db.storage_folder_path is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage folder",
                    description=("The file you are trying to access has no storage folder"),
                    code="file_not_found",
                )
            )
        alternative_chunked = f"chunk-{start_bytes}-{end_bytes}"
        storage_folder_path_chunked = file_db.storage_folder_path + "/" + (alternative or "original") + "_chunked"

        origin = request.headers.get("origin")
        logger.debug("chunk_upload_origin_received", origin=origin)
        try:
            host = request.client.host

            request_origin = request.url.__str__() if request else None
            from_header_origin = request.headers.get("ba-origin", None) if request else None
            from_header_host = request.headers.get("host", None) if request else None
            from_forward_origin = request.headers.get("forward-origin", None) if request else None
            logger.debug(
                "chunk_upload_request_origins_resolved",
                client_host=host,
                request_origin=request_origin,
                ba_origin=from_header_origin,
                header_host=from_header_host,
                forward_origin=from_forward_origin,
            )
            if from_forward_origin:
                # format https://somedomain.tld/some/url
                # extract https://somedomain.tld
                origin = "/".join(from_forward_origin.split("/")[:3])
                logger.debug("chunk_upload_forward_origin_selected", origin=origin)

            # origin = from_header_origin if from_header_origin else request_origin
        except Exception as exc:
            logger.warning(
                "chunk_upload_header_extraction_failed",
                error_type=type(exc).__name__,
                error=str(exc),
            )

        upload_url_chunk = storage_to_use.get_upload_url(
            storage_folder_path=storage_folder_path_chunked,
            alternative=alternative_chunked,
            origin=origin,
        )
        logger.debug("chunk_upload_url_created", file_id=file_id, url_created=bool(upload_url_chunk))
        return EndpointOutput(result={"uploadUrl": upload_url_chunk})

    @crud_file_router.get(
        "/storage/recover-from-chunks/{fileId}/{alternative}",
        # response_model=EndpointOutput,
        # response_model_by_alias=True,
    )
    async def recover_from_chunks(
        background_tasks: BackgroundTasks,
        file_id: str = Path(..., alias="fileId"),
        alternative: str = Path(..., alias="alternative"),
        force: bool = Query(False, alias="force"),
    ):
        # check file exists
        file_db = File.by_id(file_id)
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File not found",
                    description=("The file you are trying to access does not exist"),
                    code="file_not_found",
                )
            )

        if file_db.storage_id is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage",
                    description=("The file you are trying to access has no storage"),
                )
            )
        storage_to_use = get_file_storage(file_db.storage_id)
        storage_folder_path_chunked = file_db.storage_folder_path + "/" + (alternative or "original") + "_chunked"
        chunks = storage_to_use.get_files_in_folder(storage_folder_path=storage_folder_path_chunked)

        if len(chunks) == 0:
            return EndpointOutput(
                error=EndpointError(
                    title="No chunks found",
                    description=("No chunks found for the file"),
                    code="no_chunks_found",
                )
            )

        logger.info("file_recovery_chunks_found", file_id=file_id, chunk_count=len(chunks))
        # chunks are like : [
        #     "chunk-2621440-2883583",
        #     "chunk-1310720-1572863",
        #     "chunk-524288-786431",
        #     "chunk-262144-524287",
        #     "chunk-1048576-1310719",
        #     "chunk-1835008-2097151",
        #     "chunk-786432-1048575",
        #     "chunk-2359296-2621439",
        #     "chunk-2883584-2925308",
        #     "chunk-2097152-2359295",
        #     "chunk-0-262143",
        #     "chunk-1572864-1835007",
        # ]
        # TODO launch a background task to recover the file from chunks

        logger.info("file_recovery_merge_task_launching", file_id=file_id, force=force)
        # create the merge_chunks task
        task_db = TasksManager.create_task(
            title="Merge chunks",
            method_name="merge_chunks",
            args=[file_id, alternative],
            kwargs={
                "force": force,
            },
        )
        # launch tasks in background without awaiting
        background_tasks.add_task(sync_launch_tasks_processing)

        return EndpointOutput(result={"taskId": task_db.id})

    @crud_file_router.post(
        "/storage/update-after-upload",
        response_model=EndpointOutput,
        response_model_by_alias=True,
    )
    async def update_after_upload(
        background_tasks: BackgroundTasks,
        file_id: str = Body(..., alias="fileId"),
        duration: float | None = Body(None),
        force: bool | None = Body(None),
    ):
        logger.debug("update_after_upload_details_received", file_id=file_id, duration=duration, force=force)
        tic = time.time()
        file_db: File | None = File.by_id(file_id)
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File not found",
                    description=("The file you are trying to update does not exist"),
                    code="file_not_found",
                )
            )

        if file_db.storage_id is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage",
                    description=("The file you are trying to update has no storage"),
                )
            )

        # check that the file is in the storage

        logger.debug("update_after_upload_checking_storage", file_id=file_db.id)

        storage = get_file_storage(file_db.storage_id)

        # check that the file is in the storage
        in_storage = False
        size = None
        if file_db.storage_folder_path is not None:
            # original or original-stream or None
            in_storage_alternative = storage.get_original_alternative(storage_folder_path=file_db.storage_folder_path)
            in_storage = in_storage_alternative is not None
            if not in_storage:
                logger.warning("update_after_upload_file_not_in_storage", file_id=file_db.id)
                return EndpointOutput(
                    error=EndpointError(
                        title="File not found in storage",
                        description=("The file you are trying to update is not in storage"),
                        code="file_not_found_in_storage",
                    )
                )
            size = storage.get_size(
                storage_folder_path=file_db.storage_folder_path,
                alternative=in_storage_alternative,
            )
            logger.debug("update_after_upload_file_found_in_storage", file_id=file_db.id, size=size)
        else:
            logger.warning("update_after_upload_file_not_in_storage", file_id=file_db.id)
            return EndpointOutput(
                error=EndpointError(
                    title="File not found in storage",
                    description=("The file you are trying to update is not in storage"),
                    code="file_not_found_in_storage",
                )
            )
        tac = time.time()
        logger.debug("update_after_upload_storage_check_duration", duration_seconds=tac - tic)

        file_type_from_extension = "unknown"
        if file_db.extension_client:
            file_type_from_extension = infer_type_from_extension(file_db.extension_client.replace(".", ""))

        # update the file
        file_db_updated: File = File.patch(
            obj_id=file_id,
            update_dict={
                "in_storage": in_storage,
                "size": size,
                "kind": file_type_from_extension,
                "config": {"client_duration": duration},
            },
        )

        logger.info("update_after_upload_launching_fill_details_task", file_id=file_id, force=force)
        # create the fill_details task
        fill_file_details_task = TasksManager.create_task(
            title="Fill details",
            method_name="fill_file_details",
            description="Fill file details for "
            + (file_db_updated.original_filename if file_db_updated.original_filename else file_db_updated.id.hex[:8]),
            args=[file_id],
            kwargs={
                "force": force,
            },
        )

        background_tasks.add_task(sync_launch_tasks_processing)

        return EndpointOutput(result={"file": file_db_updated, "taskId": fill_file_details_task.id})

    @crud_file_router.put("/storage/upload/{file_id}/{path:path}")
    async def upload_file(
        #
        file_id: str,
        path: str,
        # file: UploadFile = fastapi.File(...),
        request: Request,
    ):
        alternative = path
        extra_folder_path = ""
        if "/" in path:
            alternative = path.split("/")[-1]
            extra_folder_path = "/" + "/".join(path.split("/")[:-1])

        file_db = File.by_id(file_id)
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File not found",
                    description=("The file you are trying to update does not exist"),
                    code="file_not_found",
                )
            )

        if file_db.storage_id is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage",
                    description=("The file you are trying to update has no storage method"),
                    code="file_has_no_storage",
                )
            )

        if file_db.storage_folder_path is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage folder",
                    description=("The storage folder path of the" + "file you are trying to update is empty."),
                    code="file_has_no_storage_folder_path",
                )
            )

        if file_db.in_storage:
            return EndpointOutput(
                error=EndpointError(
                    title="File already in storage",
                    description=("The file you are trying to update is already in storage"),
                    code="file_already_in_storage",
                    details={
                        "file_id": file_id,
                        "alternative": alternative,
                        "already": "by_database",
                    },
                )
            )

        logger.debug(
            "storage_upload_file_started",
            file_id=file_id,
            alternative=alternative,
            extra_folder_path=extra_folder_path,
        )

        # read content-range header: if present it means we are uploading a piece of a file
        content_range = request.headers.get("Content-Range")
        if content_range:
            logger.debug("storage_upload_file_content_range", content_range=content_range)

        content_type = request.headers.get("Content-Type")
        if content_type and file_db.mime_client is None:
            # Set the file's MIME type based on the Content-Type header
            file_db.mime_client = content_type
            logger.debug("storage_upload_file_content_type_set", content_type=content_type)

        # check that the file is not already in the storage
        storage = get_file_storage(file_db.storage_id)
        if (
            storage.exists_in_storage(
                storage_folder_path=file_db.storage_folder_path + extra_folder_path,
                alternative=alternative,
            )
            and not content_range
        ):
            return EndpointOutput(
                error=EndpointError(
                    title="File already in storage",
                    description=("The file you are trying to upload is already in storage"),
                    code="file_already_in_storage",
                    details={
                        "file_id": file_id,
                        "alternative": alternative,
                        "already": "by_storage",
                    },
                )
            )

        # save the file.file in a tmp file,
        # then upload it to the storage,
        # then delete the tmp file
        tmp_path = f"/tmp/{file_id}-{alternative}"  # noqa: S108

        # Read the raw file data from the request body
        with open(tmp_path, "wb") as buffer:
            buffer.write(await request.body())

        uploaded = storage.upload(
            local_path=tmp_path,
            storage_folder_path=file_db.storage_folder_path + extra_folder_path,
            alternative=alternative,
            content_type=content_type or file_db.mime_client,
            content_range=content_range,
        )
        if uploaded and alternative == "original":
            file_db = File.patch(obj_id=file_id, update_dict={"in_storage": True})
        os.remove(tmp_path)

        logger.debug("storage_upload_file_done", file_id=file_id, uploaded=uploaded)

        return EndpointOutput(
            result={
                "uploaded": uploaded,
                "alternative": alternative,
            }
        )

    @crud_file_router.head("/storage/read/{file_id}/details")
    @crud_file_router.get("/storage/read/{file_id}/details")
    async def storage_read_file_details_by_id(
        file_id: str,
    ):
        """
        Get the details of a file by its ID
        """

        file_db = File.by_id(file_id)
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File not found",
                    description=("The file you are trying to update does not exist"),
                    code="file_not_found",
                )
            )

        # return the file details
        return EndpointOutput(result={"file": file_db})

    @crud_file_router.head("/storage/read/{file_id}/public-metadata")
    @crud_file_router.get("/storage/read/{file_id}/public-metadata")
    async def storage_read_file_public_metadata_by_id(
        file_id: str,
    ):
        """
        Public, non-ACL-filtered file metadata — same access model as the
        streaming endpoint (`/storage/read/{file_id}/{alternative_suffix}`).

        Returns only non-sensitive, file-derived fields (kind, extension, size,
        duration, width, height, extra) — never filenames or description — so
        editors can size/lay out media referenced from guest-submitted form
        responses, where the viewer holds ACLs on the form but not on the
        underlying files.

        Declared before the `{alternative_suffix}` streaming route so it is not
        matched as an alternative.
        """

        file_db = File.by_id(file_id)
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File not found",
                    description="The file you are requesting does not exist",
                    code="file_not_found",
                )
            )

        extra = file_db.extra_
        return EndpointOutput(
            result={
                "metadata": {
                    "kind": file_db.kind,
                    "extension": file_db.extension,
                    "size": file_db.size,
                    "duration": extra.duration,
                    "width": extra.width,
                    "height": extra.height,
                    "extra": extra,
                }
            }
        )

    # The {filename} variant serves the exact same content: the trailing
    # segment is cosmetic, giving the URL a real extension so podcast apps and
    # validators can infer the media type from the path (feeds generate it
    # from the alternative's registered filename/extension).
    @crud_file_router.head("/storage/read/{file_id}/{alternative_suffix}/{filename}")
    @crud_file_router.get("/storage/read/{file_id}/{alternative_suffix}/{filename}")
    @crud_file_router.head("/storage/read/{file_id}/{alternative_suffix}")
    @crud_file_router.get("/storage/read/{file_id}/{alternative_suffix}")
    async def storage_read_file_id_alternative(
        request: Request,
        background_tasks: BackgroundTasks,
        file_id: str,
        alternative_suffix: str = "original",
        filename: str | None = None,
        download: bool = Query(False),
    ):
        if request.method == "HEAD":
            # Answered directly from our own metadata rather than redirecting to storage
            file_db = File.by_id(file_id)
            alternative_format = (
                next(
                    (alt for alt in file_db.extra_.alternative_formats if alt.storage_suffix == alternative_suffix),
                    None,
                )
                if file_db is not None
                else None
            )
            if alternative_format is not None and alternative_format.size is not None:
                mime, _extension = describe_alternative(file_db, alternative_suffix, alternative_format)
                headers = {
                    "Content-Length": str(int(alternative_format.size)),
                    "Content-Type": mime,
                    "Accept-Ranges": "bytes",
                }
                last_modified = file_db.time_updated
                if isinstance(last_modified, datetime.datetime):
                    if last_modified.tzinfo is None:
                        last_modified = last_modified.replace(tzinfo=datetime.UTC)
                    headers["Last-Modified"] = format_datetime(last_modified.astimezone(datetime.UTC), usegmt=True)
                return Response(status_code=200, headers=headers)

        logger.debug(
            "storage_read_file_id_alternative",
            file_id=file_id,
            alternative_suffix=alternative_suffix,
            download=download,
        )

        requested_filename = sanitized_download_name(filename) if filename else None

        if download or requested_filename:
            presigned_url_details = get_onetime_presigned_url(
                file_id, alternative_suffix, download=download, filename=requested_filename
            )
        else:
            presigned_url_details = get_and_cache_presigned_url(file_id, alternative_suffix)

        if presigned_url_details is None:
            logger.warning(
                "storage_read_presigned_url_not_found", file_id=file_id, alternative_suffix=alternative_suffix
            )

            if alternative_suffix == "default":
                logger.debug("storage_read_default_unavailable_redirect_original", file_id=file_id)

                # let's redirect to the original file
                return RedirectResponse(f"/api/files/storage/read/{file_id}/original?download={download}")
            elif alternative_suffix == "original":
                logger.debug("storage_read_original_unavailable_redirect_stream", file_id=file_id)
                return RedirectResponse(f"/api/files/storage/read/{file_id}/original-stream?download={download}")

            if alternative_suffix != "original-stream":
                logger.debug(
                    "storage_read_alternative_unavailable_redirect_default",
                    file_id=file_id,
                    alternative_suffix=alternative_suffix,
                )
                return RedirectResponse(f"/api/files/storage/read/{file_id}/default?download={download}")

            logger.warning(
                "storage_read_presigned_url_generation_failed", file_id=file_id, alternative_suffix=alternative_suffix
            )
            return EndpointOutput(
                error=EndpointError(
                    title="Download URL not found",
                    description="No download URL found for the alternative format.",
                    code="download_url_not_found",
                )
            )

        # return the presigned URL
        presigned_url, expiration = presigned_url_details

        logger.debug("storage_read_redirecting", presigned_url_prefix=presigned_url[:20] if presigned_url else None)
        return RedirectResponse(
            presigned_url,
            headers={"Cache-Control": f"max-age={expiration - datetime.datetime.now().timestamp()}"},
        )

    @crud_file_router.head("/storage/read-from-local/{file_id}/{alternative_suffix}/{filename}")
    @crud_file_router.get("/storage/read-from-local/{file_id}/{alternative_suffix}/{filename}")
    @crud_file_router.head("/storage/read-from-local/{file_id}/{alternative_suffix}")
    @crud_file_router.get("/storage/read-from-local/{file_id}/{alternative_suffix}")
    async def read_from_local(
        file_id: str,
        alternative_suffix: str = "original",
        download: bool = Query(False),
        filename: str | None = None,
    ):
        file_db = File.by_id(file_id)
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File not found",
                    description=("The file you are trying to update does not exist"),
                    code="file_not_found",
                )
            )

        if file_db.storage_id is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage",
                    description=("The file you are trying to update has no storage"),
                )
            )

        storage: LocalStorage = get_file_storage(file_db.storage_id)  # type: ignore[assignment]

        if storage.storage_type != "local":
            return EndpointOutput(
                error=EndpointError(
                    title="Storage is not local",
                    description=("The storage method is not local"),
                    code="storage_not_local",
                )
            )

        if file_db.storage_folder_path is None:
            # 404
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found",
            )

        storage_folder = storage.config.path
        if storage_folder is None:
            return EndpointOutput(
                error=EndpointError(
                    title="Storage folder not found",
                    description="The storage folder is not found in the storage config",
                    code="storage_folder_not_found",
                )
            )

        storage_path = os.path.join(storage_folder, file_db.storage_folder_path, alternative_suffix)

        # Find the alternative format in `extra.alternative_formats`
        alternative_format = next(
            (alt for alt in file_db.extra_.alternative_formats if alt.storage_suffix == alternative_suffix),
            None,
        )

        mime, extension = describe_alternative(file_db, alternative_suffix, alternative_format)

        # A caller that knows what the file *is* (a form step knows its question) can name the
        # download; the stored name is a recorder-generated timestamp. Slugified below, so an
        # arbitrary query string can't inject into the Content-Disposition header.
        file_name = filename or file_db.public_filename or file_db.id.hex[:8]

        # remove the extension from the file name if it ends with it, to avoid double extensions like "file.jpg.jpg"
        if file_db.extension_client and file_name.endswith(file_db.extension_client):
            file_name = file_name.replace(file_db.extension_client, "")
        if file_db.extension and file_name.endswith(file_db.extension):
            file_name = file_name.replace(file_db.extension, "")

        # slugify the file name to avoid header errors
        file_name = slugify(file_name)

        file_name = named_with_extension(file_name, extension)

        headers = {
            "Cache-Control": "max-age=" + str(3600 * 24),
            "accept-ranges": "bytes",
            "Content-type": mime,
        }
        if download:
            headers["Content-Disposition"] = f'attachment; filename="{file_name}"'
        else:
            headers["Content-Disposition"] = f'inline; filename="{file_name}"'

        return fastapi.responses.FileResponse(
            # url
            storage_path,
            # set cache to 1H
            headers=headers,
            media_type=mime,
        )

    @crud_file_router.get("/storage/update-all")
    async def update_all(
        current_user_db: CurrentUser__dep,
        background_tasks: BackgroundTasks,
    ):
        if not current_user_db:
            return EndpointOutput(
                error=EndpointError(
                    title="Not identified",
                    description="You are not identified",
                )
            )

        if not current_user_db.email or (current_user_db.email and "joris" not in current_user_db.email):
            return EndpointOutput(
                error=EndpointError(
                    title="Not allowed",
                    description="You are not allowed to call this endpoint",
                )
            )

        with context_db() as db:
            # File.extra is JSONB, we want to filter where extra.duration is NULL
            files_db = (
                db.query(File)
                # .filter(File.extra["duration"].astext == None)
                # .filter(File.kind == "image")
                # .filter(File.id == "5e763d92-e55a-4067-9293-0cbe417ea1c1")
                # .filter(File.in_storage == False)
                .all()
            )

        logger.info("bulk_update_files_to_update", count=len(files_db))

        files_processed = 0

        for file_db in files_db:
            logger.info("bulk_update_processing_file", file_id=file_db.id)

            storage = get_file_storage(file_db.storage_id)

            # this is not about the entityFile but the physically stored file
            original_alternative = storage.get_original_alternative(storage_folder_path=file_db.storage_folder_path)
            if original_alternative is None:
                logger.warning("bulk_update_no_original_alternative", file_id=file_db.id)
                File.patch(
                    obj_id=file_db.id,
                    update_dict={"unprocessable": True},
                )
                continue

            size = storage.get_size(
                storage_folder_path=file_db.storage_folder_path,
                alternative="original",
            )

            # update the file
            file_db_updated = File.patch(obj_id=file_db.id, update_dict={"size": size, "in_storage": True})

            # create the fill_details task
            TasksManager.create_task(
                title="Fill details",
                method_name="fill_file_details",
                description="Fill file details for "
                + (
                    file_db_updated.original_filename
                    if file_db_updated.original_filename
                    else file_db_updated.id.hex[:8]
                ),
                args=[str(file_db.id)],
            )

            # launch tasks

            files_processed += 1
            # break
        background_tasks.add_task(sync_launch_tasks_processing)

        return EndpointOutput(
            result={
                "updatedFiles": files_processed,
                "left": len(files_db) - files_processed,
            }
        )

    return crud_file_router
