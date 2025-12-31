import pytest
from unittest.mock import MagicMock
import uuid
from libs.files.api import create_crud_file_router
from fastapi import Request
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
):
    app = FastAPI()
    router = create_crud_file_router()
    app.include_router(router)
    return TestClient(app)


def test_get_upload_details_new_file(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator
):
    app = client.app

    from libs.utils.deps import get_deps
    from libs.files.methods.deps import get_default_file_storage

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    response = client.post(
        "/api/files/storage/get-upload-details",
        json={"fileName": "test.jpg", "contentType": "image/jpeg", "fileSize": 1024},
    )

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "data" in data["result"]
    # upload_url is in the file object returned in data
    # But wait, the endpoint returns SimpleResponse(data=file_db)
    # The file_db has upload_url.
    assert "uploadUrl" in data["result"]["data"]

    # Verify File.create was called
    assert mock_file_cls.create.called

    # Verify get_upload_url was called
    mock_file_storage.return_value.get_upload_url.assert_called()


def test_get_upload_details_existing_file(
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
    mock_file.in_storage = False
    mock_file.storage_id = uuid.uuid4()
    mock_file_cls.by_id.return_value = mock_file

    response = client.post(
        "/api/files/storage/get-upload-details", json={"fileName": "test.jpg", "fileId": str(file_id)}
    )

    assert response.status_code == 200
    assert mock_file_cls.patch.called


def test_get_upload_details_folder_creation(
    client,
    mock_file_storage,
    mock_file_cls,
    mock_folder_cls,
    mock_user,
    mock_session,
    mock_translator,
    mock_add_to_folder,
):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.files.methods.deps import get_default_file_storage

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    response = client.post(
        "/api/files/storage/get-upload-details", json={"fileName": "test.jpg", "folderPath": "/my/new/folder"}
    )

    assert response.status_code == 200
    # Verify folder creation logic
    # Root folder "my"
    # Sub folder "new"
    # Sub folder "folder"
    assert mock_folder_cls.create.call_count >= 1
    assert mock_add_to_folder.called


def test_get_upload_details_invalid_folder_path(client, mock_user, mock_session, mock_translator, mock_file_storage):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.files.methods.deps import get_default_file_storage

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    response = client.post(
        "/api/files/storage/get-upload-details",
        json={
            "fileName": "test.jpg",
            "folderPath": "invalid/path",  # No leading slash
        },
    )

    assert response.status_code == 200  # It returns 200 with error in body usually in this API design
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "invalid_folder_path"
