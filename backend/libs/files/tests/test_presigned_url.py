import uuid
from unittest.mock import MagicMock

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


def test_get_presigned_url_success(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator
):
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

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


def test_get_presigned_url_file_not_found(client, mock_file_cls, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_file_cls.by_id.return_value = None

    response = client.get(f"/api/files/storage/read/{uuid.uuid4()}/original")

    # The endpoint returns None if presigned_url_details is None, which results in null in JSON
    assert response.status_code == 200
    data = response.json()
    assert data["result"] is None


def test_get_presigned_url_not_in_storage(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator
):
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

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


def test_get_presigned_url_original_is_cached_and_sized_like_any_other_suffix(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator
):
    """No special case here: "original" is cached and sized from storage exactly like any other
    suffix. Whether it should count in a total is a billing question, answered once in
    compute_file_size, not here."""
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

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
    mock_file_storage.return_value.get_size.return_value = 999_999

    response = client.get(f"/api/files/storage/read/{file_id}/original", follow_redirects=False)

    assert response.status_code == 307
    mock_file.patch.assert_called_once()
    cached = mock_file.extra_.alternative_formats[-1]
    assert cached.storage_suffix == "original"
    assert cached.size == 999_999
    assert cached.presigned_url == "http://presigned-url"
    mock_file_storage.return_value.get_size.assert_called_once_with(
        storage_folder_path="path/to/file", alternative="original"
    )


def test_get_presigned_url_other_suffixes_are_sized_from_storage(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator
):
    """A real alternative discovered in storage before our own pipeline registered it gets its
    actual size from the storage provider -- these bytes were never processed by us, so nothing
    else knows how big they are, and leaving it unset would make them invisible to billing."""
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.extra_.alternative_formats = []
    mock_file.mime = "audio/mpeg"
    mock_file.kind = "audio"
    mock_file.extension = ".mp3"
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.exists_in_storage.return_value = True
    mock_file_storage.return_value.get_download_url.return_value = ("http://presigned-url", 3600)
    mock_file_storage.return_value.get_size.return_value = 123_456

    response = client.get(f"/api/files/storage/read/{file_id}/compressed", follow_redirects=False)

    assert response.status_code == 307
    mock_file.patch.assert_called_once()
    assert mock_file.extra_.alternative_formats[-1].size == 123_456
    mock_file_storage.return_value.get_size.assert_called_once_with(
        storage_folder_path="path/to/file", alternative="compressed"
    )


def test_get_presigned_url_other_suffix_size_falls_back_to_none_when_storage_reports_zero(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator
):
    """get_size() returns 0 both when the query fails and when the blob genuinely holds no
    bytes -- either way it means "unknown", not "empty", so it must not be billed as a real
    zero-sized alternative sitting silently in the ledger."""
    app = client.app
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"
    mock_file.extra_.alternative_formats = []
    mock_file.mime = "audio/mpeg"
    mock_file.kind = "audio"
    mock_file.extension = ".mp3"
    mock_file_cls.by_id.return_value = mock_file

    mock_file_storage.return_value.exists_in_storage.return_value = True
    mock_file_storage.return_value.get_download_url.return_value = ("http://presigned-url", 3600)
    mock_file_storage.return_value.get_size.return_value = 0

    response = client.get(f"/api/files/storage/read/{file_id}/compressed", follow_redirects=False)

    assert response.status_code == 307
    assert mock_file.extra_.alternative_formats[-1].size is None
