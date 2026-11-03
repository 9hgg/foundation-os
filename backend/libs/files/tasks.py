import os
import uuid

import ffmpegio
import structlog
from magika import Magika

from libs.files.methods.basic import compute_and_persist_file_hash
from libs.files.storage._generic import GenericStorage
from libs.tasks.tasks_manager import TasksManager
from libs.utils.methods import deep_update
from libs.utils.types import serialize

from .methods.simulation import infer_simulation_file_details
from .models import ExtraDetailsFile, File, FileAlternative
from .processors import PROCESSOR_MAPPING
from .processors.magic_bytes.ffprobe_parser import get_possible_type_via_ffprobe
from .processors.magic_bytes.parser import get_possible_types
from .storage import get_file_storage

logger = structlog.get_logger(__name__)

magika = Magika()


@TasksManager.enlist_task()
def fill_file_hash(file_id: uuid.UUID, force: bool = False, **kwargs) -> str | None:
    """Populate the SHA-256 digest for one file, regardless of its kind."""
    task = kwargs.get("task")
    TasksManager.set_task_progress(task, 5.0)
    file_db = File.by_id(obj_id=file_id)
    if file_db is None:
        logger.warning("file_hash_file_not_found", file_id=str(file_id))
        return None

    digest = compute_and_persist_file_hash(file_db, force=force)
    TasksManager.set_task_progress(task, 100.0)
    return digest


def narrow_by_ffprobe_kind(possible_types: list, ffprobe_kind: str) -> list:
    """Keep only the candidates ffprobe agrees with -- unless that leaves nothing.

    ffprobe answers "video" or "audio" and never "image". A still image in a container it can
    read is therefore always contradicted: a .webp is a RIFF file, so it matches both the webp
    signature and the wav one, the wav match is what sends it to ffprobe in the first place, and
    ffprobe then calls it a video. Narrowing unconditionally would drop every candidate and leave
    the file with no kind, no mime and no extension at all.

    A filter that eliminates everything has learned nothing, so it keeps what it had -- the same
    guard the mime_client filter already applies.
    """
    narrowed = [possible_type for possible_type in possible_types if possible_type.type == ffprobe_kind]
    return narrowed or possible_types


@TasksManager.enlist_task()
def fill_file_details(file_id: uuid.UUID, force=False, **kwargs):  # noqa: C901
    """
    Fill the details of a file like:
    - mime
    - extension
    - kind
    then ask to generate the alternatives for this file kind.
    """
    task = kwargs.get("task")

    TasksManager.set_task_progress(task, 5.0)
    file_db = File.by_id(obj_id=file_id)
    if file_db is None:
        logger.warning("file_details_file_not_found", file_id=str(file_id))
        return
    if file_db.storage_folder_path is None or file_db.storage_id is None:
        logger.warning("file_details_storage_metadata_missing", file_id=str(file_id))
        return
    storage = get_file_storage(file_db.storage_id)

    TasksManager.set_task_progress(task, 20.0)
    original_alternative = storage.get_original_alternative(
        storage_folder_path=file_db.storage_folder_path
    )
    if original_alternative is None:
        logger.warning("file_details_original_missing", file_id=str(file_id))
        File.patch(
            obj_id=file_db.id,
            update_dict={"unprocessable": True},
        )
        return

    # Persist identity as soon as the original exists. This is independent of
    # type inference and therefore also covers files whose first bytes cannot
    # be classified or processed.
    compute_and_persist_file_hash(file_db, force=force)

    first_bytes = storage.get_first_bytes(
        storage_folder_path=file_db.storage_folder_path,
        alternative=original_alternative,
    )
    if first_bytes is None:
        logger.warning("file_details_first_bytes_missing", file_id=str(file_id))
        return

    inferred_simulation_details = infer_simulation_file_details(
        extension_client=file_db.extension_client,
        extension=file_db.extension,
    )

    # processing a fmu, mo or mos file, we can directly fill the details and generate alternatives
    if inferred_simulation_details is not None:
        File.patch(
            obj_id=file_db.id,
            update_dict=inferred_simulation_details,
        )
        generate_file_alternatives_task = TasksManager.create_task(
            title="Generate alternatives",
            method_name="generate_file_alternatives",
            description="Generate file alternatives for "
            + (
                file_db.original_filename
                if file_db.original_filename
                else file_db.id.hex[:8]
            ),
            args=[file_id],
            kwargs={
                "force": force,
            },
        )
        TasksManager.set_task_progress(task, 100.0)
        return {"task_id": generate_file_alternatives_task.id}

    TasksManager.set_task_progress(task, 40.0)
    # NAIVE dict of first bytes approach
    possible_types = get_possible_types(first_bytes=first_bytes)

    if len(possible_types) == 0:
        # nothing found -> using Magika
        logger.debug(
            "file_details_types_parser_empty",
            file_id=str(file_id),
            original_filename=file_db.original_filename,
            mime_client=file_db.mime_client,
            extension_client=file_db.extension_client,
        )
        logger.info("file_details_using_magika", file_id=str(file_id))
        magika_output = magika.identify_bytes(first_bytes).output
        magika_mime_type = magika_output.mime_type
        magika_group = magika_output.group
        logger.debug(
            "file_details_magika_identified",
            file_id=str(file_id),
            original_filename=file_db.original_filename,
            mime_type=magika_mime_type,
            kind=magika_group,
        )

        File.patch(
            obj_id=file_db.id,
            update_dict={
                "mime": magika_mime_type,
                # "extension": "." + possible_types[0].extension,
                "kind": magika_group,
            },
        )
    else:
        TasksManager.set_task_progress(task, 60.0)
        logger.debug(
            "file_details_possible_types",
            file_id=str(file_id),
            original_filename=file_db.original_filename,
            mime_client=file_db.mime_client,
            extension_client=file_db.extension_client,
            possible_types=possible_types,
        )

        audio_is_possible = False
        video_is_possible = False
        for possible_type in possible_types:
            if possible_type.type == "audio":
                audio_is_possible = True
            elif possible_type.type == "video":
                video_is_possible = True

        if audio_is_possible or video_is_possible:
            possible_types_from_ffprobe = get_possible_type_via_ffprobe(
                storage, file_db.storage_folder_path, original_alternative
            )
            logger.debug(
                "file_details_ffprobe_types",
                file_id=str(file_id),
                possible_types=possible_types_from_ffprobe,
            )
            if possible_types_from_ffprobe is not None:
                audio_or_video = possible_types_from_ffprobe.get("kind_from_ffmpeg")
                if audio_or_video is not None:
                    possible_types = narrow_by_ffprobe_kind(possible_types, audio_or_video)

        logger.debug(
            "file_details_possible_types_filtered",
            file_id=str(file_id),
            possible_types=possible_types,
        )

        if file_db.mime_client is not None:
            possible_types_filtered_by_mime_client = [
                possible_type
                for possible_type in possible_types
                if possible_type.mime == file_db.mime_client
                or possible_type.extension == file_db.extension_client
            ]
            logger.debug(
                "file_details_client_types_filtered",
                file_id=str(file_id),
                possible_types=possible_types_filtered_by_mime_client,
            )
            if len(possible_types_filtered_by_mime_client) > 0:
                possible_types = possible_types_filtered_by_mime_client

        if len(possible_types) == 0:
            logger.warning(
                "file_details_no_possible_types",
                file_id=str(file_id),
                original_filename=file_db.original_filename,
                mime_client=file_db.mime_client,
                extension_client=file_db.extension_client,
            )
        else:
            # if we have possible types, we take the first one matching the file_db.mime_client

            File.patch(
                obj_id=file_db.id,
                update_dict={
                    "mime": possible_types[0].mime,
                    "extension": "." + possible_types[0].extension,
                    "kind": possible_types[0].type,
                },
            )

    # Only `update_after_upload` wrote this, so a file whose client never made that call stayed
    # sizeless for ever even with its bytes safely in storage.
    if file_db.size is None:
        size_in_storage = storage.get_size(
            storage_folder_path=file_db.storage_folder_path
        )
        if size_in_storage:
            File.patch(
                obj_id=file_db.id, update_dict={"size": float(size_in_storage)}
            )
            logger.info(
                "file_size_filled_from_storage",
                file_id=str(file_id),
                size=size_in_storage,
            )

    TasksManager.set_task_progress(task, 85.0)
    # # create the generate_file_alternatives task
    generate_file_alternatives_task = TasksManager.create_task(
        title="Generate alternatives",
        method_name="generate_file_alternatives",
        description="Generate file alternatives for "
        + (
            file_db.original_filename
            if file_db.original_filename
            else file_db.id.hex[:8]
        ),
        args=[file_id],
        kwargs={
            "force": force,
        },
    )

    TasksManager.set_task_progress(task, 100.0)
    return {"task_id": generate_file_alternatives_task.id}


@TasksManager.enlist_task()
def generate_file_alternatives(file_id: uuid.UUID, force=False, **kwargs):
    """
    Generate alternatives for a file based on its kind.
    This function retrieves the file from the database, checks its kind, and uses the appropriate processor.
    It only updates the file.extra.
    """

    task = kwargs.get("task")

    TasksManager.set_task_progress(task, 5.0)
    file_db = File.by_id(obj_id=file_id)

    if file_db is None:
        logger.warning("file_alternatives_file_not_found", file_id=str(file_id))
        return

    # This must happen before every processor-specific early return. Unknown
    # kinds and metadata sidecars still require hashes for folder sync.
    compute_and_persist_file_hash(file_db, force=force)

    if file_db.kind is None:
        logger.warning("file_alternatives_kind_missing", file_id=str(file_id))
        return

    if file_db.kind not in PROCESSOR_MAPPING:
        logger.warning(
            "file_alternatives_processor_missing",
            file_id=str(file_id),
            kind=file_db.kind,
        )
        return

    if file_db.storage_folder_path is None:
        logger.warning("file_alternatives_storage_path_missing", file_id=str(file_id))
        return

    TasksManager.set_task_progress(task, 20.0)
    ProcessorClass = PROCESSOR_MAPPING[file_db.kind]
    processor = ProcessorClass(file_db=file_db)

    TasksManager.set_task_progress(task, 45.0)
    new_alternatives = processor.generate_alternatives(force=force)

    TasksManager.set_task_progress(task, 70.0)
    new_extra_data: ExtraDetailsFile = (
        processor.generate_extra_data(force=force) or ExtraDetailsFile()
    )

    # delete local copy of the original
    processor.clear_local_file()

    TasksManager.set_task_progress(task, 85.0)
    # concat the new alternatives with the old ones
    all_alternatives_as_list: list[FileAlternative] = []
    all_alternatives_as_dict: dict[str, FileAlternative] = {}
    for v in file_db.extra_.alternative_formats:
        all_alternatives_as_dict[v.storage_suffix] = v
    for alternative in new_alternatives:
        all_alternatives_as_dict[alternative.storage_suffix] = alternative
    for alternative in all_alternatives_as_dict.values():
        all_alternatives_as_list.append(alternative)
    all_alternatives_as_list.sort(key=lambda x: x.storage_suffix)
    all_alternatives_as_list = [
        alternative
        for alternative in all_alternatives_as_list
        if alternative is not None
    ]
    new_extra_data.alternative_formats = all_alternatives_as_list

    new_extra_data_dict = deep_update(
        serialize(file_db.extra), serialize(new_extra_data)
    )

    File.patch(
        obj_id=file_db.id,
        update_dict={
            "extra": new_extra_data_dict,
        },
    )

    TasksManager.set_task_progress(task, 100.0)


def _download_and_sort_chunks(
    storage: GenericStorage,
    file_db: File,
    alternative: str,
    storage_folder_path_chunked: str,
):
    """Download chunks locally and sort them by range."""
    all_files = storage.get_files_in_folder(
        storage_folder_path=storage_folder_path_chunked
    )

    # Filter files to only include valid chunk files (format: chunk-{start}-{end})
    chunks = []
    for file_name in all_files:
        parts = file_name.split("-")
        if len(parts) == 3 and parts[0] == "chunk":
            try:
                # Validate that the second and third parts are integers
                int(parts[1])  # start byte
                int(parts[2])  # end byte
                chunks.append(file_name)
            except ValueError:
                # Skip files that don't have valid integer byte ranges
                logger.warning("file_chunks_invalid_name", file_name=file_name)
                continue

    if len(chunks) == 0:
        logger.warning(
            "file_chunks_none_found",
            storage_folder_path=storage_folder_path_chunked,
            storage_type=storage.storage_type,
        )
        return None, None

    # order by start byte (second part after splitting by "-")
    chunks.sort(key=lambda x: int(x.split("-")[1]))

    # warn if missing bytes between consecutive chunks
    for i in range(len(chunks) - 1):
        current_end = int(chunks[i].split("-")[2])
        next_start = int(chunks[i + 1].split("-")[1])
        if next_start - current_end > 1:
            logger.warning(
                "file_chunks_gap_detected",
                previous_chunk=chunks[i],
                next_chunk=chunks[i + 1],
            )

    # download each chunk locally
    chunk_files = {}
    for chunk in chunks:
        output_path = GenericStorage.get_temporary_local_path(prefix=chunk)
        local_path = storage.download(
            storage_folder_path=file_db.storage_folder_path
            + "/"
            + alternative
            + "_chunked",
            alternative=chunk,
            local_path=output_path,
            force=True,
        )
        chunk_files[chunk] = local_path

    return chunks, chunk_files


def _merge_and_upload_chunks(
    storage: GenericStorage,
    file_db: File,
    alternative: str,
    chunks: list[str],
    chunk_files: dict[str, str],
):
    """Merge chunks into a single file and upload to storage."""

    merged_path = GenericStorage.get_temporary_local_path(prefix="merged")
    total_chunks_size = 0

    with open(merged_path, "wb") as merged_file:
        for i, chunk in enumerate(chunks):
            chunk_path = chunk_files[chunk]
            chunk_size = os.path.getsize(chunk_path)
            total_chunks_size += chunk_size

            with open(chunk_path, "rb") as chunk_file:
                data = chunk_file.read()
                merged_file.write(data)

            logger.debug(
                "file_chunk_merged",
                chunk=chunk,
                chunk_index=i + 1,
                chunk_count=len(chunks),
                chunk_size=chunk_size,
            )

    # Get the final merged file size
    merged_file_size = os.path.getsize(merged_path)

    logger.info(
        "file_chunks_merged",
        chunk_count=len(chunks),
        total_chunks_size=total_chunks_size,
        merged_file_size=merged_file_size,
        size_difference=merged_file_size - total_chunks_size,
    )

    if merged_file_size != total_chunks_size:
        logger.warning(
            "file_chunks_size_mismatch",
            expected_size=total_chunks_size,
            actual_size=merged_file_size,
        )

    file_path_to_upload = merged_path

    # `extension` is null until fill_file_details runs, which is after this.
    if "webm" in (file_db.extension_client or "") or "webm" in (file_db.extension or ""):
        # Output path
        output_path = merged_path + ".webm"
        logger.info("file_webm_retranscoding", output_path=output_path)

        # Transcode without re-encoding, just fix container/metadata
        ffmpegio.transcode(
            merged_path,
            output_path,
            overwrite=True,
            show_log=True,
            **{
                "c": "copy",
            },
        )
        file_path_to_upload = output_path
        os.remove(merged_path)  # remove the original merged file

    # upload the merged file to storage
    storage.upload(
        local_path=file_path_to_upload,
        storage_folder_path=file_db.storage_folder_path,
        alternative=alternative,
        force=True,
    )
    os.remove(file_path_to_upload)  # remove the local copy after upload

    logger.info(
        "file_chunks_uploaded",
        merged_file_size=merged_file_size,
        alternative=alternative,
    )

    return merged_path


def _cleanup_temporary_files(chunk_files):
    """Clean up temporary files and optionally chunks folder."""

    # cleanup temporary files
    for chunk_file_path in chunk_files.values():
        try:
            os.remove(chunk_file_path)
        except Exception:
            logger.exception("file_chunks_cleanup_failed", path=chunk_file_path)
    logger.debug("file_chunks_cleanup_succeeded", file_count=len(chunk_files))


@TasksManager.enlist_task()
def merge_chunks(file_id: uuid.UUID, alternative: str, force=False, **kwargs):
    file_db = File.by_id(file_id)
    if file_db is None:
        logger.warning("merge_chunks_file_not_found", file_id=str(file_id))
        return

    storage = get_file_storage(file_db.storage_id)

    # if alternative already exists and not forced, skip merging
    alternative_exists = storage.exists_in_storage(
        storage_folder_path=file_db.storage_folder_path, alternative=alternative
    )
    if alternative_exists and not force:
        logger.info(
            "merge_chunks_alternative_exists",
            file_id=str(file_id),
            alternative=alternative,
        )
        return

    storage_folder_path_chunked = (
        file_db.storage_folder_path + "/" + (alternative or "original") + "_chunked"
    )

    # Download and sort chunks
    chunks, chunk_files = _download_and_sort_chunks(
        storage, file_db, alternative, storage_folder_path_chunked
    )
    if chunks is None:
        return

    # Merge chunks and upload
    _merge_and_upload_chunks(storage, file_db, alternative, chunks, chunk_files)

    logger.info(
        "merge_chunks_succeeded",
        file_id=str(file_id),
        alternative=alternative,
        chunk_count=len(chunks),
    )

    if alternative == "original":
        File.patch(
            obj_id=file_db.id,
            update_dict={"in_storage": True},
        )

        # launch fill_file_details tasks and returns it's id
        fill_file_details_task = TasksManager.create_task(
            title="Fill details",
            method_name="fill_file_details",
            args=[str(file_id)],
        )
        return {"task_id": fill_file_details_task.id}

    # Cleanup
    _cleanup_temporary_files(chunk_files)
