import asyncio
import json
import logging

import pytest
import sentry_sdk
import structlog
from fastapi import FastAPI
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.transport import Transport
from starlette.testclient import TestClient

from libs.logger.structured import RequestContextMiddleware, configure_logging


class CapturingTransport(Transport):
    def __init__(self):
        super().__init__()
        self.events = []

    def capture_event(self, event):
        self.events.append(event)

    def capture_envelope(self, envelope):
        self.events.extend(event for item in envelope.items if (event := item.get_event()) is not None)


@pytest.fixture(autouse=True)
def restore_logging_configuration():
    root_logger = logging.getLogger()
    root_handlers = list(root_logger.handlers)
    root_level = root_logger.level
    structlog_config = structlog.get_config().copy()
    logger_names = (
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "tests.named_structlog",
        "tests.named_foreign",
    )
    logger_states = {
        name: (
            list(logging.getLogger(name).handlers),
            logging.getLogger(name).level,
            logging.getLogger(name).propagate,
            logging.getLogger(name).disabled,
        )
        for name in logger_names
    }

    yield

    root_logger.handlers = root_handlers
    root_logger.setLevel(root_level)
    for name, (handlers, level, propagate, disabled) in logger_states.items():
        named_logger = logging.getLogger(name)
        named_logger.handlers = handlers
        named_logger.setLevel(level)
        named_logger.propagate = propagate
        named_logger.disabled = disabled
    structlog.configure(**structlog_config)


def _json_events(output: str) -> list[dict]:
    return [json.loads(line) for line in output.splitlines() if line]


def test_foreign_logs_render_as_json_on_stdout_and_respect_global_level(capsys):
    configure_logging(json=True, level="INFO")

    foreign_logger = logging.getLogger("tests.foreign_json")
    foreign_logger.debug("foreign_debug")
    foreign_logger.info("foreign_info")

    captured = capsys.readouterr()
    assert captured.err == ""
    assert [event["event"] for event in _json_events(captured.out)] == ["foreign_info"]


def test_foreign_logs_render_for_development_on_stdout(capsys):
    configure_logging(json=False, level="INFO")

    logging.getLogger("tests.foreign_dev").info("foreign_info")

    captured = capsys.readouterr()
    assert captured.err == ""
    assert "foreign_info" in captured.out
    assert "tests.foreign_dev" in captured.out


def test_named_level_can_lower_structlog_and_foreign_loggers_to_debug(capsys):
    configure_logging(
        json=True,
        level="INFO",
        log_levels_env="tests.named_structlog=DEBUG,tests.named_foreign=DEBUG",
    )

    structlog.get_logger("tests.named_structlog").debug("structlog_debug")
    logging.getLogger("tests.named_foreign").debug("foreign_debug")

    events = _json_events(capsys.readouterr().out)
    assert [event["event"] for event in events] == ["structlog_debug", "foreign_debug"]


def test_request_error_reaches_sentry_once_with_request_id_tag():
    previous_client = sentry_sdk.get_client()
    transport = CapturingTransport()
    try:
        sentry_sdk.init(
            dsn="https://public@example.com/1",
            transport=transport,
            disabled_integrations=[LoggingIntegration],
        )
        configure_logging(json=True, level="INFO")

        app = FastAPI()

        @app.get("/sentry")
        async def sentry_endpoint():
            structlog.get_logger("tests.sentry").error("single_sentry_error")
            return {"ok": True}

        app.add_middleware(RequestContextMiddleware)
        with TestClient(app) as client:
            response = client.get("/sentry")

        sentry_sdk.flush(timeout=1)
    finally:
        sentry_sdk.get_client().close(timeout=1)
        sentry_sdk.get_global_scope().set_client(previous_client)
        sentry_sdk.get_isolation_scope().set_client(previous_client)
        sentry_sdk.get_current_scope().set_client(previous_client)

    assert response.status_code == 200
    assert [event["message"] for event in transport.events] == ["single_sentry_error"]
    assert transport.events[0]["tags"]["request_id"]


def test_request_context_reaches_spawned_task_and_access_log(capsys):
    configure_logging(json=True, level="INFO")

    app = FastAPI()

    @app.get("/items/{item_id}")
    async def endpoint(item_id: str):
        async def spawned_work():
            structlog.get_logger("tests.spawned").info("spawned_task_log")

        await asyncio.create_task(spawned_work())
        return {"item_id": item_id}

    app.add_middleware(RequestContextMiddleware)

    with TestClient(app) as client:
        response = client.get("/items/123")

    assert response.status_code == 200
    events = _json_events(capsys.readouterr().out)
    spawned_event = next(event for event in events if event["event"] == "spawned_task_log")
    access_event = next(event for event in events if event["event"] == "request_handled")
    assert spawned_event["request_id"] == access_event["request_id"]
    assert access_event["method"] == "GET"
    assert access_event["path"] == "/items/{item_id}"
    assert access_event["status"] == 200
