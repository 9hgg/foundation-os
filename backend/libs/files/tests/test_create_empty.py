
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.acl.models import Who
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


def test_create_empty_file_with_user(
    client, mock_file_storage, mock_file_cls, mock_create_default_acls, mock_user, mock_session, mock_translator
):
    app = client.app
    from libs.files.methods.deps import get_default_file_storage
    from libs.utils.deps import get_deps

    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    response = client.post("/api/files/storage/create-empty-file")

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "data" in data["result"]

    mock_file_cls.create.assert_called()

    # Verify ACLs created for user and session
    assert mock_create_default_acls.call_count >= 1

    # Check if called for user
    user_call_found = False
    for call in mock_create_default_acls.call_args_list:
        if call.kwargs.get("who") == Who.user and call.kwargs.get("who_id") == mock_user.id:
            user_call_found = True
            break
    assert user_call_found


def test_create_empty_file_no_user(
    client, mock_file_storage, mock_file_cls, mock_create_default_acls, mock_session, mock_translator
):
    app = client.app
    from libs.files.methods.deps import get_default_file_storage
    from libs.utils.deps import get_deps

    # Mock user as None
    app.dependency_overrides[get_deps] = lambda: (None, mock_session, mock_translator)
    app.dependency_overrides[get_default_file_storage] = lambda: mock_file_storage.return_value

    response = client.post("/api/files/storage/create-empty-file")

    assert response.status_code == 200

    mock_file_cls.create.assert_called()

    # Verify ACLs created for session only
    session_call_found = False
    for call in mock_create_default_acls.call_args_list:
        if call.kwargs.get("who") == Who.session and call.kwargs.get("who_id") == mock_session.id:
            session_call_found = True
            break
    assert session_call_found
