import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from libs.endpoints.endpoints import create_crud_endpoints
from libs.utils.deps import get_deps
from .conftest import EndpointResource


def test_update_endpoint(mock_deps, mock_db):
    test_app = FastAPI()
    test_router = create_crud_endpoints(
        ResourceClass=EndpointResource,
        prefix="/test_resources_options",
        include_update=True,
        include_patch=True,
    )
    test_app.include_router(test_router)
    test_client = TestClient(test_app)

    mock_user, mock_session, mock_translator = mock_deps
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_res = EndpointResource(
        id=uuid.uuid4(),
        name="test",
        size="100",
        time_created=datetime.now(timezone.utc),
        time_updated=datetime.now(timezone.utc),
    )

    # Configure query mock to return a resource with time_updated for concurrency check
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.join.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.group_by.return_value = mock_query

    mock_existing_res = MagicMock(spec=EndpointResource)
    mock_existing_res.id = mock_res.id
    mock_existing_res.time_updated = datetime.now(timezone.utc)
    mock_query.first.return_value = mock_existing_res

    with patch.object(EndpointResource, "in_db", return_value=True):
        with patch.object(EndpointResource, "update") as mock_update:
            mock_update.return_value = mock_res
            response = test_client.put(f"/test_resources_options/{mock_res.id}", json={"name": "updated"})
            assert response.status_code == 200


def test_patch_endpoint(mock_deps, mock_db):
    test_app = FastAPI()
    test_router = create_crud_endpoints(
        ResourceClass=EndpointResource,
        prefix="/test_resources_options",
        include_update=True,
        include_patch=True,
    )
    test_app.include_router(test_router)
    test_client = TestClient(test_app)

    mock_user, mock_session, mock_translator = mock_deps
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_res = EndpointResource(
        id=uuid.uuid4(),
        name="test",
        size="100",
        time_created=datetime.now(timezone.utc),
        time_updated=datetime.now(timezone.utc),
    )

    with patch.object(EndpointResource, "in_db", return_value=True):
        with patch.object(EndpointResource, "patch") as mock_patch:
            mock_patch.return_value = mock_res
            response = test_client.patch(f"/test_resources_options/{mock_res.id}", json={"name": "patched"})
            assert response.status_code == 200
