import pytest
from unittest.mock import MagicMock, patch
from libs.logger.customLogger import format_record, print_color, print_error, print_warning, print as custom_print


def test_format_record():
    record = {"extra": {}, "exception": None}
    fmt = format_record(record)
    assert "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green>" in fmt

    # Payload
    record["extra"]["payload"] = {"key": "value"}
    fmt = format_record(record)
    assert "<level>{extra[payload]}</level>" in fmt

    # Request Log UUID
    record["extra"]["request_log_uuid"] = "uuid-123"
    fmt = format_record(record)
    assert "<red>uuid-123</red>" in fmt

    # Exception
    record["exception"] = "Some exception"
    fmt = format_record(record)
    assert "{extra[traceback]}" in fmt


@patch("libs.logger.customLogger.logger")
def test_print_functions(mock_logger):
    # Setup mock
    mock_opt = MagicMock()
    mock_logger.opt.return_value = mock_opt
    mock_bind = MagicMock()
    mock_opt.bind.return_value = mock_bind

    # print
    custom_print("test", "message")
    mock_logger.opt.assert_called_with(depth=1)
    mock_bind.debug.assert_called_with("test message")

    # print_error
    print_error("error", "message")
    mock_bind.error.assert_called_with("error message")

    # print_warning
    print_warning("warning", "message")
    mock_bind.warning.assert_called_with("warning message")

    # print_color
    print_color("red", "colored", "message")
    mock_bind.debug.assert_called()
    args = mock_bind.debug.call_args[0][0]
    assert "\033[31m" in args  # Red
    assert "colored message" in args
    assert "\033[0m" in args  # Reset

    # print_color invalid color
    print_color("invalid", "message")
    args = mock_bind.debug.call_args[0][0]
    assert "\033[37m" in args  # White default
