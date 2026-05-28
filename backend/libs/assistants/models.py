import uuid
from typing import Any

from libs.utils.types import BaseModelWithConfig


class AssistantProcessState(BaseModelWithConfig):
    """Represents the current processing state for an assistant conversation."""

    conversation_id: uuid.UUID
    task_id: uuid.UUID | None = None
    status: str = "idle"  # idle | processing | done | failed | stalled
    message_id: uuid.UUID | None = None  # ID of the generated message when done
    error: str | None = None
    progress: float = 0.0  # 0–100


class AssistantToolInfo(BaseModelWithConfig):
    """Metadata for a single tool available to the assistant background task."""

    name: str
    description: str
    short_description: str | None = None
    input_schema: dict[str, Any] | None = None
    source: str = "mcp"  # "mcp" | "harness" | "app"


class AssistantToolsResult(BaseModelWithConfig):
    """Envelope returned by the list-tools endpoint."""

    tools: list[AssistantToolInfo]
