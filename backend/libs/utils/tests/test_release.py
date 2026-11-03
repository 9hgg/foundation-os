from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.utils.api import create_release_router
from libs.utils.release import get_release


def test_get_release_reads_git_sha():
    with patch("subprocess.check_output", return_value="abc1234\n"):
        assert get_release() == "abc1234"


def test_get_release_falls_back_to_env_var_when_git_unavailable(monkeypatch):
    monkeypatch.setenv("GIT_SHA", "envsha1")
    with patch("subprocess.check_output", side_effect=OSError()):
        assert get_release() == "envsha1"


def test_get_release_returns_none_when_neither_available(monkeypatch):
    monkeypatch.delenv("GIT_SHA", raising=False)
    with patch("subprocess.check_output", side_effect=OSError()):
        assert get_release() is None


def test_release_endpoint_uses_standard_response_envelope():
    app = FastAPI()
    app.include_router(create_release_router())

    with patch(
        "libs.utils.api.get_release_info",
        return_value={
            "sha": "abc1234",
            "message": "fix release display",
            "date": "2026-08-04T00:00:00+02:00",
        },
    ):
        response = TestClient(app).get("/api/release")

    assert response.status_code == 200
    assert response.json() == {
        "error": None,
        "result": {
            "sha": "abc1234",
            "message": "fix release display",
            "date": "2026-08-04T00:00:00+02:00",
        },
        "message": None,
    }
