import typing
import uuid
from typing import Generic, TypeVar

from humps import (
    camelize,
    decamelize,
    dekebabize,
    depascalize,
    is_camelcase,
    is_kebabcase,
    is_pascalcase,
)
from pydantic import BaseModel, ConfigDict
from sqlmodel.main import SQLModelConfig

T = TypeVar("T")


AnyCallable = typing.Callable[[typing.Any], typing.Any]
AnyDict = dict[str, typing.Any]


def to_camel(string: str):
    if is_pascalcase(string):
        return camelize(depascalize(string))
    elif is_kebabcase(string):
        return camelize(dekebabize(string))
    else:
        # snakecase or unknown
        return camelize(string)


def to_snake(string: str):
    if is_camelcase(string):
        return decamelize(string)
    elif is_pascalcase(string):
        return depascalize(string)
    elif is_kebabcase(string):
        return dekebabize(string)
    else:
        # snakecase or unknown
        return string


SQLMODEL_BASE_CONFIG_DICT = SQLModelConfig(
    strict=False,
    extra="forbid",
    from_attributes=True,
    alias_generator=to_camel,
    populate_by_name=True,
    arbitrary_types_allowed=True,
    validate_assignment=True,
)


class SQLModelBaseModelWithConfig(BaseModel):
    model_config = SQLMODEL_BASE_CONFIG_DICT


PYDANTIC_BASE_CONFIG_DICT = ConfigDict(
    strict=False,
    extra="forbid",
    from_attributes=True,
    alias_generator=to_camel,
    # populate_by_name=True,
    # populate_by_alias=True,
    validate_by_alias=True,
    validate_by_name=True,
    arbitrary_types_allowed=True,
    validate_assignment=True,
    serialize_by_alias=True, # will be True by default in pydantic v3
    # json_encoders={
    #     uuid.UUID: lambda v: str(v),
    #     # datetime.datetime: lambda v: v.isoformat(),
    #     # datetime.date: lambda v: v.isoformat(),
    #     # datetime.time: lambda v: v.isoformat(),
    # },
)


class BaseModelWithConfig(BaseModel):
    model_config = PYDANTIC_BASE_CONFIG_DICT


class BasicType(SQLModelBaseModelWithConfig):
    # the type itself
    type: typing.Any
    description: str
    title: str
    # private to users (can't be used in app)
    private: bool = False
    #
    kind: str
    example: typing.Any = None
    category: str

    # the true active state depends on the app config
    active: bool = False


def serialize(obj, keep_unserializable=False, ignore_unserializable=False):
    if isinstance(obj, (int, float, str, bool, type(None))):
        # Basic types (int, float, str, bool, None) can be directly serialized.
        return obj
    elif isinstance(obj, list):
        # Recursively serialize each element of a list.
        return [serialize(item, keep_unserializable) for item in obj]
    elif isinstance(obj, dict):
        # Recursively serialize each value of a dictionary.
        return {
            key: serialize(value, keep_unserializable) for key, value in obj.items()
        }
    elif isinstance(obj, uuid.UUID):
        # UUIDs are serialized as strings.
        return str(obj)
    elif isinstance(obj, set):
        # Sets are serialized as lists.
        return serialize(list(obj), keep_unserializable)
    elif hasattr(obj, "model_dump"):
        # Pydantic models are serialized by calling their model_dump method.
        # print(f"Serializing Pydantic model: {obj}")
        return serialize(obj.model_dump(warnings="none"), keep_unserializable)
    elif hasattr(obj, "_asdict"):
        return serialize(obj._asdict(), keep_unserializable)
    # datetime
    elif hasattr(obj, "isoformat"):
        return obj.isoformat()
    else:
        if keep_unserializable:
            return obj
        if ignore_unserializable:
            return "<UNSERIALIZABLE DATA>"
        raise ValueError(f"Unable to serialize object of type {type(obj)}, ({obj})")


class EndpointError(SQLModelBaseModelWithConfig):
    title: str
    description: str | None = None
    code: str | None = None
    details: dict[str, typing.Any] | None = None


class EndpointOutput(BaseModelWithConfig, Generic[T]):
    error: EndpointError | None = None
    result: T | None = None
    message: str | None = None
