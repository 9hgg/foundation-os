"""Rendering helpers for explicit evidence displays."""

from __future__ import annotations

from .models import Evidence
from .store import EvidenceStore


def render_evidences(evidences: EvidenceStore) -> str:
    """Render all evidences in a store."""

    return render_evidences_list(evidences.all())


def render_evidences_list(evidences: list[Evidence]) -> str:
    """Render a plain list of Evidence objects."""

    lines: list[str] = []
    for evidence in evidences:
        prefix_parts = [f"[{evidence.key}]"]
        if evidence.name:
            prefix_parts.append(evidence.name)
        prefix = " ".join(prefix_parts)
        if evidence.description:
            lines.append(f"{prefix}: {evidence.description}")
        lines.append(f"{evidence.expression}.display() = {evidence.display()}")
    return "\n".join(lines) if lines else "<none>"
