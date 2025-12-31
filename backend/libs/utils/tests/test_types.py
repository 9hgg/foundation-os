import pytest
import uuid
from datetime import datetime
from libs.utils.types import serialize, to_camel, to_snake


def test_serialize():
    # Basic types
    assert serialize(1) == 1
    assert serialize("s") == "s"
    assert serialize(True) is True
    assert serialize(None) is None

    # List
    assert serialize([1, "s"]) == [1, "s"]

    # Dict
    assert serialize({"a": 1}) == {"a": 1}

    # UUID
    u = uuid.uuid4()
    assert serialize(u) == str(u)

    # Set
    assert sorted(serialize({1, 2})) == [1, 2]

    # Datetime
    dt = datetime(2023, 1, 1)
    assert serialize(dt) == dt.isoformat()

    # Object with model_dump (Pydantic)
    class MockModel:
        def model_dump(self, warnings=None):
            return {"x": 1}

    assert serialize(MockModel()) == {"x": 1}

    # Object with _asdict (NamedTuple)
    class MockTuple:
        def _asdict(self):
            return {"y": 2}

    assert serialize(MockTuple()) == {"y": 2}

    # Unserializable
    class Unserializable:
        pass

    with pytest.raises(ValueError):
        serialize(Unserializable())

    assert serialize(Unserializable(), keep_unserializable=True) is not None
    assert serialize(Unserializable(), ignore_unserializable=True) == "<UNSERIALIZABLE DATA>"


def test_to_camel():
    assert to_camel("snake_case") == "snakeCase"
    assert to_camel("camelCase") == "camelCase"
    assert to_camel("PascalCase") == "pascalCase"
    assert to_camel("kebab-case") == "kebabCase"


def test_to_snake():
    assert to_snake("camelCase") == "camel_case"
    assert to_snake("snake_case") == "snake_case"
    assert to_snake("PascalCase") == "pascal_case"
    assert to_snake("kebab-case") == "kebab_case"
