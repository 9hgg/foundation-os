import uuid
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.files.api import create_crud_file_router
from libs.files.models import File


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


def test_update_all_unauthorized_no_user(client, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.users.methods import get_current_user_optional

    app.dependency_overrides[get_current_user_optional] = lambda: None

    response = client.get("/api/files/storage/update-all")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["title"] == "Not identified"


def test_update_all_unauthorized_wrong_email(client, mock_user, mock_session, mock_translator):
    app = client.app
    from libs.users.methods import get_current_user_optional

    mock_user.email = "other@example.com"
    app.dependency_overrides[get_current_user_optional] = lambda: mock_user

    response = client.get("/api/files/storage/update-all")

    assert response.status_code == 200
    data = response.json()
    assert "error" in data
    assert data["error"]["title"] == "Not allowed"


def test_update_all_success(
    client,
    mock_file_storage,
    mock_file_cls,
    mock_tasks_manager,
    mock_user,
    mock_session,
    mock_translator,
    mock_context_db,
):
    app = client.app
    from libs.files.methods.deps import get_default_file_storage
    from libs.users.methods import get_current_user_optional

    mock_user.email = "joris@example.com"
    app.dependency_overrides[get_current_user_optional] = lambda: mock_user
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    # Mock DB query result
    file_id = uuid.uuid4()
    mock_file = MagicMock(spec=File)
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"

    # Setup the mock chain for db.query(File).all()
    mock_db = mock_context_db.return_value.__enter__.return_value
    # Ensure query returns the list when called
    mock_db.query.return_value.all.return_value = [mock_file]

    mock_file_storage.return_value.get_original_alternative.return_value = "original"
    mock_file_storage.return_value.get_size.return_value = 1024

    response = client.get("/api/files/storage/update-all")

    assert response.status_code == 200

    # Verify tasks created
    mock_tasks_manager.create_task.assert_called()

    # Verify file patched
    mock_file_cls.patch.assert_called()


def test_update_all_unprocessable(
    client, mock_file_storage, mock_file_cls, mock_user, mock_session, mock_translator, mock_context_db
):
    app = client.app
    from libs.files.methods.deps import get_default_file_storage
    from libs.users.methods import get_current_user_optional

    mock_user.email = "joris@example.com"
    app.dependency_overrides[get_current_user_optional] = lambda: mock_user
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    # Mock DB query result
    file_id = uuid.uuid4()
    mock_file = MagicMock(spec=File)
    mock_file.id = file_id
    mock_file.storage_id = uuid.uuid4()
    mock_file.storage_folder_path = "path/to/file"

    mock_db = mock_context_db.return_value.__enter__.return_value
    mock_db.query.return_value.all.return_value = [mock_file]

    # Simulate no original file found
    mock_file_storage.return_value.get_original_alternative.return_value = None

    response = client.get("/api/files/storage/update-all")

    assert response.status_code == 200

    # Verify file patched as unprocessable
    mock_file_cls.patch.assert_called_with(obj_id=file_id, update_dict={"unprocessable": True})
