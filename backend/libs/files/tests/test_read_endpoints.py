import datetime
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
    mock_file_storage.return_value.config.path = "/tmp/storage"  # noqa: S108

    # Mock os.path.join to return a safe path or mock FileResponse
    # Since FileResponse checks for file existence, we might need to mock it or create a dummy file.
    # Or we can mock fastapi.responses.FileResponse

    # Mock FileResponse
    with patch("fastapi.responses.FileResponse") as mock_file_response:
        mock_file_response.return_value = MagicMock()

        response = client.get(f"/api/files/storage/read-from-local/{file_id}/original")

        assert response.status_code == 200
        mock_file_response.assert_called()


def test_storage_read_head_answered_locally_without_redirect(client, mock_file_cls):
    """HEAD must never be redirected to the GET-signed GCS URL (signature
    mismatch, 403) — it should be answered directly from our own metadata."""
    file_id = uuid.uuid4()
    alternative = MagicMock()
    alternative.storage_suffix = "default"
    alternative.size = 123456.0
    alternative.mime = "audio/mpeg"
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.extra_.alternative_formats = [alternative]
    mock_file_cls.by_id.return_value = mock_file

    response = client.head(f"/api/files/storage/read/{file_id}/default")

    assert response.status_code == 200
    assert response.headers["content-length"] == "123456"
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["accept-ranges"] == "bytes"


def test_storage_read_head_with_filename_suffix_answers_same_as_without(client, mock_file_cls):
    """The trailing {filename} segment is cosmetic (podcast apps/validators
    infer the media type from the URL path) — it must resolve to the exact
    same handler and metadata as the plain route."""
    file_id = uuid.uuid4()
    alternative = MagicMock()
    alternative.storage_suffix = "default"
    alternative.size = 123456.0
    alternative.mime = "audio/mpeg"
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.extra_.alternative_formats = [alternative]
    mock_file_cls.by_id.return_value = mock_file

    response = client.head(f"/api/files/storage/read/{file_id}/default/episode.mp3")

    assert response.status_code == 200
    assert response.headers["content-length"] == "123456"
    assert response.headers["content-type"] == "audio/mpeg"


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


def test_storage_read_head_sends_last_modified(client, mock_file_cls):
    """Lets a client revalidate rather than re-download. No ETag alongside it: GCS
    answers the GET with a content MD5 and we only store a SHA-256, so ours would
    contradict the next response."""
    file_id = uuid.uuid4()
    alternative = MagicMock()
    alternative.storage_suffix = "default"
    alternative.size = 123456.0
    alternative.mime = "audio/mpeg"
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.time_updated = datetime.datetime(2026, 7, 3, 9, 15, 35, tzinfo=datetime.UTC)
    mock_file.extra_.alternative_formats = [alternative]
    mock_file_cls.by_id.return_value = mock_file

    response = client.head(f"/api/files/storage/read/{file_id}/default")

    assert response.status_code == 200
    assert response.headers["last-modified"] == "Fri, 03 Jul 2026 09:15:35 GMT"
    assert "etag" not in response.headers


def test_storage_read_missing_alternative_falls_back_to_default(client, mock_file_cls):
    """A thumbnail that was never generated (files registered without a processor have
    only default/original) used to answer an <img> with a JSON error body at HTTP 200,
    which is what left album faces as broken tiles."""
    file_id = uuid.uuid4()
    mock_file = MagicMock()
    mock_file.id = file_id
    mock_file.extra_.alternative_formats = []
    mock_file_cls.by_id.return_value = mock_file

    response = client.get(f"/api/files/storage/read/{file_id}/thumbnail", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == f"/api/files/storage/read/{file_id}/default?download=False"
