"""Artifact storage used to persist large runtime values across a run."""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from pprint import pformat
from typing import Any

from ..errors import (
    ArtifactNotFoundError,
    CannotAccessPropertyPathError,
    EmptyArtifactPathError,
    EmptyPropertyPathError,
    ExpectedListInPathError,
    InvalidListIndexPathError,
    InvalidPropertyPathError,
    MissingArtifactKeyInPathError,
    MissingPropertyInPathError,
    UnclosedListIndexPathError,
)

DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS = int(
    os.getenv(
        "ASSISTANT_ARTIFACT_PREVIEW_MAX_CHARS",
        os.getenv("RALPH_ARTIFACT_PREVIEW_MAX_CHARS", "2000"),
    )
)
DEFAULT_MAX_EVIDENCE_DUMP_SIZE = int(
    os.getenv(
        "ASSISTANT_MAX_EVIDENCE_DUMP_SIZE",
        os.getenv("RALPH_MAX_EVIDENCE_DUMP_SIZE", "2000"),
    )
)
ARTIFACT_CUTOFF_MARKER = "... [TOO MUCH DATA: CUTOFF]"


@dataclass(frozen=True)
class Artifact:
    """Named runtime value with provenance and optional lazy loading."""

    key: str
    value: Any | None = None
    source_step_id: str | None = None
    provenance: str = "step_output"
    loader: Callable[[], Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def load(self) -> Any:
        """Return the full artifact value, resolving lazy loaders if needed."""

        if self.value is not None:
            return self.value
        if self.loader is None:
            return None
        return self.loader()

    def materialize(self) -> Artifact:
        """Return a version of this artifact with its full value loaded."""

        if self.value is not None or self.loader is None:
            return self
        return replace(self, value=self.loader(), loader=None)

    def describe_for_prompt(
        self,
        *,
        preview_chars: int = DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS,
        include_preview: bool = False,
    ) -> dict[str, object]:
        """Return prompt-safe metadata with a small bounded preview."""

        description = {
            "key": self.key,
            "source_step_id": self.source_step_id,
            "provenance": self.provenance,
            "value_type": self._value_type(),
            "size_hint": self._size_hint(),
            "tool_name": self.metadata.get("tool_name"),
            "output_schema": self.metadata.get("output_schema"),
        }
        if include_preview:
            description["preview"] = self._preview(preview_chars=preview_chars)
        return description

    def _value_type(self) -> str:
        """Return a stable human-readable type name."""

        if self.value is None and self.loader is not None:
            return "lazy"
        return type(self.load()).__name__

    def _size_hint(self) -> int | None:
        """Return a lightweight size hint when available."""

        if self.value is None and self.loader is not None:
            return None
        try:
            return len(self.load())  # type: ignore[arg-type]
        except Exception:
            return None

    def _preview(self, *, preview_chars: int) -> str:
        """Return a truncated printable preview of the artifact value."""

        if self.value is None and self.loader is not None:
            return "<lazy artifact>"
        return render_prompt_safe_value(self.load(), preview_chars=preview_chars)


@dataclass
class ArtifactStore:
    """In-memory store of runtime artifacts, keyed by artifact name."""

    _items: dict[str, Artifact] = field(default_factory=dict)

    def put(self, artifact: Artifact) -> Artifact:
        """Insert or replace a pre-built artifact."""

        self._items[artifact.key] = artifact
        return artifact

    def save(
        self,
        key: str,
        value: Any,
        *,
        source_step_id: str | None = None,
        provenance: str = "step_output",
        metadata: dict[str, Any] | None = None,
    ) -> Artifact:
        """Persist an eagerly available artifact and return the stored record."""

        artifact = Artifact(
            key=key,
            value=value,
            source_step_id=source_step_id,
            provenance=provenance,
            metadata=metadata or {},
        )
        self._items[key] = artifact
        return artifact

    def seed(
        self,
        key: str,
        *,
        value: Any | None = None,
        loader: Callable[[], Any] | None = None,
        provenance: str = "preseeded",
        metadata: dict[str, Any] | None = None,
    ) -> Artifact:
        """Persist a pre-seeded artifact, optionally lazily loaded."""

        artifact = Artifact(
            key=key,
            value=value,
            loader=loader,
            provenance=provenance,
            metadata=metadata or {},
        )
        self._items[key] = artifact
        return artifact

    def get_artifact(self, key: str) -> Artifact:
        """Return the artifact record for a required key."""

        try:
            artifact = self._items[key]
        except KeyError as exc:
            raise ArtifactNotFoundError(key=key, available_keys=list(self._items)) from exc
        if artifact.value is None and artifact.loader is not None:
            artifact = artifact.materialize()
            self._items[key] = artifact
        return artifact

    def get(self, key: str) -> Any:
        """Return the fully loaded value for a required artifact."""

        return self.get_artifact(key).load()

    def maybe_get(self, key: str) -> Any | None:
        """Return an artifact value if present, otherwise ``None``."""

        if key not in self._items:
            return None
        return self.get(key)

    def all(self) -> list[Artifact]:
        """Return every saved artifact record."""

        return list(self._items.values())

    def describe_for_prompt(
        self,
        *,
        preview_chars: int = DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS,
        include_preview: bool = False,
    ) -> list[dict[str, object]]:
        """Return prompt-safe metadata for all saved artifacts."""

        return [
            artifact.describe_for_prompt(
                preview_chars=preview_chars,
                include_preview=include_preview,
            )
            for artifact in self.all()
        ]


def render_prompt_safe_value(value: Any, *, preview_chars: int = DEFAULT_ARTIFACT_PREVIEW_MAX_CHARS) -> str:
    """Render a bounded printable preview safe for prompt inclusion."""

    rendered = pformat(value, compact=False, width=100)
    if len(rendered) <= preview_chars:
        return rendered
    return f"{rendered[:preview_chars]}{ARTIFACT_CUTOFF_MARKER}"


def summarize_artifact_paths(
    value: Any,
    *,
    root: str,
    max_paths: int = 100,
) -> list[str]:
    """Summarize likely navigable paths for one artifact without dumping its content.

    List segments use ``[list_len=N]`` only as a size hint, where ``N`` is the
    number of items in the list. It is deliberately not valid path syntax.
    """

    paths: list[str] = []
    seen: set[str] = set()

    def add(path: str) -> None:
        if path in seen or len(paths) >= max_paths:
            return
        seen.add(path)
        paths.append(path)

    def walk(current: Any, current_path: str) -> None:
        if len(paths) >= max_paths:
            return
        if isinstance(current, dict):
            if not current:
                add(current_path)
                return
            for key, item in current.items():
                child_path = f"{current_path}.{key}" if current_path else str(key)
                if isinstance(item, (dict, list)):
                    walk(item, child_path)
                else:
                    add(child_path)
            return
        if isinstance(current, list):
            list_path = f"{current_path}[list_len={len(current)}]"
            if not current:
                add(list_path)
                return
            first_item = current[0]
            if isinstance(first_item, (dict, list)):
                walk(first_item, list_path)
            else:
                add(list_path)
            return
        add(current_path)

    walk(value, root)
    return paths


def read_nested_property(value: Any, path: str) -> Any:
    """Read a nested property from a value using ``foo.bar[0].baz`` path syntax."""

    tokens = _parse_property_path(path)
    current = value
    for token in tokens:
        if isinstance(token, int):
            if not isinstance(current, list):
                raise ExpectedListInPathError(index=token, path=path)
            current = current[token]
            continue
        if isinstance(current, dict):
            if token not in current:
                raise MissingPropertyInPathError(property_name=token, path=path)
            current = current[token]
            continue
        raise CannotAccessPropertyPathError(
            property_name=token,
            value_type=type(current).__name__,
        )
    return current


def split_artifact_path(path: str) -> tuple[str, str]:
    """Split ``artifact[0].field`` into artifact key and relative property path."""

    cleaned = path.strip()
    if not cleaned:
        raise EmptyArtifactPathError()

    separators = [
        index
        for index in (cleaned.find("."), cleaned.find("["))
        if index != -1
    ]
    split_at = min(separators) if separators else len(cleaned)
    artifact_key = cleaned[:split_at].strip()
    if not artifact_key:
        raise MissingArtifactKeyInPathError(path=path)
    relative_path = cleaned[split_at:].strip()
    if relative_path.startswith("."):
        relative_path = relative_path[1:].strip()
    return artifact_key, relative_path


def _parse_property_path(path: str) -> list[str | int]:
    """Parse ``artifact.result.data[0]`` style paths into navigation tokens."""

    cleaned = path.strip()
    if not cleaned:
        raise EmptyPropertyPathError()

    tokens: list[str | int] = []
    i = 0
    while i < len(cleaned):
        if cleaned[i] == ".":
            i += 1
            continue
        if cleaned[i] == "[":
            end = cleaned.find("]", i)
            if end == -1:
                raise UnclosedListIndexPathError(path=path)
            index_text = cleaned[i + 1 : end].strip()
            if not index_text.isdigit():
                raise InvalidListIndexPathError(index_text=index_text, path=path)
            tokens.append(int(index_text))
            i = end + 1
            continue

        start = i
        while i < len(cleaned) and cleaned[i] not in ".[":
            i += 1
        token = cleaned[start:i].strip()
        if token:
            tokens.append(token)

    if not tokens:
        raise InvalidPropertyPathError(path=path)
    return tokens
