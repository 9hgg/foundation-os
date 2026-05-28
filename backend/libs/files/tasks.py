import uuid

import ffmpegio
from magika import Magika

from libs.files.storage._generic import GenericStorage
from libs.logger import print, print_color, print_warning
from libs.tasks.tasks_manager import TasksManager
from libs.utils.methods import deep_update
from libs.utils.types import serialize

from .models import ExtraDetailsFile, File, FileAlternative
from .methods.simulation import infer_simulation_file_details
from .processors import PROCESSOR_MAPPING
from .processors.magic_bytes.ffprobe_parser import get_possible_type_via_ffprobe
from .processors.magic_bytes.parser import get_possible_types
from .storage import get_file_storage

magika = Magika()


def _set_task_progress(task, task_manager, progress: float) -> None:
    if task is None or task_manager is None:
        return
    task_manager.update_task(task.id, {"progress": progress})


@TasksManager.enlist_task()
def fill_file_details(file_id: uuid.UUID, force=False, **kwargs):
    """
    Fill the details of a file like:
    - mime
    - extension
    - etc...
    """
    task = kwargs.get("task")
    task_manager = kwargs.get("task_manager")

    _set_task_progress(task, task_manager, 5.0)
    file_db = File.by_id(obj_id=file_id)
    if file_db is None:
        print("File not found")
        return
    if file_db.storage_folder_path is None or file_db.storage_id is None:
        print("File has no storage folder path or storage id")
        return
    storage = get_file_storage(file_db.storage_id)

    _set_task_progress(task, task_manager, 20.0)
    original_alternative = storage.get_original_alternative(storage_folder_path=file_db.storage_folder_path)
    if original_alternative is None:
        print_warning("No original file to process (original | original-stream)")
        File.patch(
            obj_id=file_db.id,
            update_dict={"unprocessable": True},
        )
        return

    first_bytes = storage.get_first_bytes(
        storage_folder_path=file_db.storage_folder_path,
        alternative=original_alternative,
    )
    if first_bytes is None:
        print("File has no first bytes")
        return

    inferred_simulation_details = infer_simulation_file_details(
        extension_client=file_db.extension_client,
        extension=file_db.extension,
    )
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
        _set_task_progress(task, task_manager, 100.0)
        return {"task_id": generate_file_alternatives_task.id}

    _set_task_progress(task, task_manager, 40.0)
    # NAIVE dict of first bytes approach
    possible_types = get_possible_types(first_bytes=first_bytes)

    if len(possible_types) == 0:
        # nothing found -> using Magika
        print_warning(
            "No possible types from custom bytes parser",
            file_db.original_filename,
            file_db.mime_client,
            "|",
            file_db.extension_client,
            magika.identify_bytes(first_bytes).output.mime_type,
        )
        print("Using magika")
        magika_output = magika.identify_bytes(first_bytes).output
        magika_mime_type = magika_output.mime_type
        magika_group = magika_output.group
        print(file_db.original_filename, magika_mime_type, magika_group)

        File.patch(
            obj_id=file_db.id,
            update_dict={
                "mime": magika_mime_type,
                # "extension": "." + possible_types[0].extension,
                "kind": magika_group,
            },
        )
    else:
        _set_task_progress(task, task_manager, 60.0)
        print_color(
            "red",
            "Possible types",
            file_db.original_filename,
            file_db.mime_client,
            "|",
            file_db.extension_client,
            possible_types,
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
            print_warning(
                "Possible types from ffprobe:",
                possible_types_from_ffprobe,
            )
            if possible_types_from_ffprobe is not None:
                audio_or_video = possible_types_from_ffprobe.get("kind_from_ffmpeg")
                if audio_or_video is not None:
                    possible_types = [
                        possible_type for possible_type in possible_types if possible_type.type == audio_or_video
                    ]

        print(
            'Possible type for "' + (file_db.original_filename if file_db.original_filename else file_db.id.hex) + '":',
            possible_types,
        )

        if file_db.mime_client is not None:
            possible_types_filtered_by_mime_client = [
                possible_type
                for possible_type in possible_types
                if possible_type.mime == file_db.mime_client or possible_type.extension == file_db.extension_client
            ]
            print(
                "Possible types after filtering by client mime/extension:",
                possible_types_filtered_by_mime_client,
            )
            if len(possible_types_filtered_by_mime_client) > 0:
                possible_types = possible_types_filtered_by_mime_client

        if len(possible_types) == 0:
            print_warning(
                "No possible types from ffprobe",
                file_db.original_filename,
                file_db.mime_client,
                "|",
                file_db.extension_client,
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

    _set_task_progress(task, task_manager, 85.0)
    # # create the generate_file_alternatives task
    generate_file_alternatives_task = TasksManager.create_task(
        title="Generate alternatives",
        method_name="generate_file_alternatives",
        description="Generate file alternatives for "
        + (file_db.original_filename if file_db.original_filename else file_db.id.hex[:8]),
        args=[file_id],
        kwargs={
            "force": force,
        },
    )

    _set_task_progress(task, task_manager, 100.0)
    return {"task_id": generate_file_alternatives_task.id}


@TasksManager.enlist_task()
def generate_file_alternatives(file_id: uuid.UUID, force=False, **kwargs):
    task = kwargs.get("task")
    task_manager = kwargs.get("task_manager")

    _set_task_progress(task, task_manager, 5.0)
    file_db = File.by_id(obj_id=file_id)

    if file_db is None:
        print("File not found")
        return

    if file_db.kind is None:
        print("File has no mime")
        return

    if file_db.kind not in PROCESSOR_MAPPING:
        print("No processor found for kind:", file_db.mime)
        return

    if file_db.storage_folder_path is None:
        print("File has no storage folder path")
        return

    _set_task_progress(task, task_manager, 20.0)
    ProcessorClass = PROCESSOR_MAPPING[file_db.kind]
    processor = ProcessorClass(file_db=file_db)
    # print("Processor:", processor)

    _set_task_progress(task, task_manager, 45.0)
    new_alternatives = processor.generate_alternatives(force=force)
    # print("Alternatives:", new_alternatives)

    _set_task_progress(task, task_manager, 70.0)
    new_extra_data: ExtraDetailsFile = processor.generate_extra_data(force=force) or ExtraDetailsFile()
    # print("Extra data:", new_extra_data)

    # delete local copy of the original
    processor.clear_local_file()

    _set_task_progress(task, task_manager, 85.0)
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
    all_alternatives_as_list = [alternative for alternative in all_alternatives_as_list if alternative is not None]
    new_extra_data.alternative_formats = all_alternatives_as_list

    # new_config = deep_update(resource_db.config, update_dict.get("config", {}))
    new_extra_data_dict = deep_update(serialize(file_db.extra), serialize(new_extra_data))

    File.patch(
        obj_id=file_db.id,
        update_dict={
            "extra": new_extra_data_dict,
        },
    )

    _set_task_progress(task, task_manager, 100.0)


def _download_and_sort_chunks(
    storage: GenericStorage, file_db: File, alternative: str, storage_folder_path_chunked: str
):
    """Download chunks locally and sort them by range."""
    all_files = storage.get_files_in_folder(storage_folder_path=storage_folder_path_chunked)

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
                print_warning(f"Skipping file with invalid chunk format: {file_name}")
                continue

    if len(chunks) == 0:
        print("No valid chunk files found in folder:", storage_folder_path_chunked, storage.storage_type)
        return None, None

    # order by start byte (second part after splitting by "-")
    chunks.sort(key=lambda x: int(x.split("-")[1]))

    # warn if missing bytes between consecutive chunks
    for i in range(len(chunks) - 1):
        current_end = int(chunks[i].split("-")[2])
        next_start = int(chunks[i + 1].split("-")[1])
        if next_start - current_end > 1:
            print("Missing bytes between chunks:", chunks[i], "and", chunks[i + 1])

    # download each chunk locally
    chunk_files = {}
    for chunk in chunks:
        output_path = GenericStorage.get_temporary_local_path(prefix=chunk)
        local_path = storage.download(
            storage_folder_path=file_db.storage_folder_path + "/" + alternative + "_chunked",
            alternative=chunk,
            local_path=output_path,
            force=True,
        )
        chunk_files[chunk] = local_path

    return chunks, chunk_files


def _merge_and_upload_chunks(
    storage: GenericStorage, file_db: File, alternative: str, chunks: list[str], chunk_files: dict[str, str]
):
    """Merge chunks into a single file and upload to storage."""
    import os

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

            print(f"Merged chunk {i + 1}/{len(chunks)}: {chunk} (size: {chunk_size:,} bytes)")

    # Get the final merged file size
    merged_file_size = os.path.getsize(merged_path)

    print("Chunk merge summary:")
    print(f"  - Total chunks: {len(chunks)}")
    print(f"  - Sum of chunk sizes: {total_chunks_size:,} bytes")
    print(f"  - Final merged file size: {merged_file_size:,} bytes")
    print(f"  - Size difference: {merged_file_size - total_chunks_size:,} bytes")

    if merged_file_size != total_chunks_size:
        print_warning(f"Size mismatch! Expected {total_chunks_size:,} bytes, got {merged_file_size:,} bytes")

    file_path_to_upload = merged_path

    if "webm" in file_db.extension_client or "webm" in file_db.extension:
        # Output path
        output_path = merged_path + ".webm"
        print(f"Retranscoding webm file: {output_path}")

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

    print(f"Uploaded merged file to storage (size: {merged_file_size:,} bytes)")

    return merged_path


def _cleanup_temporary_files(chunk_files):
    """Clean up temporary files and optionally chunks folder."""
    import os

    # cleanup temporary files
    for chunk_file_path in chunk_files.values():
        try:
            os.remove(chunk_file_path)
        except Exception as e:
            print_warning(f"Failed to cleanup temporary files: {e}")
    print("Cleaned up temporary files")


@TasksManager.enlist_task()
def merge_chunks(file_id: uuid.UUID, alternative: str, force=False, **kwargs):
    file_db = File.by_id(file_id)
    if file_db is None:
        print("File not found")
        return

    storage = get_file_storage(file_db.storage_id)

    # if alternative already exists and not forced, skip merging
    alternative_exists = storage.exists_in_storage(
        storage_folder_path=file_db.storage_folder_path, alternative=alternative
    )
    if alternative_exists and not force:
        print("Alternative already exists and not forced:", alternative)
        return

    storage_folder_path_chunked = file_db.storage_folder_path + "/" + (alternative or "original") + "_chunked"

    # Download and sort chunks
    chunks, chunk_files = _download_and_sort_chunks(storage, file_db, alternative, storage_folder_path_chunked)
    if chunks is None:
        return

    # Merge chunks and upload
    _merge_and_upload_chunks(storage, file_db, alternative, chunks, chunk_files)

    print(f"Successfully merged {len(chunks)} chunks into alternative '{alternative}' for file {file_id}")

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
