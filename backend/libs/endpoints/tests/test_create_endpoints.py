import pytest
import uuid
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from libs.endpoints.endpoints import create_crud_endpoints
from libs.utils.deps import get_deps
from libs.files.models import File

# Setup app with CRUD router for create tests
app = FastAPI()
router = create_crud_endpoints(
    ResourceClass=File,
    prefix="/files",
    include_create=True,
)
app.include_router(router)
client = TestClient(app)


def test_create_resource(mock_deps):
    mock_user, mock_session, mock_translator = mock_deps
    app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    with (
        patch("libs.endpoints.endpoints.context_db") as mock_context_db,
        patch("libs.resource.resource.context_db") as mock_resource_context_db,
        patch("libs.endpoints.endpoints.create_default_acls") as mock_create_acls,
    ):
        mock_db = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db
        mock_resource_context_db.return_value.__enter__.return_value = mock_db

        # Mock File.create
        with patch.object(File, "create") as mock_create:
            mock_file = MagicMock(spec=File)
            mock_file.id = uuid.uuid4()
            mock_file.__kind__ = "file"
            mock_create.return_value = mock_file

            # Mock by_id to return the created file
            with patch.object(File, "by_id", return_value=mock_file):
                response = client.post(
                    "/files", json={"storage_id": str(uuid.uuid4()), "original_filename": "test_file.txt"}
                )

                assert response.status_code == 201
                data = response.json()
                assert "result" in data
                assert "data" in data["result"]
                assert data["result"]["data"]["id"] == str(mock_file.id)
                mock_create_acls.assert_called()

    app.dependency_overrides = {}
