import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.files.models import File


@pytest.fixture
def files_context():
    from libs.files.api import create_crud_file_router
    from libs.files.methods.deps import get_default_file_storage
    from libs.utils.deps import get_deps

    return {
        "create_crud_file_router": create_crud_file_router,
        "get_deps": get_deps,
        "get_default_file_storage": get_default_file_storage,
    }


@pytest.fixture
def app(files_context):
    app = FastAPI()
    router = files_context["create_crud_file_router"]()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def mock_file_storage():
    with patch("libs.files.api.get_file_storage") as mock_get_storage:
        mock_storage_instance = MagicMock()
        mock_get_storage.return_value = mock_storage_instance
        yield mock_get_storage


@pytest.fixture
def mock_file_cls():
    with patch("libs.files.api.File") as mock_file:
        yield mock_file


@pytest.fixture
def mock_folder_cls():
    with patch("libs.files.api.Folder") as mock_folder:
        yield mock_folder


@pytest.fixture
def mock_tasks_manager():
    with patch("libs.files.api.TasksManager") as mock_tm_cls:
        mock_tm_cls.create_task.return_value = MagicMock(id=uuid.uuid4())
        yield mock_tm_cls


@pytest.fixture
def mock_context_db():
    with patch("libs.files.api.context_db") as mock_db:
        # Mock the context manager behavior
        mock_session = MagicMock()
        mock_db.return_value.__enter__.return_value = mock_session
        yield mock_db


@pytest.fixture
def mock_add_to_folder():
    with patch("libs.files.api.add_to_folder") as mock:
        yield mock


@pytest.fixture
def mock_create_default_acls():
    with patch("libs.files.api.create_default_acls") as mock:
        yield mock


@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    return user


@pytest.fixture
def mock_translator():
    translator = MagicMock()
    translator.translate.side_effect = lambda x: x
    return translator


@pytest.fixture
def mock_sync_launch():
    with patch("libs.files.api.sync_launch_tasks_processing") as mock:
        yield mock


@pytest.fixture
def setup_overrides(app, files_context, mock_user, mock_translator, mock_file_storage):
    get_deps = files_context["get_deps"]
    get_default_file_storage = files_context["get_default_file_storage"]

    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value
    yield
    app.dependency_overrides = {}


def test_get_chunk_upload_url(
    client, app, mock_file_storage, mock_file_cls, setup_overrides, files_context
):
    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file_cls.by_id.return_value = mock_file

    # Configure storage mock
    storage_mock = mock_file_storage.return_value
    storage_mock.get_upload_url.return_value = "http://upload-url/chunk"

    # Test get_chunk_upload_url
    response = client.get(f"/api/files/storage/get-chunk-upload-url/{file_id}/original/0/100")

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "uploadUrl" in data["result"]
    assert data["result"]["uploadUrl"] == "http://upload-url/chunk"


def test_recover_from_chunks_no_chunks(
    client, app, mock_file_storage, mock_file_cls, setup_overrides, files_context
):
    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file_cls.by_id.return_value = mock_file

    storage_mock = mock_file_storage.return_value
    storage_mock.get_files_in_folder.return_value = []

    # Test recover_from_chunks (should fail as no chunks exist)
    response = client.get(f"/api/files/storage/recover-from-chunks/{file_id}/original")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "no_chunks_found"


def test_update_after_upload_file_not_found(
    client, app, mock_file_cls, setup_overrides, files_context, mock_sync_launch
):
    mock_file_cls.by_id.return_value = None

    fake_id = uuid.uuid4()
    try:
        response = client.post("/api/files/storage/update-after-upload", json={"fileId": str(fake_id), "duration": 120.5})
    except Exception as e:
        # Debugging purposes
        print(e)
        raise e

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "file_not_found"


def test_update_after_upload_not_in_storage(
    client, app, mock_file_storage, mock_file_cls, setup_overrides, files_context, mock_sync_launch
):
    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    # To simulate "not in storage", we rely on storage.exists_in_storage or similar logic.
    # The endpoint calls `storage.get_original_alternative` -> returns None -> "File not found in storage"
    mock_file_cls.by_id.return_value = mock_file

    storage_mock = mock_file_storage.return_value
    storage_mock.get_original_alternative.return_value = None

    response = client.post("/api/files/storage/update-after-upload", json={"fileId": str(file_id), "duration": 120.5})

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "file_not_found_in_storage"


def test_get_upload_details_invalid_folder(
    client, app, setup_overrides, files_context
):
    # Test invalid folder path (no leading slash)
    response = client.post(
        "/api/files/storage/get-upload-details", json={"fileName": "test.txt", "folderPath": "invalid/path"}
    )
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "invalid_folder_path"

    # Test invalid folder path (trailing slash)
    response = client.post(
        "/api/files/storage/get-upload-details", json={"fileName": "test.txt", "folderPath": "/invalid/path/"}
    )
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "invalid_folder_path"


def test_get_upload_details_create_folders(
    client, app, mock_folder_cls, mock_file_cls, setup_overrides, files_context,
    mock_context_db, mock_add_to_folder, mock_create_default_acls
):
    root_folder = MagicMock()
    root_folder.id = uuid.uuid4()
    sub_folder = MagicMock()
    sub_folder.id = uuid.uuid4()

    mock_folder_cls.create.side_effect = [root_folder, sub_folder]

    # Assume folders don't exist
    mock_folder_cls.get_first_by.return_value = None

    # Configure mock file creation
    mock_file_instance = File(
        id=uuid.uuid4(),
        storage_id=uuid.uuid4(),
        storage_folder_path="root/sub/test.txt",
        public_filename="test.txt",
        original_filename="test.txt",
        extension_client=".txt",
        mime_client="text/plain",
        in_storage=False,
    )
    mock_file_cls.create.return_value = mock_file_instance

    response = client.post(
        "/api/files/storage/get-upload-details", json={"fileName": "test.txt", "folderPath": "/root/sub"}
    )

    assert response.status_code == 200
    assert response.json()["error"] is None, f"Response contains error: {response.json()}"

    assert mock_folder_cls.create.call_count == 2

    # Verify calls
    calls = mock_folder_cls.create.call_args_list
    assert calls[0][1]["obj_dict"]["name"] == "root"
    assert calls[1][1]["obj_dict"]["name"] == "sub"
    assert calls[1][1]["obj_dict"]["parent_id"] == root_folder.id


def test_upload_file_chunked(
    client, app, mock_file_storage, mock_file_cls, setup_overrides, files_context
):
    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.in_storage = False
    mock_file_cls.by_id.return_value = mock_file

    storage_mock = mock_file_storage.return_value
    # Simulate not exists yet to allow upload
    storage_mock.exists_in_storage.return_value = False
    storage_mock.upload.return_value = True

    chunk_content = b"chunk data"
    headers = {"Content-Range": "bytes 0-9/20", "Content-Type": "application/octet-stream"}

    response = client.put(
        f"/api/files/storage/upload/{file_id}/original_chunked/chunk-0-9", content=chunk_content, headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["result"]["uploaded"] is True

    # Verify storage.upload was called
    storage_mock.upload.assert_called_once()


def test_update_after_upload_success(
    client, app, mock_file_storage, mock_file_cls, mock_tasks_manager, setup_overrides, files_context,
    mock_sync_launch
):
    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.extension_client = ".jpg"
    mock_file_cls.by_id.return_value = mock_file
    mock_file_cls.patch.return_value = mock_file

    storage_mock = mock_file_storage.return_value
    storage_mock.get_original_alternative.return_value = "original"
    storage_mock.get_size.return_value = 1024

    mock_task = MagicMock()
    mock_task.id = uuid.uuid4()
    mock_tasks_manager.create_task.return_value = mock_task

    response = client.post("/api/files/storage/update-after-upload", json={"fileId": str(file_id), "duration": 120.5})

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert data["result"]["taskId"] == str(mock_task.id)
