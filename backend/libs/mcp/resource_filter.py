"""
Resource-aware filter model builder for MCP CRUD tools.

Instead of exposing ``filters: list[str]`` (which small LLMs frequently
misformat), we generate a typed Pydantic ``FieldFilter`` class whose schema
is derived directly from the Resource model being exposed.

The LLM receives a JSON schema that:
- Enumerates the exact field names available on the resource.
- Constrains ``match_type`` to ``"exact"`` | ``"partial"``.
- Constrains ``comparison`` to the legal operator set (or null).

``FieldFilter.to_filter_string()`` converts the validated object back to the
``field:value:match_type[:comparison]`` wire format expected by
``create_crud_endpoints``.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from libs.resource import Resource


def build_field_filter_class(ResourceClass: type[Resource], kind: str) -> type[BaseModel]:
    """
    Build a Pydantic ``FieldFilter`` model whose ``field`` attribute is
    constrained to the actual field names on *ResourceClass*.

    The returned class is named ``<kind>FieldFilter`` so that multiple
    resources registered on the same MCP server produce distinct JSON-schema
    ``$defs`` keys.

    Args:
        ResourceClass: The SQLModel/Pydantic resource whose fields drive the enum.
        kind:          The resource kind string (e.g. ``"team"``).

    Returns:
        A Pydantic model class with fields: ``field``, ``value``,
        ``match_type``, ``comparison``, and a ``to_filter_string()`` method.
    """
    try:
        model_fields = ResourceClass.model_fields
    except AttributeError:
        model_fields = {}

    field_names: list[str] = list(model_fields.keys())

    # Build per-field hints from Pydantic field descriptions so the LLM knows
    # what each field represents when choosing which one to filter on.
    field_hints = {
        name: info.description
        for name, info in model_fields.items()
        if info.description
    }
    field_enum_description = (
        "Name of the field to filter on. Available fields:\n"
        + "\n".join(
            f"  - {name}: {field_hints[name]}" if name in field_hints else f"  - {name}"
            for name in field_names
        )
    )

    class _FieldFilter(BaseModel):
        field: str = Field(
            ...,
            description=field_enum_description,
            json_schema_extra={"enum": field_names},
        )
        value: str | int | float | bool | None = Field(
            None,
            description=(
                "Value to match against the field. "
                "Pass null for NULL, an empty string for empty, "
                "true/false for boolean fields."
            ),
        )
        match_type: Literal["exact", "partial"] = Field(
            "exact",
            description=(
                "'exact' for equality match; "
                "'partial' for case-insensitive substring match (ILIKE)."
            ),
        )
        comparison: Literal["<", ">", "<=", ">=", "<>"] | None = Field(
            None,
            description=(
                "Comparison operator for numeric or datetime fields. "
                "Omit for string equality / substring matching. "
                "'<>' means not-equal."
            ),
        )

        @field_validator("field")
        @classmethod
        def _enforce_field_enum(cls, v: str) -> str:
            if field_names and v not in field_names:
                raise ValueError(
                    f"'{v}' is not a valid field. Choose from: {field_names}"
                )
            return v

        def to_filter_string(self) -> str:
            """Serialise to the ``field:value:match_type[:comparison]`` wire format."""
            if self.value is None:
                val_str = "~null"
            elif self.value is True:
                val_str = "~true"
            elif self.value is False:
                val_str = "~false"
            elif self.value == "":
                val_str = "~empty"
            else:
                val_str = str(self.value)

            parts: list[str] = [self.field, val_str, self.match_type]
            if self.comparison:
                parts.append(self.comparison)
            return ":".join(parts)

    _FieldFilter.__name__ = f"{kind}FieldFilter"
    _FieldFilter.__qualname__ = f"{kind}FieldFilter"
    return _FieldFilter


def filters_to_strings(filters: list[Any] | None) -> list[str]:
    """Convert a list of ``FieldFilter`` instances to wire-format strings."""
    if not filters:
        return []
    result: list[str] = []
    for f in filters:
        if hasattr(f, "to_filter_string"):
            result.append(f.to_filter_string())
        elif isinstance(f, str):
            result.append(f)
    return result
