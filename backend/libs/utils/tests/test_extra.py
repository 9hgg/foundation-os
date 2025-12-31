import datetime
import sys
from unittest.mock import MagicMock

# Mock babel before importing libs.utils.time.time
mock_babel = MagicMock()
sys.modules["babel"] = mock_babel
sys.modules["babel.dates"] = mock_babel.dates

import pytest
from libs.utils.methods import deep_update
from libs.utils.time.time import convert_period_to_wrapping_months, convert_month_to_str, format_datetime


def test_deep_update():
    # Simple update
    original = {"a": 1, "b": 2}
    update = {"b": 3, "c": 4}
    result = deep_update(original, update)
    assert result == {"a": 1, "b": 3, "c": 4}

    # Nested update
    original = {"a": {"x": 1, "y": 2}, "b": 3}
    update = {"a": {"y": 3, "z": 4}}
    result = deep_update(original, update)
    assert result == {"a": {"x": 1, "y": 3, "z": 4}, "b": 3}

    # Multiple updates
    update2 = {"a": {"x": 5}}
    result = deep_update(original, update, update2)
    assert result == {"a": {"x": 5, "y": 3, "z": 4}, "b": 3}

    # List replacement (not merge)
    original = {"a": [1, 2]}
    update = {"a": [3, 4]}
    result = deep_update(original, update)
    assert result == {"a": [3, 4]}


def test_convert_period_to_wrapping_months():
    start = datetime.datetime(2023, 1, 15)
    end = datetime.datetime(2023, 3, 10)

    months = convert_period_to_wrapping_months(start, end)

    assert len(months) == 3
    # Jan
    assert months[0][0] == datetime.datetime(2023, 1, 1)
    assert months[0][1] == datetime.datetime(2023, 2, 1)
    # Feb
    assert months[1][0] == datetime.datetime(2023, 2, 1)
    assert months[1][1] == datetime.datetime(2023, 3, 1)
    # Mar
    assert months[2][0] == datetime.datetime(2023, 3, 1)
    assert months[2][1] == datetime.datetime(2023, 4, 1)

    # Single month
    start = datetime.datetime(2023, 1, 1)
    end = datetime.datetime(2023, 1, 31)
    months = convert_period_to_wrapping_months(start, end)
    assert len(months) == 1


def test_convert_month_to_str():
    dt = datetime.datetime(2023, 1, 15)
    assert convert_month_to_str(dt) == "2023-01"


def test_format_datetime():
    dt = datetime.datetime(2023, 1, 1, 12, 0, 0, tzinfo=datetime.timezone.utc)

    # Mock babel.dates.format_datetime
    mock_babel.dates.format_datetime.return_value = "formatted_date"

    formatted = format_datetime(dt, desired_format="medium")

    assert formatted == "formatted_date"
    mock_babel.dates.format_datetime.assert_called_once()
