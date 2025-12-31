import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from libs.files.api import create_crud_file_router
from libs.utils.deps import get_deps
from libs.files.methods.deps import get_default_file_storage
from libs.files.storage.local import LocalStorage, LocalStorageConfig
from libs.files.models import StorageSettings
import tempfile
import shutil
import os

# Create app and client
app = FastAPI()
router = create_crud_file_router()
app.include_router(router)


@pytest.fixture
def client():
    return TestClient(app)


from libs.db import context_db


@pytest.fixture
def mock_storage():
    temp_dir = tempfile.mkdtemp()
    storage_settings = StorageSettings(
        id=uuid.uuid4(), name="Test Storage", kind="local", config={"path": temp_dir}, active=True
    )

    # Save to DB
    with context_db() as db:
        db.add(storage_settings)
        db.commit()
        db.refresh(storage_settings)

    storage = LocalStorage(storage_settings=storage_settings)
    yield storage

    # Cleanup
    shutil.rmtree(temp_dir)
    # Remove from DB? (Tests usually run in transaction rollback or separate DB)


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


def test_get_upload_details(client, mock_storage, mock_user, mock_translator):
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


def test_create_empty_file(client, mock_storage, mock_user, mock_translator):
    app.dependency_overrides[get_default_file_storage] = lambda: mock_storage
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    response = client.post("/api/files/storage/create-empty-file")

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "data" in data["result"]
    assert data["result"]["data"]["inStorage"] is False

    app.dependency_overrides = {}


def test_upload_file(client, mock_storage, mock_user, mock_translator):
    app.dependency_overrides[get_default_file_storage] = lambda: mock_storage
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)

    # First create a file to get an ID
    response = client.post("/api/files/storage/create-empty-file")
    file_id = response.json()["result"]["data"]["id"]

    # Now upload
    response = client.put(
        f"/api/files/storage/upload/{file_id}/original", content=b"test content", headers={"Content-Type": "text/plain"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["result"]["uploaded"] is True

    # Verify in storage
    assert mock_storage.exists_in_storage(storage_folder_path=file_id, alternative="original")

    app.dependency_overrides = {}
