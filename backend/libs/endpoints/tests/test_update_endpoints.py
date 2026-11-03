import uuid
from datetime import UTC, datetime, timedelta
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
        time_created=datetime.now(UTC),
        time_updated=datetime.now(UTC),
    )

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query

    mock_existing_res = MagicMock(spec=EndpointResource)
    mock_existing_res.id = mock_res.id
    mock_existing_res.time_updated = datetime.now(UTC)
    mock_query.first.return_value = mock_existing_res

    with (
        patch(
            "libs.endpoints.endpoints.apply_operation_access_filter",
            side_effect=lambda **kwargs: kwargs["query"],
        ),
        patch.object(EndpointResource, "in_db", return_value=True),
        patch.object(EndpointResource, "update") as mock_update,
    ):
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
        time_created=datetime.now(UTC),
        time_updated=datetime.now(UTC),
    )

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = mock_res

    with (
        patch(
            "libs.endpoints.endpoints.apply_operation_access_filter",
            side_effect=lambda **kwargs: kwargs["query"],
        ),
        patch("libs.endpoints.endpoints.deep_update_pydantic_object", return_value=mock_res),
        patch.object(EndpointResource, "model_validate", return_value=mock_res),
        patch.object(EndpointResource, "save") as mock_save,
    ):
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
        time_created=datetime.now(UTC),
        time_updated=datetime.now(UTC),
    )
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = mock_res

    with (
        patch("libs.endpoints.endpoints.apply_operation_access_filter") as mock_acl_filter,
        patch("libs.endpoints.endpoints.deep_update_pydantic_object", return_value=mock_res),
        patch.object(EndpointResource, "model_validate", return_value=mock_res),
        patch.object(EndpointResource, "save"),
    ):
        response = test_client.patch(
            f"/test_resources_admin_bypass/{mock_res.id}",
            json={"name": "admin patched"},
        )

    assert response.status_code == 200
    mock_acl_filter.assert_not_called()


def _patch_router_client(mock_deps, prefix: str):
    test_app = FastAPI()
    test_app.include_router(
        create_crud_endpoints(ResourceClass=EndpointResource, prefix=prefix, include_patch=True)
    )
    mock_user, mock_session, mock_translator = mock_deps
    test_app.dependency_overrides[get_deps] = lambda: (mock_user, mock_session, mock_translator)
    return TestClient(test_app)


def _stored_resource(mock_db, time_updated: datetime) -> EndpointResource:
    resource = EndpointResource(
        id=uuid.uuid4(),
        name="stored",
        size="100",
        time_created=datetime.now(UTC),
        time_updated=time_updated,
    )
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = resource
    return resource


def test_patch_endpoint_rejects_a_client_that_has_not_seen_the_latest_version(mock_deps, mock_db):
    """A patch built on an outdated copy is dropped, and the current row is returned instead."""
    stored = _stored_resource(mock_db, datetime.now(UTC))
    client = _patch_router_client(mock_deps, "/test_resources_stale")
    client_seen_at = (stored.time_updated - timedelta(seconds=30)).isoformat()

    with (
        patch(
            "libs.endpoints.endpoints.apply_operation_access_filter",
            side_effect=lambda **kwargs: kwargs["query"],
        ),
        patch("libs.endpoints.endpoints.deep_update_pydantic_object", return_value=stored),
        patch.object(EndpointResource, "model_validate", return_value=stored),
        patch.object(EndpointResource, "save") as mock_save,
    ):
        response = client.patch(
                    f"/test_resources_stale/{stored.id}",
                    json={"name": "patched", "timeUpdated": client_seen_at},
                )

    assert response.status_code == 200
    assert response.json()["result"]["data"]["name"] == "stored"
    mock_save.assert_not_called()


def test_patch_endpoint_accepts_a_client_holding_the_current_version(mock_deps, mock_db):
    stored = _stored_resource(mock_db, datetime.now(UTC))
    client = _patch_router_client(mock_deps, "/test_resources_fresh")

    with (
        patch(
            "libs.endpoints.endpoints.apply_operation_access_filter",
            side_effect=lambda **kwargs: kwargs["query"],
        ),
        patch("libs.endpoints.endpoints.deep_update_pydantic_object", return_value=stored),
        patch.object(EndpointResource, "model_validate", return_value=stored),
        patch.object(EndpointResource, "save") as mock_save,
    ):
        response = client.patch(
                    f"/test_resources_fresh/{stored.id}",
                    json={"name": "patched", "timeUpdated": stored.time_updated.isoformat()},
                )

    assert response.status_code == 200
    mock_save.assert_called_once()


def test_patch_endpoint_applies_a_patch_that_carries_no_timestamp(mock_deps, mock_db):
    """Clients that send no timestamp keep working: the check simply does not apply to them."""
    stored = _stored_resource(mock_db, datetime.now(UTC))
    client = _patch_router_client(mock_deps, "/test_resources_no_stamp")

    with (
        patch(
            "libs.endpoints.endpoints.apply_operation_access_filter",
            side_effect=lambda **kwargs: kwargs["query"],
        ),
        patch("libs.endpoints.endpoints.deep_update_pydantic_object", return_value=stored),
        patch.object(EndpointResource, "model_validate", return_value=stored),
        patch.object(EndpointResource, "save") as mock_save,
    ):
        response = client.patch(
                    f"/test_resources_no_stamp/{stored.id}",
                    json={"name": "patched"},
                )

    assert response.status_code == 200
    mock_save.assert_called_once()
