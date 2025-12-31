import pytest
import uuid
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from libs.endpoints.endpoints import create_crud_endpoints
from libs.utils.deps import get_deps
from libs.files.models import File

# Setup app with CRUD router for generic read tests
app = FastAPI()
router = create_crud_endpoints(
    ResourceClass=File,
    prefix="/files",
    include_read=True,
)
app.include_router(router)
client = TestClient(app)


def test_read_resources_endpoint(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db

        # Mock query chain
        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.join.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.group_by.return_value = mock_query
        mock_query.order_by.return_value = mock_query

        # Mock result for pagination
        mock_query.count.return_value = 1
        mock_file = MagicMock(spec=File)
        mock_file.id = uuid.uuid4()
        mock_query.limit.return_value.offset.return_value.all.return_value = [mock_file]

        response = client.get("/files")

        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert "data" in data["result"]
        assert len(data["result"]["data"]) == 1

    app.dependency_overrides = {}


def test_read_resource_by_id(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    file_id = str(uuid.uuid4())

    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db

        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.join.return_value = mock_query
        mock_query.group_by.return_value = mock_query

        mock_file = MagicMock(spec=File)
        mock_file.id = uuid.UUID(file_id)
        mock_query.first.return_value = mock_file

        response = client.get(f"/files/{file_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["result"]["data"]["id"] == file_id

    app.dependency_overrides = {}


def test_read_resource_not_found(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    file_id = str(uuid.uuid4())

    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db

        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.join.return_value = mock_query
        mock_query.group_by.return_value = mock_query

        mock_query.first.return_value = None

        response = client.get(f"/files/{file_id}")

        assert response.status_code == 200
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "ItemNotFound"

    app.dependency_overrides = {}


def test_read_all_resources_endpoint(mock_deps):
    # We need to create a router with include_all_by_app=True to test this
    test_app = FastAPI()
    test_router = create_crud_endpoints(
        ResourceClass=File,
        prefix="/test_files",
        include_all_by_app=True,
    )
    test_app.include_router(test_router)
    test_client = TestClient(test_app)

    mock_user, mock_session, mock_translator = mock_deps
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db

        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.join.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.group_by.return_value = mock_query
        mock_query.order_by.return_value = mock_query

        mock_file = MagicMock(spec=File)
        mock_file.id = uuid.uuid4()
        mock_query.all.return_value = [mock_file]

        response = test_client.get("/test_files/all")

        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert len(data["result"]) == 1


def test_read_resource_by_key_value(mock_deps):
    # We need to create a router with include_read=True (default)
    # The existing router in the file should work

    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db

        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.join.return_value = mock_query
        mock_query.group_by.return_value = mock_query

        mock_file = MagicMock(spec=File)
        mock_file.id = uuid.uuid4()
        mock_query.first.return_value = mock_file

        response = client.get("/files/by/public_filename/test_file")

        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert data["result"]["data"]["id"] == str(mock_file.id)

    app.dependency_overrides = {}


def test_read_simplified_resource(mock_deps):
    # We need to create a router with include_simplified=True
    test_app = FastAPI()
    test_router = create_crud_endpoints(
        ResourceClass=File,
        prefix="/test_files_simplified",
        include_simplified=True,
    )
    test_app.include_router(test_router)
    test_client = TestClient(test_app)

    mock_user, mock_session, mock_translator = mock_deps
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    file_id = str(uuid.uuid4())

    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db

        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.join.return_value = mock_query
        mock_query.group_by.return_value = mock_query

        mock_file = MagicMock(spec=File)
        mock_file.id = uuid.UUID(file_id)
        mock_query.first.return_value = mock_file

        response = test_client.get(f"/test_files_simplified/{file_id}/simplified")

        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert data["result"]["data"]["id"] == file_id
