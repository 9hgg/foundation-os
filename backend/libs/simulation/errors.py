from typing import Any


def _format_detail_value(value: Any, indent: str = "    ") -> str:
    """Render a single detail value: multi-line strings get unescaped and indented."""
    if isinstance(value, str) and ("\n" in value or "\r" in value):
        lines = value.splitlines()
        return "\n" + "\n".join(f"{indent}{line}" for line in lines)
    return f"{value!r}"


def _format_details(details: dict[str, Any]) -> str:
    """Render a details dict so multi-line string fields are readable."""
    lines = ["details:"]
    for key, value in details.items():
        lines.append(f"  {key}: {_format_detail_value(value)}")
    return "\n".join(lines)


class SimulationError(Exception):
    def __init__(
        self,
        *,
        title: str,
        description: str,
        code: str,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(description)
        self.title = title
        self.description = description
        self.code = code
        self.details = details

    def __str__(self) -> str:
        parts = [f"[{self.title}] {self.description} (code={self.code})"]
        if self.details:
            parts.append(_format_details(self.details))
        return "\n".join(parts)
