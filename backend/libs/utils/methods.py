from typing import Any, TypeVar

from pydantic import BaseModel

KeyType = TypeVar("KeyType")

# A patch merges into what is stored, so an absent key means "leave it alone" and there is no way
# to say "drop it". This value says it: send it for a key and the key goes.
REMOVE_VALUE = "~null~"


def deep_update(
    mapping: dict[KeyType, Any], *updating_mappings: dict[KeyType, Any]
) -> dict[KeyType, Any]:
    """Directly copied from deprecated function pydantic.utils.deep_update"""
    updated_mapping = mapping.copy()
    for updating_mapping in updating_mappings:
        for k, v in updating_mapping.items():
            if v == REMOVE_VALUE:
                updated_mapping.pop(k, None)
            elif (
                k in updated_mapping
                and isinstance(updated_mapping[k], dict)
                and isinstance(v, dict)
            ):
                updated_mapping[k] = deep_update(updated_mapping[k], v)
            else:
                updated_mapping[k] = v
    return updated_mapping

def deep_update_pydantic_object(
    obj: BaseModel, *updating_dict: dict[str, Any]
) -> BaseModel:
    """Deep update a pydantic object without using model_dump to respect the schema and validation of the object."""
    alias_to_field = _build_alias_map(obj)
    for update in updating_dict:
        for key, value in update.items():
            field_name = alias_to_field.get(key, key)
            if value == REMOVE_VALUE:
                _remove_extra_field(obj, field_name)
                continue
            current_value = getattr(obj, field_name, None)
            if isinstance(current_value, BaseModel) and isinstance(value, dict):
                deep_update_pydantic_object(current_value, value)
            elif isinstance(current_value, dict) and isinstance(value, dict):
                setattr(obj, field_name, deep_update(current_value, value))
            else:
                setattr(obj, field_name, value)
    return obj


def _remove_extra_field(obj: BaseModel, field_name: str) -> None:
    """Drop a key a model was never declared with -- what a config carrying arbitrary keys holds.

    A declared field is left alone: it has a type and a default, so it cannot simply cease to exist.
    """
    extra = getattr(obj, "__pydantic_extra__", None)  # a model refusing extras carries no such dict
    if isinstance(extra, dict):
        extra.pop(field_name, None)


def _build_alias_map(obj: BaseModel) -> dict[str, str]:
    """Build a mapping from alias → field name for a Pydantic model."""
    alias_map: dict[str, str] = {}
    for field_name, field_info in type(obj).model_fields.items():
        if field_info.alias:
            alias_map[field_info.alias] = field_name
        if field_info.validation_alias and isinstance(field_info.validation_alias, str):
            alias_map[field_info.validation_alias] = field_name
    return alias_map

