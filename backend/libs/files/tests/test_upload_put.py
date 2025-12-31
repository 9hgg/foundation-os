import pytest
from unittest.mock import MagicMock, patch
import uuid
import os
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


def test_upload_file_success(client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator):
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
    mock_file.in_storage = False
    mock_file.mime_client = None
    mock_file_cls.by_id.return_value = mock_file

    # Mock open to avoid writing to disk
    with patch("builtins.open", new_callable=MagicMock) as mock_open:
        mock_file_handle = MagicMock()
        mock_open.return_value.__enter__.return_value = mock_file_handle

        # Mock os.remove
        with patch("os.remove") as mock_remove:
            response = client.put(
                f"/api/files/storage/upload/{file_id}/original",
                content=b"test content",
                headers={"Content-Type": "text/plain"},
            )

            assert response.status_code == 200
            data = response.json()
            assert "result" in data
            assert data["result"]["uploaded"] is True

            mock_file_storage.return_value.upload.assert_called()
            mock_file_cls.patch.assert_called()
            mock_remove.assert_called()


def test_upload_file_already_in_storage(
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
    mock_file.in_storage = True  # Already in storage by DB
    mock_file_cls.by_id.return_value = mock_file

    response = client.put(f"/api/files/storage/upload/{file_id}/original", content=b"test content")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "file_already_in_storage"


def test_upload_file_already_in_storage_check(
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
    mock_file.in_storage = False
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.exists_in_storage.return_value = True  # Already in storage by Check

    response = client.put(f"/api/files/storage/upload/{file_id}/original", content=b"test content")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "file_already_in_storage"
