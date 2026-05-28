import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from libs.endpoints.endpoints import create_crud_endpoints
from libs.utils.deps import get_deps
from .conftest import EndpointResource


def test_delete_endpoint(mock_deps, mock_db):
    test_app = FastAPI()
    test_router = create_crud_endpoints(
        ResourceClass=EndpointResource,
        prefix="/test_resources_options",
        include_delete=True,
    )
    test_app.include_router(test_router)
    test_client = TestClient(test_app)

    mock_user, mock_session, mock_translator = mock_deps
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    mock_res_id = uuid.uuid4()
    mock_res = EndpointResource(
        id=mock_res_id,
        name="test",
        size="100",
        time_created=datetime.now(timezone.utc),
        time_updated=datetime.now(timezone.utc),
    )

    with patch.object(EndpointResource, "in_db", return_value=True):
        with patch(
            "libs.endpoints.endpoints.apply_operation_access_filter",
            side_effect=lambda **kwargs: kwargs["query"],
        ):
            mock_query = mock_db.query.return_value
            mock_query.filter.return_value = mock_query
            mock_query.first.return_value = mock_res

            with patch.object(EndpointResource, "delete") as mock_delete:
                mock_delete.return_value = mock_res
                response = test_client.delete(f"/test_resources_options/{mock_res_id}")
                assert response.status_code == 200
                mock_delete.assert_called_once()
