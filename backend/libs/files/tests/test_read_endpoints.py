import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.files.api import create_crud_file_router


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


def test_storage_read_file_details_by_id(client, mock_file_cls, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file_cls.by_id.return_value = mock_file

    response = client.get(f"/api/files/storage/read/{file_id}/details")

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "file" in data["result"]


def test_storage_read_file_details_by_id_not_found(client, mock_file_cls, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_file_cls.by_id.return_value = None

    response = client.get(f"/api/files/storage/read/{uuid.uuid4()}/details")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "file_not_found"


def test_read_from_local_success(client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.files.methods.deps import get_default_file_storage
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.public_filename = "test.jpg"
    mock_file.extension_client = ".jpg"
    mock_file.extension = None
    mock_file.extra_.alternative_formats = []
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.storage_type = "local"
    mock_file_storage.return_value.config.path = "/tmp/storage"

    # Mock os.path.join to return a safe path or mock FileResponse
    # Since FileResponse checks for file existence, we might need to mock it or create a dummy file.
    # Or we can mock fastapi.responses.FileResponse

    # Mock FileResponse
    with patch("fastapi.responses.FileResponse") as mock_file_response:
        mock_file_response.return_value = MagicMock()

        response = client.get(f"/api/files/storage/read-from-local/{file_id}/original")

        assert response.status_code == 200
        mock_file_response.assert_called()


def test_read_from_local_not_local(client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.files.methods.deps import get_default_file_storage
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.storage_type = "gcp"

    response = client.get(f"/api/files/storage/read-from-local/{file_id}/original")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "storage_not_local"
