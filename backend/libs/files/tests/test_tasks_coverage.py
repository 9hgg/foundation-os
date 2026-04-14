import uuid
from unittest.mock import ANY, MagicMock, patch

import pytest


@pytest.fixture
def files_modules():
    from libs.files.models import ExtraDetailsFile, File, FileAlternative
    from libs.files.storage._generic import GenericStorage
    from libs.files.tasks import fill_file_details, generate_file_alternatives, merge_chunks
    return {
        "fill_file_details": fill_file_details,
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
    file_db.storage_folder_path = "/tmp/storage/files/123"
    file_db.original_filename = "test.jpg"
    file_db.mime_client = "image/jpeg"
    file_db.extension_client = ".jpg"
    file_db.kind = "image"
    file_db.kind = "image"
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
def test_fill_file_details_success(mock_tm, mock_magika, mock_get_storage, mock_file, mock_file_db, mock_storage, files_modules):
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
def test_generate_file_alternatives_success(mock_mapping, mock_file, mock_file_db, files_modules):
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

    # Verify File.patch called to update extra
    mock_file.patch.assert_called_once()


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
    mock_storage.download.return_value = "/tmp/chunk"

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
