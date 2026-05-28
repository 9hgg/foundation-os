from dataclasses import dataclass


@dataclass(frozen=True)
class ResourceDisplayProfile:
    """Display hints owned by resources and consumed by generic MCP clients."""

    kind: str
    title_fields: tuple[str, ...] = ("title", "name", "label", "id")
    subtitle_fields: tuple[str, ...] = ("description",)
    status_fields: tuple[str, ...] = ("status", "state")
    date_fields: tuple[str, ...] = ("time_updated", "updated_at", "time_created", "created_at")
    metadata_fields: tuple[str, ...] = ()
    hidden_fields: tuple[str, ...] = (
        "content",
        "body",
        "html",
        "markdown",
        "text",
        "extra",
        "config",
        "artifacts",
        "embedding",
        "vector",
        "arguments",
    )
