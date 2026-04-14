import datetime
import os
import time
import uuid

import fastapi
from fastapi import (
    BackgroundTasks,
    Body,
    Depends,
    HTTPException,
    Path,
    Query,
    Request,
    status,
)
from fastapi.responses import RedirectResponse
from rich import print

from libs.acl.methods import create_default_acls
from libs.acl.models import Who
from libs.cache import Cacher, get_cacher
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.types import SimpleResponse
from libs.files.models import FileAlternative
from libs.files.processors.magic_bytes.types import infer_type_from_extension
from libs.folders.methods import add_to_folder
from libs.folders.models import Folder
from libs.logger import print_warning
from libs.logger.customLogger import print_color
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

# CACHE_REFRESH_THRESHOLD_SECONDS = (
#     60  # Refresh URL if it will expire in less than 1 minute
# )


# # Create a TTLCache, e.g., up to 1024 entries, each expiring after 120 seconds.
# FILE_PRESIGNED_URLS_CACHE: cachetools.TTLCache = cachetools.TTLCache(
#     maxsize=1024, ttl=10 * CACHE_REFRESH_THRESHOLD_SECONDS
# )


def create_crud_file_router(prefix: str = "/api/files"):
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
    async def get_upload_details(
        request: Request,
        classic_deps: ClassicDeps__dep,
        current_storage_: CurrentStorage__dep,
        # current_user_db: CurrentUser__dep,
        # translator: Translator__dep,
        file_name: str = Body(..., alias="fileName"),
        content_type: str | None = Body(None, alias="contentType"),
        file_size: int | None = Body(None, alias="fileSize"),
        alternative: str = Body("original", alias="alternative"),
        file_id: uuid.UUID | None = Body(None, alias="fileId"),
        folder_path: str | None = Body(None, alias="folderPath"),
        folder_for_id: uuid.UUID | None = Body(None, alias="folderForId"),
        folder_for_kind: str | None = Body(None, alias="folderForKind"),
    ):
        current_user_db, session, translator = classic_deps

        storage_to_use = current_storage_

        # origin is used for presigned resumable PUT url
        origin = get_origin(
            request=request, default_origin=request.headers.get("origin")
        )

        # folder management
        parent_id = None
        if folder_path is None:
            print("No folder path")
        else:
            print("folder_path for the new file", folder_path)
            # should start with /, contains no / at the end
            if not folder_path.startswith("/"):
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate(
                            "The folder path should start with /"
                        ),
                        code="invalid_folder_path",
                    )
                )
            if folder_path.endswith("/"):
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate(
                            "The folder path should not end with /"
                        ),
                        code="invalid_folder_path",
                    )
                )
            if len(folder_path) == 1:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate(
                            "The folder path should not be /"
                        ),
                        code="invalid_folder_path",
                    )
                )

            if "//" in folder_path:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid folder path"),
                        description=translator.translate(
                            "The folder path should not contain //"
                        ),
                        code="invalid_folder_path",
                    )
                )

            # now we have something like : /my/folder/path

            folder_names = folder_path.split("/")[1:]

            print("folder_names", folder_names)

            # root folder:
            folder_db = Folder.get_first_by(
                for_id=folder_for_id,
                for_kind=folder_for_kind,
            )

            if folder_db is None:
                print("root folder not found -> create it")
                folder_db = Folder.create(
                    obj_dict={
                        "for_id": folder_for_id,
                        "for_kind": folder_for_kind,
                        "name": folder_names[0],
                        # "parent_id": parent_id,
                    }
                )
                print("root folder already created", folder_db)
            else:
                print("root folder already created", folder_db)
            parent_id = folder_db.id

            # check if sub folder exists -> create it if not

            for folder_level, folder_name in enumerate(folder_names[1:]):
                print(
                    "\t" + str(folder_level) + " - Parent id for next loop:", parent_id
                )

                if len(folder_name) == 0:
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("Invalid folder path"),
                            description=translator.translate(
                                "The folder path should not contain empty folder names"
                            ),
                            code="invalid_folder_path",
                        )
                    )

                folder_db = Folder.get_first_by(
                    parent_id=parent_id,
                    name=folder_name,
                )
                print(
                    "subfolder n" + str(folder_level) + " with name",
                    folder_name,
                )
                if folder_db is None:
                    print("subfolder not found -> create it")
                    folder_db = Folder.create(
                        obj_dict={
                            "name": folder_name,
                            "parent_id": parent_id,
                        }
                    )
                    print("subfolder created", folder_db)
                else:
                    print("subfolder found", folder_db)
                parent_id = folder_db.id

        # now we have the parent_id of the last folder, hence the target folder

        if file_id is not None:
            if alternative != "original":
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Not allowed"),
                        description=translator.translate(
                            "You can't set a file id to upload "
                            + "another alternative than the original"
                        ),
                    )
                )
            # check if file is not already uploaded
            file_db = File.by_id(file_id)
            if file_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("File not found"),
                        description=translator.translate(
                            "The file you are trying to upload does not exist"
                        ),
                        code="file_not_found",
                    )
                )
            if file_db.in_storage:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Original file already in storage"),
                        description=translator.translate(
                            "The file you are trying to upload is already in storage"
                        ),
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
                # unprocessable=False,
                # mime="",
                # size=0,
                storage_id=storage_to_use.storage_settings.id,
                storage_folder_path=storage_folder_path,
                in_storage=False,
                upload_url=upload_url,
            )
            print("Creating File for uploading")
            with context_db() as db:
                db.expire_on_commit = False
                file_db = File.create(obj=file, _db=db)
                print("File created for uploading")

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
            print("Adding file to this folder:", parent_id)
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
        print("Creating Empty File:", file)
        with context_db() as db:
            db.expire_on_commit = False
            file_db = File.create(obj=file, _db=db)
            print("File created for uploading")

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
                    description=(
                        "The file you are trying to access has no storage folder"
                    ),
                    code="file_not_found",
                )
            )
        alternative_chunked = f"chunk-{start_bytes}-{end_bytes}"
        storage_folder_path_chunked = (
            file_db.storage_folder_path + "/" + (alternative or "original") + "_chunked"
        )

        origin = request.headers.get("origin")
        print("Using this origin:", origin)
        try:
            host = request.client.host
            print("With this host:", host)

            request_origin = request.url.__str__() if request else None
            print("Request origin:", request_origin)
            from_header_origin = (
                request.headers.get("ba-origin", None) if request else None
            )
            print("From header origin:", from_header_origin)
            from_header_host = request.headers.get("host", None) if request else None
            print("From header host:", from_header_host)
            from_forward_origin = (
                request.headers.get("forward-origin", None) if request else None
            )
            print("From header forward-origin:", from_forward_origin)
            if from_forward_origin:
                # format https://somedomain.tld/some/url
                # extract https://somedomain.tld
                origin = "/".join(from_forward_origin.split("/")[:3])
                print("Using forward-origin as origin:", origin)

            # origin = from_header_origin if from_header_origin else request_origin
        except Exception as e:
            print("Error occurred while extracting headers:", e)

        upload_url_chunk = storage_to_use.get_upload_url(
            storage_folder_path=storage_folder_path_chunked,
            alternative=alternative_chunked,
            origin=origin,
        )
        print("Chunk upload URL:", upload_url_chunk)
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
        storage_folder_path_chunked = (
            file_db.storage_folder_path + "/" + (alternative or "original") + "_chunked"
        )
        chunks = storage_to_use.get_files_in_folder(
            storage_folder_path=storage_folder_path_chunked
        )

        if len(chunks) == 0:
            return EndpointOutput(
                error=EndpointError(
                    title="No chunks found",
                    description=("No chunks found for the file"),
                    code="no_chunks_found",
                )
            )

        print("Chunks found:", chunks)
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

        print("Launching tasks to merge chunks... FORCE?", force)
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
        print("DETAILS RECEIVED:", duration)
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

        print_color("yellow", "You want to update this file:", file_db.id)

        storage = get_file_storage(file_db.storage_id)

        # check that the file is in the storage
        in_storage = False
        size = None
        if file_db.storage_folder_path is not None:
            # original or original-stream or None
            in_storage_alternative = storage.get_original_alternative(
                storage_folder_path=file_db.storage_folder_path
            )
            in_storage = in_storage_alternative is not None
            if not in_storage:
                print_color("red", "File not found in storage")
                return EndpointOutput(
                    error=EndpointError(
                        title="File not found in storage",
                        description=(
                            "The file you are trying to update is not in storage"
                        ),
                        code="file_not_found_in_storage",
                    )
                )
            size = storage.get_size(
                storage_folder_path=file_db.storage_folder_path,
                alternative=in_storage_alternative,
            )
            print_color("blue", "File found in storage:", file_db.id, "size:", size)
        else:
            print_color("red", "File not found in storage")
            return EndpointOutput(
                error=EndpointError(
                    title="File not found in storage",
                    description=("The file you are trying to update is not in storage"),
                    code="file_not_found_in_storage",
                )
            )
        tac = time.time()
        print("Time to check if file is in storage:", tac - tic)

        file_type_from_extension = "unknown"
        if file_db.extension_client:
            file_type_from_extension = infer_type_from_extension(
                file_db.extension_client.replace(".", "")
            )

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

        # print("File updated:", file_db_updated)

        print("Launching tasks to fill file details... FORCE?", force)
        # create the fill_details task
        fill_file_details_task = TasksManager.create_task(
            title="Fill details",
            method_name="fill_file_details",
            description="Fill file details for "
            + (
                file_db_updated.original_filename
                if file_db_updated.original_filename
                else file_db_updated.id.hex[:8]
            ),
            args=[file_id],
            kwargs={
                "force": force,
            },
        )

        # launch tasks in background without awaiting
        print("Adding task to background tasks (fire and forget)")

        # launch tasks in background without blocking the response
        print("Adding task to background tasks")

        # Use the synchronous version to avoid async issues in background tasks
        background_tasks.add_task(sync_launch_tasks_processing)
        print("Background task added")

        print("Returning updated file details")

        return EndpointOutput(
            result={"file": file_db_updated, "taskId": fill_file_details_task.id}
        )

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
                    description=(
                        "The file you are trying to update has no storage method"
                    ),
                    code="file_has_no_storage",
                )
            )

        if file_db.storage_folder_path is None:
            return EndpointOutput(
                error=EndpointError(
                    title="File has no storage folder",
                    description=(
                        "The storage folder path of the"
                        + "file you are trying to update is empty."
                    ),
                    code="file_has_no_storage_folder_path",
                )
            )

        if file_db.in_storage:
            return EndpointOutput(
                error=EndpointError(
                    title="File already in storage",
                    description=(
                        "The file you are trying to update is already in storage"
                    ),
                    code="file_already_in_storage",
                    details={
                        "file_id": file_id,
                        "alternative": alternative,
                        "already": "by_database",
                    },
                )
            )

        print(
            "Uploading file",
            {
                "id": file_id,
                "alternative": alternative,
                "extra_folder_path": extra_folder_path,
            },
        )

        # read content-range header: if present it means we are uploading a piece of a file
        content_range = request.headers.get("Content-Range")
        if content_range:
            print("Content-Range header found:", content_range)

        content_type = request.headers.get("Content-Type")
        if content_type and file_db.mime_client is None:
            # Set the file's MIME type based on the Content-Type header
            file_db.mime_client = content_type
            print_color("yellow", f"Content-Type header found and set: {content_type}")

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
                    description=(
                        "The file you are trying to upload is already in storage"
                    ),
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
        tmp_path = f"/tmp/{file_id}-{alternative}"

        # Read the raw file data from the request body
        with open(tmp_path, "wb") as buffer:
            buffer.write(await request.body())

        uploaded = storage.upload(
            local_path=tmp_path,
            storage_folder_path=file_db.storage_folder_path + extra_folder_path,
            alternative=alternative,
            content_range=content_range,
        )
        if uploaded and alternative == "original":
            file_db = File.patch(obj_id=file_id, update_dict={"in_storage": True})
        os.remove(tmp_path)

        print("Uploaded", uploaded)

        return EndpointOutput(
            result={
                "uploaded": uploaded,
                "alternative": alternative,
            }
        )

    def get_presigned_url(
        file_id: str,
        alternative_suffix: str = "original",
        download: bool = False,
    ) -> tuple[str, float] | None:
        # Retrieve the file using the existing pattern
        file_db = File.by_id(file_id)
        if file_db is None:
            return None

        if file_db.storage_id is None or not file_db.storage_folder_path:
            return None

        # Fetch the storage instance using the existing pattern
        storage_db = get_file_storage(file_db.storage_id)

        print("STORAGE", storage_db.storage_type, "for file", file_id)

        extra = file_db.extra_
        # Find the alternative format in `extra.alternative_formats`
        alternative_format = next(
            (
                alt
                for alt in extra.alternative_formats
                if alt.storage_suffix == alternative_suffix
            ),
            None,
        )

        # If the alternative format is not found, check if it exists in storage
        if not alternative_format:
            print_color(
                "red",
                f"Alternative format {alternative_suffix.upper()} not found in database",
            )
            if not storage_db.exists_in_storage(
                storage_folder_path=file_db.storage_folder_path,
                alternative=alternative_suffix,
            ):
                print_color(
                    "red",
                    f"Alternative format {alternative_suffix.upper()} not found in storage",
                )
                return None
            else:
                print_color(
                    "green",
                    f"Alternative format {alternative_suffix.upper()} found in storage",
                )
                #

            # Alternative exists in storage but not in the database, create it
            download_url_details = storage_db.get_download_url(
                file_id=file_id,
                storage_folder_path=file_db.storage_folder_path,
                alternative=alternative_suffix,
                download=download,
            )
            if download_url_details is None:
                return None
            new_presigned_url, expiration_seconds = download_url_details
            new_expiration = (
                datetime.datetime.now()
                + datetime.timedelta(seconds=expiration_seconds - 60)
            ).timestamp()

            # Create a new alternative format and add it to the database
            alternative_format = FileAlternative(
                storage_suffix=alternative_suffix,
                presigned_url=new_presigned_url,
                presigned_url_expiration=new_expiration,
                mime=file_db.mime or "application/octet-stream",
                kind=file_db.kind or "unknown",
                extension=file_db.extension or "",
                size=file_db.size if alternative_suffix == "original" else None,
            )
            extra.alternative_formats.append(alternative_format)
            file_db.patch(obj_id=file_db.id, update_dict={"extra": extra.model_dump()})
            print_color("magenta", "New alternative format created", alternative_suffix)

            print_color(
                "magenta", f"Updating presigned URL for {alternative_suffix} [new]"
            )
            return new_presigned_url, new_expiration

        print_color(
            "green",
            f"Alternative format {alternative_suffix.upper()} found in database",
        )

        # if "download" is true we create and redirect to a new presigned url
        if download:
            print_color(
                "green",
                f"Download is set to true, creating a new presigned URL for {alternative_suffix}",
            )
            # Generate a new presigned URL for the existing alternative
            download_url_details = storage_db.get_download_url(
                file_id=file_id,
                storage_folder_path=file_db.storage_folder_path,
                alternative=alternative_suffix,
                download=download,
            )
            if download_url_details is None:
                print_color("red", "no Download URL generated.")
                return None
            new_presigned_url, new_expiration = download_url_details
            return new_presigned_url, new_expiration

        # if not downloading: the presigned url is to be cached (hence, it can be reloaded)
        # Check if a presigned URL exists and if it is still valid
        now = datetime.datetime.now().timestamp()
        if (
            alternative_format.presigned_url
            and alternative_format.presigned_url_expiration
            and "download=true" not in alternative_format.presigned_url
        ):
            print_color("green", "Presigned URL found in database", alternative_suffix)
            if alternative_format.presigned_url_expiration > now + 60:
                # it expires at least in 1 minute
                print_color(
                    "green", "Presigned URL is still valid (>1mn)", alternative_suffix
                )
                # URL is still valid, redirect to it
                return (
                    alternative_format.presigned_url,
                    alternative_format.presigned_url_expiration,
                )
            else:
                print_color("red", "Presigned URL is expired", alternative_suffix)
        else:
            print("Presigned URL is missing", alternative_suffix)

        # Generate a new presigned URL for the existing alternative
        download_url_details = storage_db.get_download_url(
            file_id=file_id,
            storage_folder_path=file_db.storage_folder_path,
            alternative=alternative_suffix,
            download=download,
        )

        if download_url_details is None:
            print("Download URL not found: we can't generate the presigned URL")
            return None

        new_presigned_url, expiration_seconds = download_url_details

        new_expiration = (
            datetime.datetime.now()
            + datetime.timedelta(seconds=expiration_seconds - 60)
        ).timestamp()

        # Update the existing alternative with the new presigned URL and expiration
        print("Updating presigned URL for", alternative_suffix, "[existed]")
        alternative_format.presigned_url = new_presigned_url
        alternative_format.presigned_url_expiration = new_expiration
        file_db.patch(obj_id=file_db.id, update_dict={"extra": extra.model_dump()})

        return new_presigned_url, new_expiration

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

    @crud_file_router.head("/storage/read/{file_id}/{alternative_suffix}")
    @crud_file_router.get("/storage/read/{file_id}/{alternative_suffix}")
    async def storage_read_file_id_alternative(
        background_tasks: BackgroundTasks,
        file_id: str,
        alternative_suffix: str = "original",
        cacher: Cacher = Depends(get_cacher),
        download: bool = Query(False),
    ):
        print_color(
            "cyan", "READ FILE:", file_id, alternative_suffix, "download:", download
        )

        cache_key = f"presignedurl-{file_id}-{alternative_suffix}-{download}"
        presigned_url_details = await cacher.get(cache_key)

        if presigned_url_details is None:
            # not in cache => fetch it
            print_color(
                "red", "Presigned URL not found in server cache: ", alternative_suffix
            )
            presigned_url_details = get_presigned_url(
                file_id, alternative_suffix, download
            )
            if presigned_url_details:
                # cache it
                presigned_url, expiration = presigned_url_details
                print_color("blue", "Caching presigned URL", alternative_suffix)
                await cacher.set(
                    cache_key,
                    presigned_url_details,
                    ttl=int(expiration - datetime.datetime.now().timestamp()),
                )
        else:
            time_left = await cacher.time_to_live(cache_key)
            print_color(
                "green",
                "Presigned URL found in server cache (",
                time_left,
                "s left): ",
                alternative_suffix,
            )

        if presigned_url_details is None:
            print_color(
                "red",
                "Presigned URL not found in server cache nor in storage: ",
                file_id,
            )

            if alternative_suffix == "default":
                print_color("blue", "DEFAULT not available=>redirect to ORIGINAL")

                # let's redirect to the original file
                return RedirectResponse(
                    f"/api/files/storage/read/{file_id}/original?download={download}"
                )
            elif alternative_suffix == "original":
                print_color(
                    "blue", "ORIGINAL not available=>redirect to original-stream"
                )
                return RedirectResponse(
                    f"/api/files/storage/read/{file_id}/original-stream?download={download}"
                )

            print_color(
                "red",
                "we can't generate the presigned URL so let's return an error",
            )

            # still not found => return error
            return EndpointOutput(
                error=EndpointError(
                    title="Download URL not found",
                    description="No download URL found for the alternative format.",
                    code="download_url_not_found",
                )
            )

        # return the presigned URL
        presigned_url, expiration = presigned_url_details

        print("Redirecting to", presigned_url[:20] if presigned_url else "N/A")
        return RedirectResponse(
            presigned_url,
            headers={
                "Cache-Control": f"max-age={expiration - datetime.datetime.now().timestamp()}"
            },
        )

    @crud_file_router.head("/storage/read-from-local/{file_id}/{alternative_suffix}")
    @crud_file_router.get("/storage/read-from-local/{file_id}/{alternative_suffix}")
    async def read_from_local(
        file_id: str,
        alternative_suffix: str = "original",
        download: bool = Query(False),
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

        storage: LocalStorage = get_file_storage(file_db.storage_id)  # type: ignore

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

        storage_path = os.path.join(
            storage_folder, file_db.storage_folder_path, alternative_suffix
        )

        # Find the alternative format in `extra.alternative_formats`
        alternative_format = next(
            (
                alt
                for alt in file_db.extra_.alternative_formats
                if alt.storage_suffix == alternative_suffix
            ),
            None,
        )

        if alternative_format is not None:
            mime = alternative_format.mime
            extension = alternative_format.extension
        else:
            mime = file_db.mime or file_db.mime_client or "application/octet-stream"
            extension = file_db.extension or file_db.extension_client or ""

        file_name = file_db.public_filename or file_db.id.hex[:8]

        # remove the extension from the file name if it ends with it, to avoid double extensions like "file.jpg.jpg"
        if file_db.extension_client and file_name.endswith(file_db.extension_client):
            file_name = file_name.replace(file_db.extension_client, "")
        if file_db.extension and file_name.endswith(file_db.extension):
            file_name = file_name.replace(file_db.extension, "")

        # slugify the file name to avoid header errors
        file_name = slugify(file_name)

        if extension and not file_name.endswith(extension):
            file_name += "." + extension
        file_name = file_name.replace("..", ".")

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

        if not current_user_db.email or (
            current_user_db.email and "joris" not in current_user_db.email
        ):
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

        print("Files to update:", len(files_db))

        files_processed = 0

        for file_db in files_db:
            print_warning("You want to update this file:", file_db.id)

            storage = get_file_storage(file_db.storage_id)

            # this is not about the entityFile but the physically stored file
            original_alternative = storage.get_original_alternative(
                storage_folder_path=file_db.storage_folder_path
            )
            if original_alternative is None:
                print_warning(
                    "No original file to process (original | original-stream)"
                )
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
            file_db_updated = File.patch(
                obj_id=file_db.id, update_dict={"size": size, "in_storage": True}
            )

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
