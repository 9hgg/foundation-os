import pytest
from datetime import datetime, timedelta
from libs.endpoints.endpoints import check_concurrency_conflict, decode_filters


def test_check_concurrency_conflict():
    now = datetime.now()
    past = now - timedelta(seconds=10)
    future = now + timedelta(seconds=10)

    # Client is older than resource -> Conflict
    assert check_concurrency_conflict(past, now) is True

    # Client is newer than resource -> No conflict
    assert check_concurrency_conflict(future, now) is False

    # Client is same as resource -> No conflict
    assert check_concurrency_conflict(now, now) is False

    # None values -> No conflict (safe default)
    assert check_concurrency_conflict(None, now) is False
    assert check_concurrency_conflict(now, None) is False

    # String parsing
    assert check_concurrency_conflict(past.isoformat(), now) is True
    assert check_concurrency_conflict(future.isoformat(), now) is False

    # Invalid string -> No conflict
    assert check_concurrency_conflict("invalid", now) is False

    # Invalid type -> No conflict (and prints error)
    assert check_concurrency_conflict(123, now) is False


def test_decode_filters():
    # Test None
    assert decode_filters(None) == []

    # Test simple filter
    filters = ["name:test"]
    decoded = decode_filters(filters)
    assert len(decoded) == 1
    assert decoded[0].field_name == "name"
    assert decoded[0].value == "test"
    assert decoded[0].match_type == "exact"

    # Test partial match
    filters = ["name:test:p"]
    decoded = decode_filters(filters)
    assert decoded[0].match_type == "partial"

    # Test comparison
    filters = ["age:10:e:>"]
    decoded = decode_filters(filters)
    assert decoded[0].comparison == ">"

    # Test special values
    filters = ["val:~null", "val:~empty", "val:~true", "val:~false"]
    decoded = decode_filters(filters)
    assert decoded[0].value is None
    assert decoded[1].value == ""
    assert decoded[2].value is True
    assert decoded[3].value is False

    # Test invalid format
    with pytest.raises(ValueError):
        decode_filters(["invalid"])

    # Test invalid match type
    with pytest.raises(ValueError):
        decode_filters(["name:test:x"])

    # Test invalid comparison
    with pytest.raises(ValueError):
        decode_filters(["name:test:e:x"])
