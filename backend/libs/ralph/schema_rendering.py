"""Dense type and schema rendering helpers for compact prompt displays."""

from __future__ import annotations

import dataclasses
import inspect
import types
from typing import Any, Union, get_args, get_origin, get_type_hints

from pydantic import BaseModel


def type_to_str(tp: Any) -> str:
    """Render one Python annotation into a compact readable type string."""

    if tp is inspect.Signature.empty:
        return "Any"
    if tp is Any:
        return "Any"
    if tp is type(None):
        return "None"

    origin = get_origin(tp)
    if origin is list:
        args = get_args(tp)
        inner = type_to_str(args[0]) if args else "Any"
        return f"list[{inner}]"
    if origin is dict:
        args = get_args(tp)
        key_type = type_to_str(args[0]) if len(args) > 0 else "Any"
        value_type = type_to_str(args[1]) if len(args) > 1 else "Any"
        return f"dict[{key_type}, {value_type}]"
    if origin is tuple:
        args = get_args(tp)
        inner = ", ".join(type_to_str(arg) for arg in args) if args else "Any"
        return f"tuple[{inner}]"
    if origin in (Union, types.UnionType):
        args = get_args(tp)
        non_none_args = [arg for arg in args if arg is not type(None)]
        if len(non_none_args) == 1 and len(non_none_args) != len(args):
            return f"{type_to_str(non_none_args[0])}?"
        return " | ".join(type_to_str(arg) for arg in args)

    if origin is not None:
        origin_name = getattr(origin, "__name__", str(origin))
        args = get_args(tp)
        if args:
            return f"{origin_name}[{', '.join(type_to_str(arg) for arg in args)}]"
        return origin_name

    if isinstance(tp, type) and issubclass(tp, BaseModel):
        return dense_model_description(tp)
    if isinstance(tp, type) and dataclasses.is_dataclass(tp):
        return dense_dataclass_description(tp)
    if _is_typed_dict_type(tp):
        return dense_typed_dict_description(tp)
    if hasattr(tp, "__name__"):
        return tp.__name__
    return str(tp)


def dense_model_description(model: type[BaseModel], *, _seen: set[type[BaseModel]] | None = None) -> str:
    """Render one Pydantic model as a compact field signature."""

    seen = set(_seen or set())
    if model in seen:
        return model.__name__
    seen.add(model)

    parts: list[str] = []
    for name, field in model.model_fields.items():
        annotation = field.annotation
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            type_repr = dense_model_description(annotation, _seen=seen)
        else:
            type_repr = type_to_str(annotation)
        required = "!" if field.is_required() else ""
        default = ""
        if not field.is_required() and field.default not in (inspect.Signature.empty, None, ...):
            default = f"={field.default!r}"
        description = f" # {field.description}" if field.description else ""
        parts.append(f'"{name}":{type_repr}{required}{default}{description}')

    return f"{model.__name__}{{{'; '.join(parts)}}}"


def dense_dataclass_description(
    dataclass_type: type[object],
    *,
    _seen: set[type[object]] | None = None,
) -> str:
    """Render one dataclass as a compact field signature."""

    seen = set(_seen or set())
    if dataclass_type in seen:
        return dataclass_type.__name__
    seen.add(dataclass_type)

    type_hints = get_type_hints(dataclass_type)
    parts: list[str] = []
    for field in dataclasses.fields(dataclass_type):
        annotation = type_hints.get(field.name, field.type)
        type_repr = _dense_structured_type(annotation, seen)
        required = "!"
        default = ""
        if field.default is not dataclasses.MISSING:
            required = ""
            if field.default is not None:
                default = f"={field.default!r}"
        elif field.default_factory is not dataclasses.MISSING:  # type: ignore[attr-defined]
            required = ""
            default = "=<factory>"
        parts.append(f'"{field.name}":{type_repr}{required}{default}')

    return f"{dataclass_type.__name__}{{{'; '.join(parts)}}}"


def dense_typed_dict_description(
    typed_dict_type: Any,
    *,
    _seen: set[type[object]] | None = None,
) -> str:
    """Render one TypedDict as a compact field signature."""

    seen = set(_seen or set())
    if typed_dict_type in seen:
        return getattr(typed_dict_type, "__name__", "TypedDict")
    seen.add(typed_dict_type)

    annotations = get_type_hints(typed_dict_type)
    required_keys = set(getattr(typed_dict_type, "__required_keys__", set(annotations.keys())))
    parts: list[str] = []
    for name, annotation in annotations.items():
        type_repr = _dense_structured_type(annotation, seen)
        required = "!" if name in required_keys else ""
        parts.append(f'"{name}":{type_repr}{required}')

    type_name = getattr(typed_dict_type, "__name__", "TypedDict")
    return f"{type_name}{{{'; '.join(parts)}}}"


def compact_json_schema(schema: dict[str, Any] | None) -> str:
    """Render one JSON schema object into a compact readable string."""

    if schema is None:
        return "<none>"
    defs = schema.get("$defs", {}) if isinstance(schema, dict) else {}
    return _compact_json_schema(schema, defs=defs)


def _compact_json_schema(
    schema: Any,
    *,
    defs: dict[str, Any],
    seen_refs: set[str] | None = None,
) -> str:
    if not isinstance(schema, dict):
        return repr(schema)

    seen = set(seen_refs or set())

    if "$ref" in schema:
        ref = str(schema["$ref"])
        ref_name = ref.split("/")[-1]
        if ref_name in seen:
            return ref_name
        target = defs.get(ref_name)
        if target is None:
            return ref_name
        seen.add(ref_name)
        return _compact_json_schema(target, defs=defs, seen_refs=seen)

    if "enum" in schema:
        return " | ".join(repr(item) for item in schema["enum"])

    if "const" in schema:
        return repr(schema["const"])

    if "anyOf" in schema:
        options = [_compact_json_schema(option, defs=defs, seen_refs=seen) for option in schema["anyOf"]]
        non_null = [option for option in options if option != "None"]
        if len(non_null) == 1 and len(non_null) != len(options):
            return f"{non_null[0]}?"
        return " | ".join(options)

    if "oneOf" in schema:
        options = [_compact_json_schema(option, defs=defs, seen_refs=seen) for option in schema["oneOf"]]
        return " | ".join(options)

    schema_type = schema.get("type")
    python_type = schema.get("python_type")

    if schema_type == "array":
        item_schema = schema.get("items", {})
        return f"list[{_compact_json_schema(item_schema, defs=defs, seen_refs=seen)}]"

    if schema_type == "object":
        properties = schema.get("properties")
        if isinstance(properties, dict):
            title = str(schema.get("title") or "")
            required_fields = set(schema.get("required", []))
            field_parts: list[str] = []
            for field_name, field_schema in properties.items():
                field_repr = _compact_json_schema(field_schema, defs=defs, seen_refs=seen)
                required = "!" if field_name in required_fields else ""
                default = ""
                if isinstance(field_schema, dict) and "default" in field_schema and field_schema["default"] is not None:
                    default = f"={field_schema['default']!r}"
                description = ""
                if isinstance(field_schema, dict) and field_schema.get("description"):
                    description = f" # {field_schema['description']}"
                field_parts.append(f'"{field_name}":{field_repr}{required}{default}{description}')
            rendered = f"{{{'; '.join(field_parts)}}}"
            if title and not title.startswith("_"):
                return f"{title}{rendered}"
            return rendered
        if schema.get("additionalProperties") is True:
            return "dict[str, Any]"
        if isinstance(schema.get("additionalProperties"), dict):
            value_repr = _compact_json_schema(schema["additionalProperties"], defs=defs, seen_refs=seen)
            return f"dict[str, {value_repr}]"
        if isinstance(python_type, str):
            return python_type
        return "object"

    if schema_type == "string":
        return "str"
    if schema_type == "integer":
        return "int"
    if schema_type == "number":
        return "float"
    if schema_type == "boolean":
        return "bool"
    if schema_type == "null":
        return "None"
    if schema_type == "any":
        return "Any"

    if isinstance(python_type, str):
        return python_type
    return str(schema_type or "Any")


def _dense_structured_type(annotation: Any, seen: set[type[object]]) -> str:
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return dense_model_description(annotation, _seen={item for item in seen if isinstance(item, type)})
    if isinstance(annotation, type) and dataclasses.is_dataclass(annotation):
        return dense_dataclass_description(annotation, _seen=seen)
    if _is_typed_dict_type(annotation):
        return dense_typed_dict_description(annotation, _seen=seen)
    return type_to_str(annotation)


def _is_typed_dict_type(tp: Any) -> bool:
    return (
        isinstance(tp, type)
        and issubclass(tp, dict)
        and hasattr(tp, "__annotations__")
        and hasattr(tp, "__required_keys__")
    )
