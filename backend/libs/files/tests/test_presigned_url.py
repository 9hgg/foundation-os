import pytest
from unittest.mock import MagicMock, AsyncMock
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


@pytest.fixture
def mock_cacher():
    cacher = MagicMock()
    cacher.get = AsyncMock(return_value=None)
    cacher.set = AsyncMock()
    cacher.time_to_live = AsyncMock(return_value=100)
    return cacher


def test_get_presigned_url_cache_miss_success(
    client, mock_file_storage, mock_file_cls, mock_cacher, mock_user, mock_session, mock_translator
):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.cache import get_cacher

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_cacher] = lambda: mock_cacher

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.extra_.alternative_formats = []
    mock_file.mime = "image/jpeg"
    mock_file.kind = "image"
    mock_file.extension = ".jpg"
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.exists_in_storage.return_value = True
    mock_file_storage.return_value.get_download_url.return_value = ("http://presigned-url", 3600)

    response = client.get(f"/api/files/storage/read/{file_id}/original", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "http://presigned-url"

    # Verify cache set
    mock_cacher.set.assert_called()


def test_get_presigned_url_cache_hit(client, mock_cacher, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.cache import get_cacher

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_cacher] = lambda: mock_cacher

    mock_cacher.get.return_value = ["http://cached-url", 3600]

    response = client.get(f"/api/files/storage/read/{uuid.uuid4()}/original", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "http://cached-url"

    # Verify cache set NOT called
    mock_cacher.set.assert_not_called()


def test_get_presigned_url_file_not_found(client, mock_file_cls, mock_cacher, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.cache import get_cacher

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_cacher] = lambda: mock_cacher

    mock_file_cls.by_id.return_value = None

    response = client.get(f"/api/files/storage/read/{uuid.uuid4()}/original")

    # The endpoint returns None if presigned_url_details is None, which results in null in JSON
    assert response.status_code == 200
    data = response.json()
    assert data["result"] is None


def test_get_presigned_url_not_in_storage(
    client, mock_file_storage, mock_file_cls, mock_cacher, mock_user, mock_session, mock_translator
):
    app = client.app
    from libs.utils.deps import get_deps
    from libs.cache import get_cacher

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_cacher] = lambda: mock_cacher

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.extra_.alternative_formats = []
    mock_file.mime = "image/jpeg"
    mock_file.kind = "image"
    mock_file.extension = ".jpg"
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.exists_in_storage.return_value = False

    response = client.get(f"/api/files/storage/read/{file_id}/original")

    assert response.status_code == 200
    data = response.json()
    assert data["result"] is None
