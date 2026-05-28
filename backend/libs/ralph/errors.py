"""Custom exceptions for the Ralph assistant runtime."""


class RalphError(Exception):
    """Base exception for Ralph-specific runtime failures."""


class MissingPlanError(RalphError):
    """Raised when code requires a generated plan but none is available."""

    def __init__(self) -> None:
        super().__init__("Cannot judge objective before a plan exists.")


class EmptyArtifactPathError(RalphError, KeyError):
    """Raised when an artifact property path is empty."""

    def __init__(self) -> None:
        super().__init__("Artifact property path cannot be empty.")


class ArtifactPathError(RalphError, KeyError):
    """Base class for artifact path parsing and navigation failures."""


class ArtifactNotFoundError(ArtifactPathError):
    """Raised when an artifact key is not present in the run context."""

    def __init__(self, *, key: str, available_keys: list[str]) -> None:
        available = ", ".join(sorted(available_keys)) or "<none>"
        super().__init__(
            f"Artifact {key!r} was not found. Available artifacts: {available}."
        )


class ArtifactPropertyReadError(ArtifactPathError):
    """Raised when a full artifact property path cannot be read."""

    def __init__(self, *, path: str, cause: Exception, available_keys: list[str]) -> None:
        available = ", ".join(available_keys) or "<none>"
        cause_message = cause.args[0] if isinstance(cause, KeyError) and cause.args else str(cause)
        super().__init__(
            f"Could not read artifact property path {path!r}: {cause_message}. "
            "Use a full artifact path such as `artifact.path` or `artifact[0].path` with a real artifact key. "
            f"Available artifacts: {available}."
        )


class MissingArtifactKeyInPathError(ArtifactPathError):
    """Raised when a path starts with a property/index but no artifact key."""

    def __init__(self, *, path: str) -> None:
        super().__init__(f"Artifact key is missing in path {path!r}.")


class EmptyPropertyPathError(ArtifactPathError):
    """Raised when a nested property path is empty."""

    def __init__(self) -> None:
        super().__init__("Property path cannot be empty.")


class InvalidPropertyPathError(ArtifactPathError):
    """Raised when a nested property path cannot be parsed."""

    def __init__(self, *, path: str) -> None:
        super().__init__(f"Invalid property path {path!r}")


class UnclosedListIndexPathError(ArtifactPathError):
    """Raised when a list index segment is missing its closing bracket."""

    def __init__(self, *, path: str) -> None:
        super().__init__(f"Unclosed list index in path {path!r}")


class InvalidListIndexPathError(ArtifactPathError):
    """Raised when a list index segment is not a concrete integer."""

    def __init__(self, *, index_text: str, path: str) -> None:
        super().__init__(
            f"Invalid list index {index_text!r} in path {path!r}. "
            "Use a concrete numeric index like [0]. Structure observations may show [list_len=N] only as a size hint."
        )


class ExpectedListInPathError(ArtifactPathError):
    """Raised when a path indexes a value that is not a list."""

    def __init__(self, *, index: int, path: str) -> None:
        super().__init__(f"Expected list before index [{index}] in path {path!r}")


class MissingPropertyInPathError(ArtifactPathError):
    """Raised when a path names a missing dictionary key."""

    def __init__(self, *, property_name: str, path: str) -> None:
        super().__init__(f"Property {property_name!r} was not found in path {path!r}")


class CannotAccessPropertyPathError(ArtifactPathError):
    """Raised when a property segment is applied to a non-object value."""

    def __init__(self, *, property_name: str, value_type: str) -> None:
        super().__init__(
            f"Cannot access property {property_name!r} on value of type {value_type}"
        )


class EvidenceTooLargeError(RalphError, ValueError):
    """Raised when create_evidence produces a display that exceeds the size limit."""

    def __init__(self, *, max_size: int, actual_size: int, possible_paths: list[str]) -> None:
        super().__init__(
            "Evidence display is too large. Be more precise by selecting a narrower `path` or "
            "adding `conditions`. Use `get_artifact_structure` to inspect possible paths. "
            f"max_size={max_size}, actual_size={actual_size}, possible_paths={possible_paths}"
        )


class EvidenceFromStructureArtifactError(RalphError, ValueError):
    """Raised when create_evidence is called with a get_artifact_structure output."""

    def __init__(self) -> None:
        super().__init__(
            "Cannot create evidence from a `get_artifact_structure` output — it contains path names, "
            "not actual data. Use it only to discover paths, then create evidence from the original artifact."
        )
