"""Shared structlog configuration and request-context middleware.

Usage:

    from libs.logger.structured import configure_logging, RequestContextMiddleware
    configure_logging(json=not DEBUG, level="INFO")
    asgi_app.add_middleware(RequestContextMiddleware)
    logger = structlog.get_logger(__name__)
"""

import logging
import sys
import time
import uuid

import structlog
from starlette.requests import Request
from starlette.types import ASGIApp
from structlog_sentry import SentryProcessor

_LOGGER_LEVEL_PREFIXES_ENV = "LOG_LEVELS"


def _stringify_uuids(_logger: object, _method_name: str, event_dict: dict) -> dict:
    for key, value in event_dict.items():
        if isinstance(value, uuid.UUID):
            event_dict[key] = str(value)
    return event_dict


def _per_logger_levels(spec: str | None) -> dict[str, int]:
    """Parse ``LOG_LEVELS="db=DEBUG,api=INFO,worker=WARNING"`` into a name->level map."""
    if not spec:
        return {}
    levels = {}
    for entry in spec.split(","):
        entry = entry.strip()
        if not entry or "=" not in entry:
            continue
        name, level_name = entry.split("=", 1)
        levels[name.strip()] = logging.getLevelNamesMapping()[level_name.strip().upper()]
    return levels


def configure_logging(*, json: bool, level: str = "INFO", log_levels_env: str | None = None) -> None:
    """Configure structlog and route stdlib logging through the same renderer.

    Call exactly once, from the app entry point (or CLI entry point).
    """
    global_level = logging.getLevelNamesMapping()[level.upper()]
    per_logger_levels = _per_logger_levels(log_levels_env)
    minimum_structlog_level = min((global_level, *per_logger_levels.values()))

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.CallsiteParameterAdder({
            structlog.processors.CallsiteParameter.FILENAME,
            structlog.processors.CallsiteParameter.LINENO,
            structlog.processors.CallsiteParameter.FUNC_NAME,
        }),
        _stringify_uuids,
        SentryProcessor(event_level=logging.ERROR, level=logging.INFO),
    ]

    renderer = structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        # The stdlib logger applies the final global/per-logger threshold.  The
        # structlog wrapper may only pre-filter below the lowest configured
        # threshold, otherwise a named DEBUG override could never take effect.
        wrapper_class=structlog.make_filtering_bound_logger(minimum_structlog_level),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(global_level)

    logging.captureWarnings(True)

    # Uvicorn/gunicorn's dictConfig(disable_existing_loggers=True) flips `disabled`
    # on every logger absent from their config, silently dropping its records.
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(logger_name)
        uv_logger.handlers = []
        uv_logger.propagate = True
        uv_logger.disabled = False
        uv_logger.setLevel(logging.NOTSET)
    # We emit our own access log from RequestContextMiddleware instead.
    logging.getLogger("uvicorn.access").disabled = True

    for name, logger_level in per_logger_levels.items():
        logging.getLogger(name).setLevel(logger_level)


class RequestContextMiddleware:
    """Binds a request_id into structlog's contextvars and emits one access log per request.

    Binding into contextvars (rather than a logger instance) means spawned
    async tasks inherit the request context automatically.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._logger = structlog.get_logger("access")

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        structlog.contextvars.clear_contextvars()
        request_id = str(uuid.uuid4())
        structlog.contextvars.bind_contextvars(request_id=request_id)

        try:
            import sentry_sdk

            sentry_sdk.set_tag("request_id", request_id)
        except ImportError:
            pass

        status_code = 500
        start = time.monotonic()

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            route = request.scope.get("route")
            path_template = route.path if route else request.url.path
            self._logger.info(
                "request_handled",
                method=request.method,
                path=path_template,
                status=status_code,
                duration_ms=duration_ms,
                client_ip=request.client.host if request.client else None,
            )
