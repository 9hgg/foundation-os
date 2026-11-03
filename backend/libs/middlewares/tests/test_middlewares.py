import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.middlewares.middlewares import AppVersionHeader, Catch405Middleware, ProcessTimeHeader


def build_app() -> FastAPI:
    """Same order as the apps: Catch405 inner, ProcessTimeHeader outermost."""
    app = FastAPI()

    @app.get("/ok")
    def ok():
        return {"hello": "world"}

    @app.get("/boom")
    def boom():
        raise ValueError("wrapper loop when unwrapping <function read_resource>")  # noqa: TRY003

    app.add_middleware(Catch405Middleware)
    app.add_middleware(ProcessTimeHeader)
    return app


def test_process_time_header_is_added():
    client = TestClient(build_app())

    response = client.get("/ok")

    assert response.status_code == 200
    assert float(response.headers["x-process-time"]) >= 0


def test_app_version_header_is_added_when_a_version_is_known(monkeypatch):
    monkeypatch.setattr(AppVersionHeader, "APP_VERSION", "abc1234")
    app = FastAPI()

    @app.get("/ok")
    def ok():
        return {"hello": "world"}

    app.add_middleware(AppVersionHeader)
    response = TestClient(app).get("/ok")

    assert response.status_code == 200
    assert response.headers["x-app-version"] == "abc1234"


def test_app_version_header_is_omitted_when_version_is_unknown(monkeypatch):
    monkeypatch.setattr(AppVersionHeader, "APP_VERSION", None)
    app = FastAPI()

    @app.get("/ok")
    def ok():
        return {"hello": "world"}

    app.add_middleware(AppVersionHeader)
    response = TestClient(app).get("/ok")

    assert response.status_code == 200
    assert "x-app-version" not in response.headers


def test_405_is_replaced_with_a_json_body():
    client = TestClient(build_app())

    response = client.post("/ok")

    assert response.status_code == 405
    assert response.json() == {
        "detail": "Method Not Allowed",
        "method": "POST",
        "url": "http://testserver/ok",
    }
    assert int(response.headers["content-length"]) == len(response.content)


def test_a_downstream_exception_reaches_the_server_unwrapped():
    client = TestClient(build_app(), raise_server_exceptions=True)

    with pytest.raises(ValueError, match="wrapper loop"):
        client.get("/boom")


def test_one_failing_request_does_not_affect_the_next_one():
    client = TestClient(build_app(), raise_server_exceptions=False)

    failed = client.get("/boom")
    survivor = client.get("/ok")

    assert failed.status_code == 500
    assert survivor.status_code == 200
    assert survivor.json() == {"hello": "world"}
