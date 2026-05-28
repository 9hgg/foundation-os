import logging
import sys
import traceback
from pprint import pformat
from textwrap import wrap

from loguru import logger

from .config import LOGGER_SETTINGS

CRITICAL = 50
FATAL = CRITICAL
ERROR = 40
WARNING = 30
WARN = WARNING
INFO = 20
DEBUG = 10
NOTSET = 0

_levelToName = {
    CRITICAL: "CRITICAL",
    ERROR: "ERROR",
    WARNING: "WARNING",
    INFO: "INFO",
    DEBUG: "DEBUG",
    NOTSET: "NOTSET",
}


class InterceptHandler(logging.Handler):
    """
    Default handler from examples in loguru documentaion.
    See https://loguru.readthedocs.io/en/stable/overview.html#entirely-compatible-with-standard-logging
    """

    def emit(self, record: logging.LogRecord):
        # Get corresponding Loguru level if it exists
        level = _levelToName.get(record.levelno, record.levelno)
        # Find caller from where originated the logged message
        _, depth = logging.currentframe(), 2
        logger.opt(
            depth=depth,
            exception=record.exc_info,
        ).log(level, record.getMessage())


def format_record(record: dict) -> str:
    """
    Custom format for loguru loggers.
    Uses pformat for log any data like request/response body during debug.
    Works with logging if loguru handles it.

    Example:
    >>> payload = [{"users":[{"name": "Nick", "age": 87, "is_active": True}, {"name": "Alex", "age": 27, "is_active": True}], "count": 2}]
    >>> logger.bind(payload=payload).debug("users payload")
    >>> [   {   'count': 2,
    >>>         'users': [   {'age': 87, 'is_active': True, 'name': 'Nick'},
    >>>                      {'age': 27, 'is_active': True, 'name': 'Alex'}]}]
    """

    # format_string = LOGURU_FORMAT
    format_string = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level.icon: <4}{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
    )
    # format_string = "{level: <8} {time:YYYY-MM-DD HH:mm:ss.SSS} [{name}]({function}:{line}) {message}"
    if record["extra"].get("payload", None) is not None:
        record["extra"]["payload"] = pformat(record["extra"]["payload"], indent=4, compact=False, width=100)
        format_string += "\n<level>{extra[payload]}</level>"

    if record["extra"].get("request_log_uuid", None) is not None:
        request_log_uuid = record["extra"]["request_log_uuid"]
        format_string = "<red>" + request_log_uuid + "</red> " + format_string

    if record["exception"] is not None:
        traceback.print_exc()
        record["extra"]["traceback"] = "\n" + "See traceback above"
        format_string += "{extra[traceback]}"
    format_string += "\n"
    return format_string


def init_logging():
    """
    Replaces logging handlers with a handler for using the custom handler.
    """

    intercept_handler = InterceptHandler()

    # disable handlers for specific uvicorn loggers
    # to redirect their output to the default uvicorn logger
    # works with uvicorn==0.11.6
    uvicorn_loggers = (
        logging.getLogger(name) for name in logging.root.manager.loggerDict if name.startswith("uvicorn.")
    )
    for uvicorn_logger in uvicorn_loggers:
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True

    # set parent logger on uvicorn to get all log messages on one logger
    logging.getLogger("uvicorn").handlers = [intercept_handler]

    # set logs output, level and format
    logger.configure(
        handlers=[
            {
                "sink": sys.stdout,
                "level": logging.NOTSET,
                "format": format_record,
                "colorize": LOGGER_SETTINGS.COLORIZE_LOG,
            }
        ]
    )


def print_error(*tup, payload=None, request_log_uuid=None):
    logger.opt(depth=1).bind(
        payload=payload,
        request_log_uuid=request_log_uuid,
    ).error(str(" ".join([str(x) for x in tup])))


def print_warning(*tup, payload=None, request_log_uuid=None):
    logger.opt(depth=1).bind(
        payload=payload,
        request_log_uuid=request_log_uuid,
    ).warning(str(" ".join([str(x) for x in tup])))


print_ = print


def print(*tup, payload: dict | None = None, request_log_uuid: str | None = None):  # noqa: A001
    logger.opt(depth=1).bind(
        payload=payload,
        request_log_uuid=request_log_uuid,
    ).debug(str(" ".join([str(x) for x in tup])))


def print_color(
    color: str,
    *tup,
    payload: dict | None = None,
    request_log_uuid: str | None = None,
):
    if not LOGGER_SETTINGS.COLORIZE_LOG:
        print(*tup, payload=payload, request_log_uuid=request_log_uuid)
        return

    color_ascii = {
        "black": 30,
        "red": 31,
        "green": 32,
        "yellow": 33,
        "blue": 34,
        "magenta": 35,
        "cyan": 36,
        "white": 37,
    }

    if color not in color_ascii:
        color = "white"

    color_char_opening = "\033[" + str(color_ascii[color]) + "m"

    color_char_closing = "\033[0m"  # reset color

    # print(
    #     color_char_opening,
    #     *tup,
    #     color_char_closing,
    #     payload=payload,
    #     request_log_uuid=request_log_uuid,
    # )

    logger.opt(depth=1).bind(
        payload=payload,
        request_log_uuid=request_log_uuid,
    ).debug(color_char_opening + str(" ".join([str(x) for x in tup])) + color_char_closing)


def print_rule(
    color: str,
    title: str,
    *,
    char: str = "=",
    width: int = 88,
    request_log_uuid: str | None = None,
) -> None:
    """Print a visually distinct rule line with a centered title."""

    inner = f" {title} "
    if len(inner) >= width:
        print_color(color, inner, request_log_uuid=request_log_uuid)
        return
    side = char * ((width - len(inner)) // 2)
    line = f"{side}{inner}{side}"
    if len(line) < width:
        line += char * (width - len(line))
    print_color(color, line, request_log_uuid=request_log_uuid)


def print_block(
    color: str,
    title: str,
    *lines: object,
    payload: dict | None = None,
    request_log_uuid: str | None = None,
    width: int = 88,
) -> None:
    """Print a titled multiline block with wrapped content."""

    print_rule(color, title, width=width, request_log_uuid=request_log_uuid)
    for line in lines:
        text = str(line)
        raw_lines = text.splitlines() or [""]
        emitted = False
        for raw_line in raw_lines:
            wrapped = wrap(
                raw_line,
                width=max(20, width - 4),
                replace_whitespace=False,
                drop_whitespace=False,
            )
            if not wrapped:
                print_color(color, "", request_log_uuid=request_log_uuid)
                continue
            emitted = True
            for chunk in wrapped:
                print_color(color, f"  {chunk}", request_log_uuid=request_log_uuid)
        if not emitted and text == "":
            print_color(color, "", request_log_uuid=request_log_uuid)
    if payload is not None:
        payload_text = pformat(payload, indent=2, compact=False, width=max(20, width - 4))
        for raw_line in payload_text.splitlines():
            wrapped = wrap(
                raw_line,
                width=max(20, width - 4),
                replace_whitespace=False,
                drop_whitespace=False,
            )
            if not wrapped:
                print_color(color, "", request_log_uuid=request_log_uuid)
                continue
            for chunk in wrapped:
                print_color(color, f"  {chunk}", request_log_uuid=request_log_uuid)
    print_rule(color, f"END {title}", char="-", width=width, request_log_uuid=request_log_uuid)
