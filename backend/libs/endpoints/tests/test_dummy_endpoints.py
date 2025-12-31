import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from libs.endpoints.api import create_dummy_test_endpoints_router
from libs.users.methods import get_current_user_optional
from libs.sessions.methods import get_current_session_optional
from libs.i18n.deps import get_translator


def test_create_dummy_test_endpoints_router():
    router = create_dummy_test_endpoints_router()
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    # Test /test-api/state
    # Mock dependencies
    mock_user = MagicMock()
    mock_user.email = "test@example.com"
    mock_session = MagicMock()
    mock_session.id = "session_id"
    mock_translator = MagicMock()

    app.dependency_overrides[get_current_user_optional] = lambda: mock_user
    app.dependency_overrides[get_current_session_optional] = lambda: mock_session
    app.dependency_overrides[get_translator] = lambda: mock_translator

    response = client.get("/test-api/state")
    assert response.status_code == 200
    # The endpoint prints to stdout, doesn't return much (returns None implicitly)

    # Test with None dependencies
    app.dependency_overrides[get_current_user_optional] = lambda: None
    app.dependency_overrides[get_current_session_optional] = lambda: None
    app.dependency_overrides[get_translator] = lambda: None

    response = client.get("/test-api/state")
    assert response.status_code == 200

    # Test /test-api/stateless
    response = client.get("/test-api/stateless")
    assert response.status_code == 200
    assert response.json() is None

    # Test /test-api/exit/{exit_code}
    with pytest.raises(SystemExit) as pytest_wrapped_e:
        # We need to mock exit, but since it's a builtin, we might need to catch SystemExit
        # FastAPI catches exceptions, but SystemExit might propagate?
        # Actually, if we call the function directly it raises SystemExit.
        # But via client, it might be caught by Starlette/FastAPI if not handled?
        # Let's try calling it via client.
        # If it calls exit(), the test runner might exit if not caught.
        # pytest handles SystemExit.
        client.get("/test-api/exit/1")

    assert pytest_wrapped_e.type == SystemExit
    assert pytest_wrapped_e.value.code == 1

    # Test /test-api/sentry-debug
    # This raises ZeroDivisionError
    with pytest.raises(ZeroDivisionError):
        client.get("/test-api/sentry-debug")

    app.dependency_overrides = {}
