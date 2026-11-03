import uuid
from unittest.mock import ANY, MagicMock, patch

import pytest


@pytest.fixture
def files_modules():
    from libs.files.models import ExtraDetailsFile, File, FileAlternative
    from libs.files.storage._generic import GenericStorage
    from libs.files.tasks import fill_file_details, fill_file_hash, generate_file_alternatives, merge_chunks
    return {
        "fill_file_details": fill_file_details,
        "fill_file_hash": fill_file_hash,
        "generate_file_alternatives": generate_file_alternatives,
        "merge_chunks": merge_chunks,
        "File": File,
        "ExtraDetailsFile": ExtraDetailsFile,
        "FileAlternative": FileAlternative,
        "GenericStorage": GenericStorage,
    }


@pytest.fixture
def mock_file_db(files_modules):
    File = files_modules["File"]
    ExtraDetailsFile = files_modules["ExtraDetailsFile"]

    file_db = MagicMock(spec=File)
    file_db.id = uuid.uuid4()
    file_db.storage_id = "local"
    file_db.storage_folder_path = "/tmp/storage/files/123"  # noqa: S108 - mocked storage path
    file_db.original_filename = "test.jpg"
    file_db.mime_client = "image/jpeg"
    file_db.extension_client = ".jpg"
    file_db.kind = "image"
    file_db.kind = "image"
    file_db.hash = None
    file_db.extra = ExtraDetailsFile()
    file_db.extra_ = ExtraDetailsFile()
    return file_db


@pytest.fixture
def mock_storage(files_modules):
    GenericStorage = files_modules["GenericStorage"]
    storage = MagicMock(spec=GenericStorage)
    storage.storage_type = "local"
    return storage


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.get_file_storage")
@patch("libs.files.tasks.magika")
@patch("libs.files.tasks.TasksManager")
@patch("libs.files.tasks.compute_and_persist_file_hash", return_value="content-hash")
def test_fill_file_details_success(
    mock_persist_hash,
    mock_tm,
    mock_magika,
    mock_get_storage,
    mock_file,
    mock_file_db,
    mock_storage,
    files_modules,
):
    fill_file_details = files_modules["fill_file_details"]

    mock_file.by_id.return_value = mock_file_db
    mock_get_storage.return_value = mock_storage

    # Mock storage behavior
    mock_storage.get_original_alternative.return_value = "original"
    mock_storage.get_first_bytes.return_value = b"\xff\xd8\xff"  # JPEG magic bytes

    # Mock Magika
    mock_magika_output = MagicMock()
    mock_magika_output.mime_type = "image/jpeg"
    mock_magika_output.group = "image"
    mock_magika.identify_bytes.return_value.output = mock_magika_output

    # Run task
    fill_file_details(mock_file_db.id)

    # Verify File.patch called
    assert mock_file.patch.called
    mock_persist_hash.assert_called_once_with(mock_file_db, force=False)

    # Verify next task created
    mock_tm.create_task.assert_called_with(
        title="Generate alternatives",
        method_name="generate_file_alternatives",
        description=ANY,
        args=[mock_file_db.id],
        kwargs={"force": False},
    )


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.get_file_storage")
def test_fill_file_details_no_file(mock_get_storage, mock_file, files_modules):
    fill_file_details = files_modules["fill_file_details"]

    mock_file.by_id.return_value = None
    fill_file_details(uuid.uuid4())
    mock_get_storage.assert_not_called()


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.PROCESSOR_MAPPING")
@patch("libs.files.tasks.compute_and_persist_file_hash", return_value="content-hash")
def test_generate_file_alternatives_success(
    mock_persist_hash, mock_mapping, mock_file, mock_file_db, files_modules
):
    generate_file_alternatives = files_modules["generate_file_alternatives"]
    FileAlternative = files_modules["FileAlternative"]
    ExtraDetailsFile = files_modules["ExtraDetailsFile"]

    mock_file.by_id.return_value = mock_file_db

    # Mock processor
    mock_processor_class = MagicMock()
    mock_processor = MagicMock()
    mock_processor_class.return_value = mock_processor
    mock_mapping.__getitem__.return_value = mock_processor_class
    mock_mapping.__contains__.return_value = True

    # Mock processor output
    mock_alt = MagicMock(spec=FileAlternative)
    mock_alt.storage_suffix = "thumb"
    mock_processor.generate_alternatives.return_value = [mock_alt]
    mock_processor.generate_extra_data.return_value = ExtraDetailsFile()

    generate_file_alternatives(mock_file_db.id)

    # Verify processor calls
    mock_processor.generate_alternatives.assert_called_once()
    mock_processor.generate_extra_data.assert_called_once()
    mock_processor.clear_local_file.assert_called_once()
    mock_persist_hash.assert_called_once_with(mock_file_db, force=False)

    # Verify File.patch called to update extra (the hash is persisted separately)
    mock_file.patch.assert_called_once()
    assert "hash" not in mock_file.patch.call_args.kwargs["update_dict"]["extra"]


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.PROCESSOR_MAPPING", {})
@patch("libs.files.tasks.compute_and_persist_file_hash", return_value="sidecar-hash")
def test_generate_file_alternatives_hashes_files_without_processor(
    mock_persist_hash, mock_file, mock_file_db, files_modules
):
    generate_file_alternatives = files_modules["generate_file_alternatives"]
    mock_file_db.kind = "unknown"
    mock_file.by_id.return_value = mock_file_db

    generate_file_alternatives(mock_file_db.id)

    mock_persist_hash.assert_called_once_with(mock_file_db, force=False)


@patch("libs.files.tasks.File")
@patch("libs.files.methods.basic.get_file_storage")
def test_fill_file_hash_persists_sha256_for_sidecar(
    mock_get_storage, mock_file, mock_file_db, files_modules, tmp_path
):
    fill_file_hash = files_modules["fill_file_hash"]
    sidecar_content = b'{"metadata": true}'
    temporary_path = tmp_path / "download.json"
    storage = MagicMock()
    storage.get_original_alternative.return_value = "original"

    def download(**_kwargs):
        temporary_path.write_bytes(sidecar_content)
        return str(temporary_path)

    storage.download.side_effect = download
    mock_get_storage.return_value = storage
    mock_file_db.kind = "text"
    mock_file_db.extension = ".json"
    mock_file_db.hash = None
    mock_file_db.extra = files_modules["ExtraDetailsFile"]()
    mock_file_db.extra_ = files_modules["ExtraDetailsFile"]()
    mock_file.by_id.return_value = mock_file_db

    with (
        patch(
            "libs.files.methods.basic.GenericStorage.get_temporary_local_path",
            return_value=str(temporary_path),
        ),
        patch("libs.files.methods.basic._persist_hash_metadata") as mock_persist_metadata,
    ):
        digest = fill_file_hash(mock_file_db.id)

    assert digest == "330227858c0e53142a51de081bd8e9f9b554e5097a9871145c3bcc341f707959"
    assert not temporary_path.exists()
    mock_persist_metadata.assert_called_once_with(mock_file_db.id, digest)


@patch("libs.files.methods.basic.File")
@patch("libs.files.methods.basic.context_db")
def test_hash_persistence_merges_with_fresh_locked_metadata(mock_context_db, mock_file):
    from libs.files.methods.basic import _persist_hash_metadata

    file_id = uuid.uuid4()
    fresh_file = MagicMock()
    db = mock_context_db.return_value.__enter__.return_value
    locked_query = db.query.return_value.filter.return_value.with_for_update.return_value
    locked_query.first.return_value = fresh_file

    _persist_hash_metadata(file_id, "new-hash")

    update = mock_file.patch.call_args.kwargs
    assert update["obj_id"] == file_id
    assert update["_db"] is db
    assert update["update_dict"] == {"hash": "new-hash"}
    locked_query.first.assert_called_once_with()


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.get_file_storage")
def test_fill_file_hash_skips_existing_hash(
    mock_get_storage, mock_file, mock_file_db, files_modules
):
    fill_file_hash = files_modules["fill_file_hash"]
    mock_file_db.hash = "existing"
    mock_file.by_id.return_value = mock_file_db

    assert fill_file_hash(mock_file_db.id) == "existing"

    mock_get_storage.assert_not_called()
    mock_file.patch.assert_not_called()


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.get_file_storage")
@patch("libs.files.tasks.GenericStorage")
@patch("libs.files.tasks.TasksManager")
@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.getsize")
@patch("os.remove")
def test_merge_chunks_success(
    mock_remove,
    mock_getsize,
    mock_open,
    mock_tm,
    mock_generic_storage,
    mock_get_storage,
    mock_file,
    mock_file_db,
    mock_storage,
    files_modules
):
    merge_chunks = files_modules["merge_chunks"]

    mock_file.by_id.return_value = mock_file_db
    mock_get_storage.return_value = mock_storage

    # Mock storage behavior
    mock_storage.exists_in_storage.return_value = False
    mock_storage.get_files_in_folder.return_value = ["chunk-0-10", "chunk-11-20"]
    mock_storage.download.return_value = "/tmp/chunk"  # noqa: S108 - mocked chunk path

    # Mock file operations
    mock_getsize.return_value = 10

    merge_chunks(mock_file_db.id, "original")

    # Verify download called for chunks
    assert mock_storage.download.call_count == 2

    # Verify upload called
    mock_storage.upload.assert_called_once()

    # Verify File.patch called (in_storage=True)
    mock_file.patch.assert_called_with(obj_id=mock_file_db.id, update_dict={"in_storage": True})

    # Verify next task created
    mock_tm.create_task.assert_called_with(
        title="Fill details", method_name="fill_file_details", args=[str(mock_file_db.id)]
    )


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.get_file_storage")
def test_merge_chunks_already_exists(mock_get_storage, mock_file, mock_file_db, mock_storage, files_modules):
    merge_chunks = files_modules["merge_chunks"]

    mock_file.by_id.return_value = mock_file_db
    mock_get_storage.return_value = mock_storage
    mock_storage.exists_in_storage.return_value = True

    merge_chunks(mock_file_db.id, "original")

    # Should return early
    mock_storage.get_files_in_folder.assert_not_called()


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.get_file_storage")
@patch("libs.files.tasks.GenericStorage")
@patch("libs.files.tasks.TasksManager")
@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.getsize")
@patch("os.remove")
def test_merge_chunks_survives_a_null_extension(
    mock_remove,
    mock_getsize,
    mock_open,
    mock_tm,
    mock_generic_storage,
    mock_get_storage,
    mock_file,
    mock_file_db,
    mock_storage,
    files_modules,
):
    """`extension` is filled by fill_file_details, which runs after this, so it is null here. A
    client extension that is not webm stops the short-circuit and reaches it."""
    merge_chunks = files_modules["merge_chunks"]

    mock_file.by_id.return_value = mock_file_db
    mock_get_storage.return_value = mock_storage
    mock_file_db.extension_client = ".mp4"
    mock_file_db.extension = None

    mock_storage.exists_in_storage.return_value = False
    mock_storage.get_files_in_folder.return_value = ["chunk-0-10", "chunk-11-20"]
    mock_storage.download.return_value = "/tmp/chunk"  # noqa: S108 - mocked chunk path
    mock_getsize.return_value = 10

    merge_chunks(mock_file_db.id, "original")

    mock_storage.upload.assert_called_once()
    mock_file.patch.assert_called_with(obj_id=mock_file_db.id, update_dict={"in_storage": True})


@patch("libs.files.tasks.File")
@patch("libs.files.tasks.get_file_storage")
@patch("libs.files.tasks.magika")
@patch("libs.files.tasks.TasksManager")
@patch("libs.files.tasks.compute_and_persist_file_hash", return_value="content-hash")
def test_fill_file_details_sizes_a_file_the_client_never_finished(
    mock_hash, mock_tm, mock_magika, mock_get_storage, mock_file, mock_file_db, mock_storage, files_modules
):
    """`update_after_upload` is the only other writer of `size`, and a client that never made that
    call left the row sizeless however healthy the bytes in storage were."""
    fill_file_details = files_modules["fill_file_details"]

    mock_file.by_id.return_value = mock_file_db
    mock_get_storage.return_value = mock_storage
    mock_file_db.size = None
    mock_storage.get_size.return_value = 4321
    mock_storage.get_original_alternative.return_value = "original"
    mock_storage.get_first_bytes.return_value = b"\xff\xd8\xff\xe0" + b"0" * 60

    fill_file_details(mock_file_db.id)

    assert any(
        call.kwargs.get("update_dict", {}).get("size") == 4321.0
        for call in mock_file.patch.call_args_list
    ), f"size never written; patches were {[c.kwargs.get('update_dict') for c in mock_file.patch.call_args_list]}"
