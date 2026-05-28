"""Public entrypoints for the Ralph assistant harness."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .assistants.base_assistant import Assistant
    from .execution.runner import AssistantRunner
    from .state.run_context import AssistantRunContext

__all__ = ["Assistant", "AssistantRunContext", "AssistantRunner"]


def __getattr__(name: str):
    """Lazily import public Ralph symbols to avoid package import cycles."""

    if name == "Assistant":
        from .assistants.base_assistant import Assistant

        return Assistant
    if name == "AssistantRunner":
        from .execution.runner import AssistantRunner

        return AssistantRunner
    if name == "AssistantRunContext":
        from .state.run_context import AssistantRunContext

        return AssistantRunContext
    raise AttributeError(name)
