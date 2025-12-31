import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from libs.endpoints.endpoints import create_crud_endpoints
from libs.utils.deps import get_deps
from .conftest import EndpointResource


def test_crud_endpoints_options_coverage(mock_deps, mock_db):
    # Test include_all_by_app
    test_app = FastAPI()
    test_router = create_crud_endpoints(
        ResourceClass=EndpointResource,
        prefix="/test_resources_options",
        include_update=True,
        include_patch=True,
        include_delete=True,
        include_simplified=True,
    )
    test_app.include_router(test_router)
    test_client = TestClient(test_app)

    mock_user, mock_session, mock_translator = mock_deps
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)

    # Configure mock query for filters and ordering
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.join.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.group_by.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.count.return_value = 1

    mock_res = EndpointResource(
        id=uuid.uuid4(),
        name="test",
        size="100",
        time_created=datetime.now(timezone.utc),
        time_updated=datetime.now(timezone.utc),
    )
    mock_query.limit.return_value.offset.return_value.all.return_value = [mock_res]

    # Test filters
    response = test_client.get("/test_resources_options?filters=name:test:e")
    assert response.status_code == 200

    # Test comparison filters
    response = test_client.get("/test_resources_options?filters=size:100:e:>")
    assert response.status_code == 200

    # Test ordering
    response = test_client.get("/test_resources_options?ordering_by=name:asc")
    assert response.status_code == 200

    # Test invalid filter field
    response = test_client.get("/test_resources_options?filters=invalid:test")
    assert response.status_code == 400

    # Test invalid match type
    with pytest.raises(ValueError):
        test_client.get("/test_resources_options?filters=name:test:invalid")
