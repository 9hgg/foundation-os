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

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query

    mock_existing_res = MagicMock(spec=EndpointResource)
    mock_existing_res.id = mock_res.id
    mock_existing_res.time_updated = datetime.now(timezone.utc)
    mock_query.first.return_value = mock_existing_res

    with patch(
        "libs.endpoints.endpoints.apply_operation_access_filter",
        side_effect=lambda **kwargs: kwargs["query"],
    ):
        with patch.object(EndpointResource, "in_db", return_value=True):
            with patch.object(EndpointResource, "update") as mock_update:
                mock_update.return_value = mock_res
                response = test_client.put(
                    f"/test_resources_options/{mock_res.id}",
                    json={"name": "updated", "size": "100"},
                )
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

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = mock_res

    with patch(
        "libs.endpoints.endpoints.apply_operation_access_filter",
        side_effect=lambda **kwargs: kwargs["query"],
    ):
        with patch("libs.endpoints.endpoints.deep_update_pydantic_object", return_value=mock_res):
            with patch.object(EndpointResource, "model_validate", return_value=mock_res):
                with patch.object(EndpointResource, "save") as mock_save:
                    response = test_client.patch(
                        f"/test_resources_options/{mock_res.id}",
                        json={"name": "patched"},
                    )
                    assert response.status_code == 200
                    mock_save.assert_called_once()


def test_patch_endpoint_can_bypass_acl_for_admin_when_resource_enables_it(mock_deps, mock_db):
    test_app = FastAPI()
    test_router = create_crud_endpoints(
        ResourceClass=EndpointResource,
        prefix="/test_resources_admin_bypass",
        include_patch=True,
        include_bypass=True,
    )
    test_app.include_router(test_router)
    test_client = TestClient(test_app)

    mock_user, mock_session, mock_translator = mock_deps
    mock_user.is_admin.return_value = True
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_res = EndpointResource(
        id=uuid.uuid4(),
        name="test",
        size="100",
        time_created=datetime.now(timezone.utc),
        time_updated=datetime.now(timezone.utc),
    )
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = mock_res

    with patch("libs.endpoints.endpoints.apply_operation_access_filter") as mock_acl_filter:
        with patch("libs.endpoints.endpoints.deep_update_pydantic_object", return_value=mock_res):
            with patch.object(EndpointResource, "model_validate", return_value=mock_res):
                with patch.object(EndpointResource, "save"):
                    response = test_client.patch(
                        f"/test_resources_admin_bypass/{mock_res.id}",
                        json={"name": "admin patched"},
                    )

    assert response.status_code == 200
    mock_acl_filter.assert_not_called()
