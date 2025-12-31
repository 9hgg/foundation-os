import pytest
import uuid
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from libs.folders.api import create_crud_folder_router
from libs.folders.models import Folder
from libs.utils.deps import get_deps
from libs.acl.models import Who

app = FastAPI()
router = create_crud_folder_router()
app.include_router(router)


@pytest.fixture
def client():
    return TestClient(app)


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


@patch("libs.folders.api.cannot")
@patch("libs.folders.api.get_subfolders")
@patch("libs.folders.api.get_subfolders_and_resources")
@patch("libs.folders.api.context_db")
def test_get_folder_subfolders(mock_ctx, mock_get_res, mock_get_sub, mock_cannot, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    folder_id = uuid.uuid4()

    # Case 1: Access denied
    mock_cannot.return_value = True
    response = client.get(f"/api/folders/{folder_id}/subfolders")
    assert response.status_code == 200
    assert "error" in response.json()
    assert response.json()["error"]["code"] == "access_denied"

    # Case 2: Success
    mock_cannot.return_value = False
    mock_get_sub.return_value = [{"id": "sub1"}]
    mock_get_res.return_value = [{"id": "res1"}]

    response = client.get(f"/api/folders/{folder_id}/subfolders")
    assert response.status_code == 200
    result = response.json()["result"]
    assert result["folderId"] == str(folder_id)
    assert result["subfolders"] == [{"id": "sub1"}]
    assert result["subfoldersAndResources"] == [{"id": "res1"}]

    app.dependency_overrides = {}


@patch("libs.folders.api.cannot")
@patch("libs.folders.api.ResourceManager")
@patch("libs.folders.api.add_to_folder")
def test_add_resource_to_folder(mock_add, mock_rm, mock_cannot, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    folder_id = uuid.uuid4()
    resource_id = uuid.uuid4()
    resource_kind = "test_kind"

    # Case 1: Access denied to folder
    mock_cannot.side_effect = [True, False]  # First check fails
    response = client.get(f"/api/folders/{folder_id}/add/{resource_kind}/{resource_id}")
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "access_denied"

    # Case 2: Access denied to resource
    mock_cannot.side_effect = [False, True]  # Second check fails
    mock_rm.get_resource_by_kind.return_value = MagicMock()
    response = client.get(f"/api/folders/{folder_id}/add/{resource_kind}/{resource_id}")
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "access_denied"

    # Case 3: Success
    mock_cannot.side_effect = [False, False]
    resource_type = MagicMock()
    resource_db = MagicMock()
    resource_type.get_first_by.return_value = resource_db
    mock_rm.get_resource_by_kind.return_value = resource_type

    response = client.get(f"/api/folders/{folder_id}/add/{resource_kind}/{resource_id}")
    assert response.status_code == 200
    mock_add.assert_called_with(folder_id=folder_id, resource=resource_db)

    app.dependency_overrides = {}


@patch("libs.folders.api.cannot")
@patch("libs.folders.api.ResourceManager")
@patch("libs.folders.api.remove_from_folder")
def test_remove_resource_from_folder(mock_remove, mock_rm, mock_cannot, client, mock_user, mock_translator):
    app.dependency_overrides[get_deps] = lambda: (mock_user, None, mock_translator)
    folder_id = uuid.uuid4()
    resource_id = uuid.uuid4()
    resource_kind = "test_kind"

    # Case 1: Access denied to folder
    mock_cannot.side_effect = [True, False]
    response = client.get(f"/api/folders/{folder_id}/remove/{resource_kind}/{resource_id}")
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "access_denied"

    # Case 2: Access denied to resource
    mock_cannot.side_effect = [False, True]
    mock_rm.get_resource_by_kind.return_value = MagicMock()
    response = client.get(f"/api/folders/{folder_id}/remove/{resource_kind}/{resource_id}")
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "access_denied"

    # Case 3: Success
    mock_cannot.side_effect = [False, False]
    resource_type = MagicMock()
    resource_db = MagicMock()
    resource_type.get_first_by.return_value = resource_db
    mock_rm.get_resource_by_kind.return_value = resource_type

    response = client.get(f"/api/folders/{folder_id}/remove/{resource_kind}/{resource_id}")
    assert response.status_code == 200
    mock_remove.assert_called_with(folder_id=folder_id, resource=resource_db)

    app.dependency_overrides = {}
