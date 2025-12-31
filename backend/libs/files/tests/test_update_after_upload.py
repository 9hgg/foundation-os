import pytest
from unittest.mock import MagicMock
import uuid
from libs.files.api import create_crud_file_router
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client(
    mock_file_storage,
    mock_file_cls,
    mock_folder_cls,
    mock_tasks_manager,
    mock_context_db,
    mock_create_default_acls,
    mock_add_to_folder,
    mock_sync_launch_tasks_processing,
):
    app = FastAPI()
    router = create_crud_file_router()
    app.include_router(router)
    return TestClient(app)


def test_update_after_upload_success(
    client, mock_file_storage, mock_file_cls, mock_tasks_manager, mock_user, mock_session, mock_translator
):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.files.methods.deps import get_default_file_storage

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.extension_client = ".jpg"
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.get_original_alternative.return_value = "original"
    mock_file_storage.return_value.get_size.return_value = 2048

    response = client.post("/api/files/storage/update-after-upload", json={"fileId": str(file_id), "duration": 10.5})

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "file" in data["result"]
    assert "taskId" in data["result"]

    mock_file_cls.patch.assert_called()
    mock_tasks_manager.create_task.assert_called()


def test_update_after_upload_file_not_found(client, mock_file_cls, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_file_cls.by_id.return_value = None

    response = client.post("/api/files/storage/update-after-upload", json={"fileId": str(uuid.uuid4())})

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "file_not_found"


def test_update_after_upload_not_in_storage(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator
):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.files.methods.deps import get_default_file_storage

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.get_original_alternative.return_value = None

    response = client.post("/api/files/storage/update-after-upload", json={"fileId": str(file_id)})

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "file_not_found_in_storage"
