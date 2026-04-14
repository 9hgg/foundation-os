import shutil
import tempfile
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.files.api import create_crud_file_router
from libs.files.methods.deps import get_default_file_storage
from libs.files.models import File, StorageSettings
from libs.files.storage.local import LocalStorage
from libs.utils.deps import get_deps

# Create app and client
app = FastAPI()
router = create_crud_file_router()
app.include_router(router)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_storage():
    temp_dir = tempfile.mkdtemp()
    storage_settings = StorageSettings(
        id=uuid.uuid4(), name="Test Storage", kind="local", config={"path": temp_dir}, active=True
    )

    storage = LocalStorage(storage_settings=storage_settings)
    yield storage

    # Cleanup
    shutil.rmtree(temp_dir)


@pytest.fixture
def mock_file_db():
    stored_files: dict[str, File] = {}

    def create(*, obj_dict=None, obj=None, _db=None):
        file_obj = obj or File(**obj_dict)
        stored_files[str(file_obj.id)] = file_obj
        return file_obj

    def by_id(file_id, _db=None):
        return stored_files.get(str(file_id))

    def patch_file(*, obj_id, update_dict, _db=None):
        file_obj = stored_files[str(obj_id)]
        for key, value in update_dict.items():
            setattr(file_obj, key, value)
        stored_files[str(obj_id)] = file_obj
        return file_obj

    with (
        patch("libs.files.api.File.create", side_effect=create),
        patch("libs.files.api.File.by_id", side_effect=by_id),
        patch("libs.files.api.File.patch", side_effect=patch_file),
        patch("libs.files.api.create_default_acls"),
        patch("libs.files.api.context_db") as mock_context_db,
    ):
        mock_context_db.return_value.__enter__.return_value = MagicMock()
        yield stored_files


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


def test_get_upload_details(client, mock_storage, mock_user, mock_translator, mock_file_db):
    # Override dependencies
    app.dependency_overrides[get_default_file_storage] = lambda: mock_storage
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    response = client.post(
        "/api/files/storage/get-upload-details",
        json={"fileName": "test.txt", "contentType": "text/plain", "fileSize": 100, "alternative": "original"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "data" in data["result"]
    assert "uploadUrl" in data["result"]["data"]
    assert "id" in data["result"]["data"]

    # Clean up overrides
    app.dependency_overrides = {}


def test_create_empty_file(client, mock_storage, mock_user, mock_translator, mock_file_db):
    app.dependency_overrides[get_default_file_storage] = lambda: mock_storage
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    response = client.post("/api/files/storage/create-empty-file")

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "data" in data["result"]
    assert data["result"]["data"]["inStorage"] is False

    app.dependency_overrides = {}


def test_upload_file(client, mock_storage, mock_user, mock_translator, mock_file_db):
    app.dependency_overrides[get_default_file_storage] = lambda: mock_storage
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    # First create a file to get an ID
    response = client.post("/api/files/storage/create-empty-file")
    file_id = response.json()["result"]["data"]["id"]

    # Now upload
    with patch("libs.files.api.get_file_storage", return_value=mock_storage):
        response = client.put(
            f"/api/files/storage/upload/{file_id}/original", content=b"test content", headers={"Content-Type": "text/plain"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["result"]["uploaded"] is True

    # Verify in storage
    assert mock_storage.exists_in_storage(storage_folder_path=file_id, alternative="original")

    app.dependency_overrides = {}
