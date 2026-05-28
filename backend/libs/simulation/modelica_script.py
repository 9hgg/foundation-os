"""Structured manipulation of a Modelica script.

Provides :class:`ModelicaScript` to build, edit and serialize a Modelica model
through small targeted operations (add/edit/remove variables and equations),
always emitting syntactically valid source.

The class does not parse arbitrary Modelica — it owns its internal structure
and renders source from it. Use ``compile_to_fmu()`` to actually validate the
model against OpenModelica.
"""

from __future__ import annotations

import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Literal

from pydantic import Field

from libs.simulation.fmu_methods import run_simulation_from_local_path
from libs.simulation.modelica_methods import convert_modelica_script_to_fmu
from libs.simulation.models import ModelicaConvertResult
from libs.utils.types import BaseModelWithConfig

VariableKind = Literal[
    "",
    "parameter",
    "constant",
    "discrete",
    "input",
    "output",
    "flow",
    "stream",
]
ClassKind = Literal[
    "model",
    "class",
    "function",
    "block",
    "record",
    "connector",
    "package",
    "type",
]
_SUPPORTED_CLASS_KINDS: tuple[str, ...] = (
    "model",
    "class",
    "function",
    "block",
    "record",
    "connector",
    "package",
    "type",
)

# Modelica reserved keywords and built-ins to ignore when extracting identifiers
# from equations. Anything else that looks like a name should resolve to a declared
# variable, otherwise it is reported as missing.
_MODELICA_KEYWORDS: frozenset[str] = frozenset({
    "algorithm", "and", "annotation", "block", "break", "class", "connect",
    "connector", "constant", "constrainedby", "der", "discrete", "each", "else",
    "elseif", "elsewhen", "encapsulated", "end", "enumeration", "equation",
    "expandable", "extends", "external", "false", "final", "flow", "for",
    "function", "if", "import", "impure", "in", "initial", "inner", "input",
    "loop", "model", "not", "operator", "or", "outer", "output", "package",
    "parameter", "partial", "protected", "public", "pure", "record", "redeclare",
    "replaceable", "return", "stream", "then", "true", "type", "when", "while",
    "within",
})
_MODELICA_BUILTINS: frozenset[str] = frozenset({
    "abs", "sign", "sqrt", "div", "mod", "rem", "ceil", "floor", "integer",
    "min", "max", "sum", "product", "delay", "cardinality", "homotopy",
    "semiLinear", "inStream", "actualStream", "noEvent", "smooth", "edge",
    "change", "reinit", "previous", "pre", "sample", "time", "terminal",
    # math
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
    "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
    "exp", "log", "log10",
    # constants commonly referenced by name
    "pi",
})
_IDENTIFIER_RE = re.compile(r"\b[A-Za-z_][A-Za-z_0-9]*\b")
_STRING_LITERAL_RE = re.compile(r'"(?:[^"\\]|\\.)*"')


class ModelicaVariable(BaseModelWithConfig):
    """A single variable declaration in a Modelica model.

    Examples
    --------
    >>> ModelicaVariable(name="g", kind="parameter", value="9.81", comment="gravity").to_source()
    'parameter Real g = 9.81 "gravity";'

    >>> ModelicaVariable(name="h", start="1", comment="height").to_source()
    'Real h(start=1) "height";'
    """

    name: str
    type_name: str = "Real"
    kind: VariableKind = ""
    value: str | None = None
    start: str | None = None
    min_value: str | None = None
    max_value: str | None = None
    fixed: bool | None = None
    unit: str | None = None
    comment: str | None = None
    modifiers: dict[str, str] = Field(default_factory=dict)

    def to_source(self) -> str:
        prefix = []
        if self.kind:
            prefix.append(self.kind)
        prefix.append(self.type_name)

        rendered_modifiers: list[str] = []
        if self.start is not None:
            rendered_modifiers.append(f"start={self.start}")
        if self.min_value is not None:
            rendered_modifiers.append(f"min={self.min_value}")
        if self.max_value is not None:
            rendered_modifiers.append(f"max={self.max_value}")
        if self.fixed is not None:
            rendered_modifiers.append(f"fixed={'true' if self.fixed else 'false'}")
        if self.unit is not None:
            rendered_modifiers.append(f'unit="{self.unit}"')
        for key, val in self.modifiers.items():
            rendered_modifiers.append(f"{key}={val}")

        name_token = self.name
        if rendered_modifiers:
            name_token = f"{self.name}({', '.join(rendered_modifiers)})"

        decl = " ".join([*prefix, name_token])
        if self.value is not None:
            decl = f"{decl} = {self.value}"
        if self.comment:
            decl = f'{decl} "{self.comment}"'
        return decl + ";"


class ModelicaCheckIssue(BaseModelWithConfig):
    severity: Literal["error", "warning"]
    code: str
    message: str


class ModelicaCheckReport(BaseModelWithConfig):
    """Result of a static check on a ModelicaScript.

    `ok` is True when there are no error-level issues. Warnings (e.g. unused
    declared variables) do not block compilation.
    """

    ok: bool
    declared_names: list[str] = Field(default_factory=list)
    referenced_names: list[str] = Field(default_factory=list)
    missing_in_equations: list[str] = Field(default_factory=list)
    unused_variables: list[str] = Field(default_factory=list)
    issues: list[ModelicaCheckIssue] = Field(default_factory=list)

    def raise_if_errors(self) -> None:
        errors = [issue for issue in self.issues if issue.severity == "error"]
        if errors:
            details = "\n".join(f"- [{e.code}] {e.message}" for e in errors)
            raise ValueError(f"ModelicaScript check failed:\n{details}")  # noqa: TRY003


def _extract_identifiers(equation: str) -> set[str]:
    """Return identifier-like tokens from an equation, stripping string literals first."""
    sanitized = _STRING_LITERAL_RE.sub("", equation)
    return {match.group(0) for match in _IDENTIFIER_RE.finditer(sanitized)}


def _clean_equation(equation: str) -> str:
    """Normalize an equation string: strip trailing whitespace and the final ';'."""
    stripped = equation.rstrip()
    while stripped.endswith(";"):
        stripped = stripped[:-1].rstrip()
    if not stripped:
        raise ValueError("Equation cannot be empty.")  # noqa: TRY003
    return stripped


def _indent_equation(equation: str, indent: str = "  ") -> list[str]:
    """Indent each line of an equation and ensure the last line ends with ';'."""
    lines = [f"{indent}{line}" for line in equation.splitlines()]
    if not lines:
        return lines
    lines[-1] = lines[-1] + ";"
    return lines


class ModelicaScript(BaseModelWithConfig):
    """A Modelica model maintained as structured data.

    Operations are non-destructive (returning the new state) and validated where
    cheap (no duplicate variable names, no empty equation). Full validation
    requires :meth:`compile_to_fmu`.
    """

    model_name: str
    class_kind: ClassKind = "model"
    description: str | None = None
    within_path: str | None = None
    variables: list[ModelicaVariable] = Field(default_factory=list)
    equations: list[str] = Field(default_factory=list)
    initial_equations: list[str] = Field(default_factory=list)
    algorithms: list[str] = Field(default_factory=list)
    initial_algorithms: list[str] = Field(default_factory=list)
    type_definition: str | None = None

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    @classmethod
    def empty(cls, model_name: str, description: str | None = None) -> ModelicaScript:
        """Build an empty model with the given name."""
        return cls(model_name=model_name, description=description)

    @classmethod
    def from_source(cls, source: str) -> ModelicaScript:
        """Parse Modelica source into a ModelicaScript.

        Strict: raises :class:`UnsupportedModelicaFeatureError` on any construct
        the class cannot currently represent (annotations, extends, packages,
        algorithm sections, component modifier blocks beyond start/min/max/fixed/unit,
        `within` clauses, etc.). Use to iteratively grow the supported subset.
        """
        return _parse_modelica_source(source)

    @classmethod
    def from_file(cls, path: str | Path) -> ModelicaScript:
        """Load a Modelica file and parse it. See :meth:`from_source`."""
        return cls.from_source(Path(path).read_text(encoding="utf-8"))

    # ------------------------------------------------------------------
    # Variables
    # ------------------------------------------------------------------

    def has_variable(self, name: str) -> bool:
        return any(var.name == name for var in self.variables)

    def get_variable(self, name: str) -> ModelicaVariable:
        for var in self.variables:
            if var.name == name:
                return var
        raise KeyError(name)

    def list_variables(self) -> list[ModelicaVariable]:
        return list(self.variables)

    def add_variable(self, **fields: Any) -> ModelicaVariable:
        """Append a new variable. Raises if the name already exists."""
        variable = ModelicaVariable(**fields)
        if self.has_variable(variable.name):
            raise ValueError(  # noqa: TRY003
                f"Variable {variable.name!r} already exists; use edit_variable to modify it."
            )
        self.variables.append(variable)
        return variable

    def edit_variable(self, name: str, **changes: Any) -> ModelicaVariable:
        """Modify named fields of an existing variable. Returns the updated variable."""
        for index, var in enumerate(self.variables):
            if var.name == name:
                updated = var.model_copy(update=changes)
                self.variables[index] = updated
                return updated
        raise KeyError(name)

    def remove_variable(self, name: str) -> ModelicaVariable:
        for index, var in enumerate(self.variables):
            if var.name == name:
                return self.variables.pop(index)
        raise KeyError(name)

    # ------------------------------------------------------------------
    # Equations
    # ------------------------------------------------------------------

    def list_equations(self) -> list[str]:
        return list(self.equations)

    def add_equation(self, equation: str) -> int:
        """Append an equation. Returns its index. The string may be multi-line."""
        cleaned = _clean_equation(equation)
        self.equations.append(cleaned)
        return len(self.equations) - 1

    def edit_equation(self, index: int, equation: str) -> str:
        self._check_equation_index(index)
        cleaned = _clean_equation(equation)
        self.equations[index] = cleaned
        return cleaned

    def remove_equation(self, index: int) -> str:
        self._check_equation_index(index)
        return self.equations.pop(index)

    def add_when_clause(self, condition: str, body: str | list[str]) -> int:
        """Append a when-clause equation. body may be a single statement or a list."""
        body_lines = body if isinstance(body, list) else [body]
        cleaned_body = [_clean_equation(line) + ";" for line in body_lines]
        block = "\n".join(
            [f"when {condition} then", *(f"  {line}" for line in cleaned_body), "end when"]
        )
        return self.add_equation(block)

    def add_initial_equation(self, equation: str) -> int:
        cleaned = _clean_equation(equation)
        self.initial_equations.append(cleaned)
        return len(self.initial_equations) - 1

    def _check_equation_index(self, index: int) -> None:
        if not -len(self.equations) <= index < len(self.equations):
            raise IndexError(  # noqa: TRY003
                f"Equation index {index} out of range (total={len(self.equations)})"
            )

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------

    def to_source(self) -> str:
        """Render the model as valid Modelica source."""
        lines: list[str] = []
        if self.within_path:
            lines.append(f"within {self.within_path};")
        if self.class_kind == "type":
            definition = self.type_definition or "Real"
            header = f"type {self.model_name} = {definition}"
            if self.description:
                header += f' "{self.description}"'
            lines.append(f"{header};")
            return "\n".join(lines) + "\n"

        header = f"{self.class_kind} {self.model_name}"
        if self.description:
            header += f' "{self.description}"'
        lines.append(header)

        for var in self.variables:
            lines.append(f"  {var.to_source()}")

        if self.initial_equations:
            lines.append("initial equation")
            for equation in self.initial_equations:
                lines.extend(_indent_equation(equation))

        if self.initial_algorithms:
            lines.append("initial algorithm")
            for statement in self.initial_algorithms:
                lines.extend(_indent_equation(statement))

        if self.equations:
            lines.append("equation")
            for equation in self.equations:
                lines.extend(_indent_equation(equation))

        if self.algorithms:
            lines.append("algorithm")
            for statement in self.algorithms:
                lines.extend(_indent_equation(statement))

        lines.append(f"end {self.model_name};")
        return "\n".join(lines) + "\n"

    def __str__(self) -> str:
        return self.to_source()

    # ------------------------------------------------------------------
    # I/O and compilation
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # Static checks
    # ------------------------------------------------------------------

    def check_state(self) -> ModelicaCheckReport:
        """Static lint: ensure every identifier used in equations is declared.

        This catches typos and forgotten declarations before invoking OpenModelica.
        It does NOT validate Modelica semantics (over-determined systems,
        differentiability, etc.) — only that every identifier reference resolves.
        """
        declared = {var.name for var in self.variables}
        referenced: set[str] = set()
        for equation in (*self.equations, *self.initial_equations):
            referenced.update(_extract_identifiers(equation))

        unknown = sorted(
            name
            for name in referenced
            if name not in declared
            and name not in _MODELICA_KEYWORDS
            and name not in _MODELICA_BUILTINS
            and not name[0].isdigit()
        )
        unused = sorted(declared - referenced)

        issues: list[ModelicaCheckIssue] = []
        if not self.variables:
            issues.append(
                ModelicaCheckIssue(
                    severity="warning",
                    code="no_variables",
                    message="The model has no declared variables.",
                )
            )
        if not self.equations and not self.initial_equations:
            issues.append(
                ModelicaCheckIssue(
                    severity="warning",
                    code="no_equations",
                    message="The model has no equations.",
                )
            )
        for name in unknown:
            issues.append(
                ModelicaCheckIssue(
                    severity="error",
                    code="undeclared_identifier",
                    message=(
                        f"Identifier {name!r} is referenced in an equation but not "
                        "declared. Declare it with add_variable or fix the equation."
                    ),
                )
            )
        for name in unused:
            issues.append(
                ModelicaCheckIssue(
                    severity="warning",
                    code="unused_variable",
                    message=f"Variable {name!r} is declared but never referenced.",
                )
            )

        return ModelicaCheckReport(
            ok=not any(issue.severity == "error" for issue in issues),
            declared_names=sorted(declared),
            referenced_names=sorted(referenced),
            missing_in_equations=unknown,
            unused_variables=unused,
            issues=issues,
        )

    def save(self, path: str | Path) -> Path:
        """Write the rendered source to disk and return the resolved path."""
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(self.to_source(), encoding="utf-8")
        return target.resolve()

    def compile_to_fmu(
        self,
        *,
        workspace_dir: str | Path,
        model_name: str | None = None,
        skip_check: bool = False,
    ) -> ModelicaConvertResult:
        """Save the script under ``workspace_dir/<model_name>.mo`` and convert to FMU.

        Runs :meth:`check_state` first; if it reports errors, raises before
        spawning OpenModelica. Pass ``skip_check=True`` to bypass.
        """
        if not skip_check:
            self.check_state().raise_if_errors()
        workspace = Path(workspace_dir)
        workspace.mkdir(parents=True, exist_ok=True)
        mo_path = workspace / f"{self.model_name}.mo"
        self.save(mo_path)
        return convert_modelica_script_to_fmu(
            modelica_script_path=str(mo_path),
            model_name=model_name or self.model_name,
        )


# ----------------------------------------------------------------------
# Source loader (strict)
# ----------------------------------------------------------------------


class UnsupportedModelicaFeatureError(ValueError):
    """Raised by ModelicaScript.from_source when the input uses a feature
    the class cannot currently represent.

    Attributes
    ----------
    feature: short name (e.g. "annotation", "extends", "function")
    line: 1-indexed line number where the feature was first seen
    snippet: a short excerpt for diagnostics
    """

    def __init__(
        self,
        feature: str,
        line: int | None = None,
        snippet: str | None = None,
    ) -> None:
        self.feature = feature
        self.line = line
        self.snippet = snippet
        parts = [f"Unsupported Modelica feature: {feature}"]
        if line is not None:
            parts.append(f"(line {line})")
        if snippet:
            short = snippet if len(snippet) <= 120 else snippet[:117] + "..."
            parts.append(f"near: {short!r}")
        super().__init__(" ".join(parts))


def _strip_modelica_comments(source: str) -> str:
    """Strip ``//`` and ``/* */`` comments while preserving string literals."""
    out: list[str] = []
    i = 0
    n = len(source)
    while i < n:
        ch = source[i]
        if ch == '"':
            # consume string literal
            out.append(ch)
            i += 1
            while i < n:
                c = source[i]
                if c == "\\" and i + 1 < n:
                    out.append(c)
                    out.append(source[i + 1])
                    i += 2
                    continue
                out.append(c)
                i += 1
                if c == '"':
                    break
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "/":
            while i < n and source[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "*":
            i += 2
            while i + 1 < n and not (source[i] == "*" and source[i + 1] == "/"):
                if source[i] == "\n":
                    out.append("\n")
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _split_top_level_statements(source: str) -> list[tuple[int, str]]:
    """Split into (line_no, statement) at ``;`` boundaries outside any bracket/string."""
    statements: list[tuple[int, str]] = []
    buf: list[str] = []
    line_no = 1
    start_line = 1
    depth = 0
    in_string = False
    i = 0
    n = len(source)
    while i < n:
        ch = source[i]
        if in_string:
            buf.append(ch)
            if ch == "\\" and i + 1 < n:
                buf.append(source[i + 1])
                i += 2
                continue
            if ch == "\n":
                line_no += 1
            if ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            buf.append(ch)
        elif ch in "([{":
            depth += 1
            buf.append(ch)
        elif ch in ")]}":
            depth -= 1
            buf.append(ch)
        elif ch == ";" and depth == 0:
            stmt = "".join(buf).strip()
            if stmt:
                statements.append((start_line, stmt))
            buf.clear()
            start_line = line_no
        elif ch == "\n":
            line_no += 1
            buf.append(ch)
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append((start_line, tail))
    return statements


def _split_at_top_level(text: str, sep: str) -> list[str]:
    """Split on `sep` at bracket depth 0, respecting string literals."""
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    in_string = False
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if in_string:
            buf.append(ch)
            if ch == "\\" and i + 1 < n:
                buf.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            buf.append(ch)
        elif ch in "([{":
            depth += 1
            buf.append(ch)
        elif ch in ")]}":
            depth -= 1
            buf.append(ch)
        elif ch == sep and depth == 0:
            parts.append("".join(buf).strip())
            buf.clear()
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail or parts:
        parts.append(tail)
    return parts


def _parse_quoted_string(text: str, line_no: int) -> tuple[str, str]:
    """Consume a leading ``"..."`` and return (content, remaining)."""
    if not text.startswith('"'):
        raise UnsupportedModelicaFeatureError("expected_string", line_no, text)
    i = 1
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\" and i + 1 < n:
            i += 2
            continue
        if c == '"':
            return text[1:i], text[i + 1 :]
        i += 1
    raise UnsupportedModelicaFeatureError("unterminated_string", line_no, text)


_TYPE_NAME_RE = re.compile(r"[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*")
_IDENT_RE = re.compile(r"[A-Za-z_][\w]*")
_KIND_PREFIXES = ("parameter", "constant", "discrete", "input", "output", "flow", "stream")
_UNSUPPORTED_DECL_PREFIXES = (
    "annotation",
    "extends",
    "import",
    "redeclare",
    "replaceable",
    "final",
    "inner",
    "outer",
    "protected",
    "public",
)


def _parse_modifier_block(text: str, var_name: str, line_no: int) -> dict[str, str]:
    """Parse ``start=1, min=0, k=2`` into a dict. Accepts any modifier name —
    the caller filters known typed ones into ``ModelicaVariable.start/min/max/fixed/unit``
    and stores the rest in ``ModelicaVariable.modifiers``.
    """
    modifiers: dict[str, str] = {}
    for part in _split_at_top_level(text, ","):
        if not part:
            continue
        if "=" not in part:
            modifiers[part.strip()] = "true"
            continue
        k, _, v = part.partition("=")
        modifiers[k.strip()] = v.strip()
    return modifiers


def _parse_variable_declaration(stmt: str, line_no: int) -> ModelicaVariable:
    """Parse a single variable declaration. Raises on anything unsupported."""
    s = stmt.strip()

    for unsupported in _UNSUPPORTED_DECL_PREFIXES:
        if s.startswith(unsupported + " ") or s == unsupported or s.startswith(unsupported + "("):
            raise UnsupportedModelicaFeatureError(unsupported, line_no, stmt)

    kind = ""
    for prefix in _KIND_PREFIXES:
        if s.startswith(prefix + " "):
            kind = prefix
            s = s[len(prefix) :].lstrip()
            break

    type_match = _TYPE_NAME_RE.match(s)
    if not type_match:
        raise UnsupportedModelicaFeatureError("unparsable_type", line_no, stmt)
    type_name = type_match.group(0)
    s = s[type_match.end() :].lstrip()

    name_match = _IDENT_RE.match(s)
    if not name_match:
        raise UnsupportedModelicaFeatureError("unparsable_name", line_no, stmt)
    name = name_match.group(0)
    s = s[name_match.end() :].lstrip()

    # Optional array dimensions on the name: `T[Ns + 1]` or `M[NCEL, NROW]`.
    # Treat them as part of the name string so the round-trip preserves them.
    array_dims: str | None = None
    if s.startswith("["):
        depth = 1
        i = 1
        while i < len(s) and depth > 0:
            if s[i] == "[":
                depth += 1
            elif s[i] == "]":
                depth -= 1
            i += 1
        if depth != 0:
            raise UnsupportedModelicaFeatureError(
                "unmatched_bracket", line_no, stmt
            )
        array_dims = s[1 : i - 1]
        name = f"{name}[{array_dims}]"
        s = s[i:].lstrip()

    modifiers_text: str | None = None
    if s.startswith("("):
        depth = 1
        i = 1
        while i < len(s) and depth > 0:
            if s[i] == "(":
                depth += 1
            elif s[i] == ")":
                depth -= 1
            i += 1
        if depth != 0:
            raise UnsupportedModelicaFeatureError("unmatched_paren", line_no, stmt)
        modifiers_text = s[1 : i - 1]
        s = s[i:].lstrip()

    value: str | None = None
    if s.startswith("="):
        s = s[1:].lstrip()
        # value runs until the start of an optional comment string, "annotation", or end
        if s.startswith('"'):
            parsed_value, s = _parse_quoted_string(s, line_no)
            value = f'"{parsed_value}"'
            s = s.lstrip()
        else:
            annotation_idx = s.find("annotation")
            quote_idx = s.find('"')
            # Pick the earliest valid stop
            candidates = [c for c in (annotation_idx, quote_idx) if c >= 0]
            cut = min(candidates) if candidates else len(s)
            value = s[:cut].strip()
            s = s[cut:].lstrip()

    comment: str | None = None
    if s.startswith('"'):
        comment, s = _parse_quoted_string(s, line_no)
        s = s.lstrip()

    # Drop trailing annotation(...) blob if present
    if s.startswith("annotation"):
        s = s[len("annotation") :].lstrip()
        if not s.startswith("("):
            raise UnsupportedModelicaFeatureError(
                "variable_annotation_malformed", line_no, stmt
            )
        depth = 1
        i = 1
        while i < len(s) and depth > 0:
            if s[i] == "(":
                depth += 1
            elif s[i] == ")":
                depth -= 1
            i += 1
        if depth != 0:
            raise UnsupportedModelicaFeatureError(
                "variable_annotation_unmatched_paren", line_no, stmt
            )
        s = s[i:].lstrip()

    if s:
        raise UnsupportedModelicaFeatureError("trailing_content", line_no, stmt)

    modifier_fields: dict[str, Any] = {}
    if modifiers_text is not None:
        parsed = _parse_modifier_block(modifiers_text, name, line_no)
        typed_keys = {"start", "min", "max", "fixed", "unit"}
        if "start" in parsed:
            modifier_fields["start"] = parsed["start"]
        if "min" in parsed:
            modifier_fields["min_value"] = parsed["min"]
        if "max" in parsed:
            modifier_fields["max_value"] = parsed["max"]
        if "fixed" in parsed:
            modifier_fields["fixed"] = parsed["fixed"].lower() == "true"
        if "unit" in parsed:
            modifier_fields["unit"] = parsed["unit"].strip('"')
        extras = {k: v for k, v in parsed.items() if k not in typed_keys}
        if extras:
            modifier_fields["modifiers"] = extras

    return ModelicaVariable(
        name=name,
        type_name=type_name,
        kind=kind,
        value=value,
        comment=comment,
        **modifier_fields,
    )


def _parse_class_header(stmt: str, line_no: int) -> tuple[str, str, str | None, str]:
    """Parse ``model X "description"`` and return (kind, name, description, remainder).

    Modelica has no ``;`` after the class header, so the splitter glues the
    header to the first body statement. We peel the header off and return what
    follows for the caller to re-process as a body statement.
    """
    s = stmt.strip()
    head = s.split(maxsplit=1)[0]
    if head not in _SUPPORTED_CLASS_KINDS:
        raise UnsupportedModelicaFeatureError(
            f"class_keyword:{s.split()[0]}", line_no, stmt
        )
    s = s[len(head) :].lstrip()
    name_match = _IDENT_RE.match(s)
    if not name_match:
        raise UnsupportedModelicaFeatureError("unparsable_class_name", line_no, stmt)
    name = name_match.group(0)
    rest = s[name_match.end() :].lstrip()
    description: str | None = None
    if head == "type" and rest.startswith("="):
        rest = rest[1:].lstrip()
        annotation_idx = rest.find("annotation")
        quote_idx = rest.find('"')
        candidates = [c for c in (annotation_idx, quote_idx) if c >= 0]
        cut = min(candidates) if candidates else len(rest)
        type_definition = rest[:cut].strip()
        rest = rest[cut:].lstrip()
        if rest.startswith('"'):
            description, rest = _parse_quoted_string(rest, line_no)
            rest = rest.lstrip()
        if rest.startswith("annotation"):
            rest = ""
        return head, name, description, rest.lstrip() or type_definition
    if rest.startswith('"'):
        description, rest = _parse_quoted_string(rest, line_no)
    return head, name, description, rest.lstrip()


def _parse_model_header(stmt: str, line_no: int) -> tuple[str, str | None, str]:
    kind, name, description, remainder = _parse_class_header(stmt, line_no)
    if kind != "model":
        raise UnsupportedModelicaFeatureError(f"class_keyword:{kind}", line_no, stmt)
    return name, description, remainder


def _parse_modelica_source(source: str) -> ModelicaScript:
    # Strip BOM if present (some Modelica editors emit UTF-8 BOM).
    if source.startswith("﻿"):
        source = source[1:]
    cleaned = _strip_modelica_comments(source)
    statements = _split_top_level_statements(cleaned)
    if not statements:
        raise UnsupportedModelicaFeatureError("empty_source", 1, None)

    state: dict[str, Any] = {
        "model_name": None,
        "class_kind": "model",
        "description": None,
        "within_path": None,
        "variables": [],
        "equations": [],
        "initial_equations": [],
        "algorithms": [],
        "initial_algorithms": [],
        "type_definition": None,
        "section": "HEADER",
        "skip_class_name": None,
    }

    last_line_no = 1
    for line_no, stmt in statements:
        last_line_no = line_no
        _consume_statement(stmt.strip(), line_no, state)

    if state["section"] != "DONE":
        raise UnsupportedModelicaFeatureError(
            f"unterminated_section:{state['section']}", last_line_no, None
        )
    if state["model_name"] is None:
        raise UnsupportedModelicaFeatureError("missing_model_header", 1, None)

    return ModelicaScript(
        model_name=state["model_name"],
        class_kind=state["class_kind"],
        description=state["description"],
        within_path=state["within_path"],
        variables=state["variables"],
        equations=state["equations"],
        initial_equations=state["initial_equations"],
        algorithms=state["algorithms"],
        initial_algorithms=state["initial_algorithms"],
        type_definition=state["type_definition"],
    )


_BLOCK_OPEN_KEYWORDS = {"if", "when", "for", "while"}
_BLOCK_CLOSE_KEYWORDS = {"if", "when", "for", "while", "loop"}


def _count_block_changes(stmt: str) -> int:
    """Approximate nested block depth change (opens - closes) in a statement.

    Scans line-starts only — only counts ``if/when/for/while`` and ``end <kw>``
    that begin a (whitespace-stripped) line. Robust enough for typical
    Modelica formatting; an `if` used inside an expression won't be at line start.
    """
    non_empty_lines = [line.strip() for line in stmt.split("\n") if line.strip()]
    if not non_empty_lines:
        return 0
    first_statement_token = non_empty_lines[0].split(maxsplit=1)[0]
    if first_statement_token not in {*_BLOCK_OPEN_KEYWORDS, "end"}:
        return 0

    opens = 0
    closes = 0
    paren_depth = 0
    for line in non_empty_lines:
        line_paren_depth = paren_depth
        head = line.split(maxsplit=1)
        first = head[0]
        if line_paren_depth == 0 and first in _BLOCK_OPEN_KEYWORDS:
            opens += 1
        elif line_paren_depth == 0 and first == "end":
            if len(head) > 1:
                target = head[1].split(maxsplit=1)[0].rstrip(";")
                if target in _BLOCK_CLOSE_KEYWORDS:
                    closes += 1
        paren_depth += line.count("(") - line.count(")")
    return opens - closes


def _append_section_statement(stripped: str, state: dict[str, Any]) -> None:
    """Append a statement to the current equation/algorithm section, handling blocks."""
    section = state["section"]
    target_key_by_section = {
        "EQUATIONS": "equations",
        "INITIAL_EQUATIONS": "initial_equations",
        "ALGORITHMS": "algorithms",
        "INITIAL_ALGORITHMS": "initial_algorithms",
    }
    target_key = target_key_by_section[section]
    target = state[target_key]
    depth_change = _count_block_changes(stripped)
    pending: str | None = state.get("pending_statement")

    if pending is None:
        if depth_change <= 0:
            target.append(_clean_equation(stripped))
            return
        state["pending_statement"] = _clean_equation(stripped)
        state["pending_block_depth"] = depth_change
        return

    combined = pending + ";\n" + stripped
    new_depth = state["pending_block_depth"] + depth_change
    if new_depth <= 0:
        target.append(_clean_equation(combined))
        state["pending_statement"] = None
        state["pending_block_depth"] = 0
    else:
        state["pending_statement"] = combined
        state["pending_block_depth"] = new_depth


def _consume_statement(stripped: str, line_no: int, state: dict[str, Any]) -> None:
    """Classify a body statement; recurse on any remainder after a section keyword."""
    while stripped:
        first = stripped.split(maxsplit=1)[0]
        section = state["section"]

        skip_class_name = state.get("skip_class_name")
        if skip_class_name is not None:
            if first == "end" and stripped[len("end") :].strip().rstrip(";").split(maxsplit=1)[0:1] == [skip_class_name]:
                state["skip_class_name"] = None
            return

        if section == "HEADER":
            if first == "within":
                state["within_path"] = stripped[len("within") :].strip() or None
                return
            if first == "partial":
                stripped = stripped[len("partial") :].lstrip()
                continue
            if first in _SUPPORTED_CLASS_KINDS:
                kind, name, description, remainder = _parse_class_header(stripped, line_no)
                if kind == "type":
                    state["model_name"] = name
                    state["class_kind"] = kind
                    state["description"] = description
                    state["type_definition"] = remainder
                    state["section"] = "DONE"
                    return
                state["model_name"] = name
                state["class_kind"] = kind
                state["description"] = description
                state["section"] = "DECLARATIONS"
                stripped = remainder
                continue
            raise UnsupportedModelicaFeatureError(
                f"unexpected_top_level:{first}", line_no, stripped
            )

        # Model-end (only when not inside a pending equation block)
        if (
            first == "end"
            and state.get("pending_statement") is None
            and stripped[len("end") :].strip().rstrip(";").split(maxsplit=1)[0:1]
            == [state["model_name"]]
        ):
            state["section"] = "DONE"
            return
        if first in ("protected", "public"):
            stripped = stripped[len(first) :].lstrip()
            continue
        if (
            stripped == "equation"
            or stripped.startswith("equation\n")
            or stripped.startswith("equation ")
        ):
            stripped = stripped[len("equation") :].lstrip()
            state["section"] = "EQUATIONS"
            continue
        if stripped.startswith("initial equation"):
            stripped = stripped[len("initial equation") :].lstrip()
            state["section"] = "INITIAL_EQUATIONS"
            continue
        if (
            stripped == "algorithm"
            or stripped.startswith("algorithm\n")
            or stripped.startswith("algorithm ")
        ):
            stripped = stripped[len("algorithm") :].lstrip()
            state["section"] = "ALGORITHMS"
            continue
        if stripped.startswith("initial algorithm"):
            stripped = stripped[len("initial algorithm") :].lstrip()
            state["section"] = "INITIAL_ALGORITHMS"
            continue
        if (
            first in ("import", "extends", "annotation")
            or stripped.startswith("annotation(")
            or stripped.startswith("extends(")
        ):
            return
        if first in ("external", "replaceable"):
            return

        if section == "DECLARATIONS":
            if first == "partial":
                stripped = stripped[len("partial") :].lstrip()
                continue
            if first == "replaceable":
                return
            if first == "type":
                return
            if first in _SUPPORTED_CLASS_KINDS:
                _kind, nested_name, _description, _remainder = _parse_class_header(
                    stripped, line_no
                )
                state["skip_class_name"] = nested_name
                return
            state["variables"].append(_parse_variable_declaration(stripped, line_no))
        elif section in ("EQUATIONS", "INITIAL_EQUATIONS", "ALGORITHMS", "INITIAL_ALGORITHMS"):
            _append_section_statement(stripped, state)
        return


# ----------------------------------------------------------------------
# Demo
# ----------------------------------------------------------------------


def _run_demo() -> None:
    """Build → simulate → edit → simulate demo using a damped harmonic oscillator."""
    import pandas as pd

    from libs.simulation.fmu_methods import inspect_fmu_from_local_path

    workspace = Path(tempfile.mkdtemp(prefix="modelica_script_demo_"))
    print(f"Workspace: {workspace}")

    # 1. Build a damped harmonic oscillator from scratch
    script = ModelicaScript.empty(
        model_name="DampedOscillator", description="Mass-spring-damper demo"
    )
    script.add_variable(
        name="m", kind="parameter", value="1.0", comment="mass", unit="kg"
    )
    script.add_variable(
        name="k", kind="parameter", value="10.0", comment="spring constant", unit="N/m"
    )
    script.add_variable(
        name="c", kind="parameter", value="0.1", comment="damping coefficient"
    )
    script.add_variable(name="x", start="1.0", comment="position")
    script.add_variable(name="v", start="0.0", comment="velocity")
    script.add_equation("der(x) = v")
    script.add_equation("m * der(v) = -k * x - c * v")

    print("\n--- Generated source ---")
    print(script.to_source())

    # 1b. Static check before any compilation
    print("\n--- check_state() ---")
    report = script.check_state()
    print(
        f"ok={report.ok} declared={report.declared_names} "
        f"referenced={report.referenced_names}"
    )
    for issue in report.issues:
        print(f"  [{issue.severity}] {issue.code}: {issue.message}")

    # Demonstrate that a typo is caught BEFORE OpenModelica is invoked
    print("\n--- Demonstrate typo detection (will raise) ---")
    script.add_equation("der(x) = velocity")  # 'velocity' is not declared
    typo_report = script.check_state()
    print(f"ok={typo_report.ok} missing_in_equations={typo_report.missing_in_equations}")
    script.remove_equation(-1)  # rollback the typo

    # 2. Compile and simulate (low damping)
    print("\n--- Compiling (low damping c=0.1) ---")
    result_low = script.compile_to_fmu(workspace_dir=workspace)
    print(f"FMU: {result_low.fmu_path}")
    sim_low = run_simulation_from_local_path(
        fmu_path=result_low.fmu_path, stop_time=10.0, output_interval=0.1
    )
    x_series_low = sim_low.series.get("x", [])
    print(
        f"Simulation 1: {len(sim_low.time)} points, "
        f"x final={x_series_low[-1]:.4f}, x|max|={max(abs(v) for v in x_series_low):.4f}"
    )

    # 3. Edit: bump damping to 1.0 (visibly more damped), tighten spring a bit
    print("\n--- Editing: c=1.0, k=12.0 ---")
    script.edit_variable("c", value="1.0")
    script.edit_variable("k", value="12.0")

    # 4. Recompile and re-simulate
    result_high = script.compile_to_fmu(workspace_dir=workspace)
    sim_high = run_simulation_from_local_path(
        fmu_path=result_high.fmu_path, stop_time=10.0, output_interval=0.1
    )
    x_series_high = sim_high.series.get("x", [])
    print(
        f"Simulation 2: {len(sim_high.time)} points, "
        f"x final={x_series_high[-1]:.4f}, x|max|={max(abs(v) for v in x_series_high):.4f}"
    )

    # 5. Add an algebraic variable + equation: track kinetic energy.
    #    No need for kind="output": we'll request it explicitly via output_variables.
    print("\n--- Adding: kinetic energy variable + equation ---")
    script.add_variable(name="E_kin", comment="kinetic energy")
    script.add_equation("E_kin = 0.5 * m * v^2")

    print("\n--- Final source ---")
    print(script.to_source())

    result_final = script.compile_to_fmu(workspace_dir=workspace)

    # 6. Inspect the FMU and print a DataFrame summary of ALL variables
    print("\n--- FMU variable summary ---")
    inspection = inspect_fmu_from_local_path(fmu_path=result_final.fmu_path)
    inspect_df = pd.DataFrame([v.model_dump() for v in inspection.variables])
    if not inspect_df.empty:
        pd.set_option("display.max_rows", None)
        pd.set_option("display.max_colwidth", 40)
        print(inspect_df.to_string(index=False))

    # 7. Request E_kin explicitly via output_variables (no need for kind="output")
    print("\n--- Simulation 3 (requesting E_kin explicitly) ---")
    sim_final = run_simulation_from_local_path(
        fmu_path=result_final.fmu_path,
        stop_time=10.0,
        output_interval=0.1,
        output_variables=["x", "v", "E_kin"],
    )
    exposed = sorted(sim_final.series.keys())
    print(f"Simulation 3: variables exposed = {exposed}")
    if "E_kin" in sim_final.series:
        print(f"E_kin final = {sim_final.series['E_kin'][-1]:.6f}")

    print(f"\nDemo workspace: {workspace}")
    cleanup = input("Delete workspace? [y/N] ").strip().lower() == "y"
    if cleanup:
        shutil.rmtree(workspace)
        print("Deleted.")


def _run_audit(root: str | Path) -> None:
    """Try ModelicaScript.from_file on every .mo under `root` and report results.

    Use to discover what subset of Modelica the loader still doesn't support.
    Sorted top features by frequency are printed at the end.
    """
    import collections
    import traceback

    root_path = Path(root)
    files = sorted(root_path.rglob("*.mo"))
    print(f"Auditing {len(files)} .mo files under {root_path}")

    successes: list[Path] = []
    failures: list[tuple[Path, UnsupportedModelicaFeatureError | Exception]] = []
    feature_counter: collections.Counter[str] = collections.Counter()
    other_counter: collections.Counter[str] = collections.Counter()

    for path in files:
        try:
            ModelicaScript.from_file(path)
        except UnsupportedModelicaFeatureError as exc:
            failures.append((path, exc))
            feature_counter[exc.feature] += 1
        except Exception as exc:
            failures.append((path, exc))
            other_counter[type(exc).__name__] += 1
            if len(other_counter) <= 3 and other_counter[type(exc).__name__] <= 2:
                traceback.print_exception(type(exc), exc, exc.__traceback__, limit=3)
        else:
            successes.append(path)

    total = len(files)
    ok = len(successes)
    failed = len(failures)
    print("\n=== Audit summary ===")
    print(f"Total .mo files:    {total}")
    print(f"Loaded successfully: {ok} ({ok / max(total, 1):.1%})")
    print(f"Failed:              {failed}")

    if feature_counter:
        print("\nTop unsupported features:")
        for feature, count in feature_counter.most_common(20):
            print(f"  {count:5d}  {feature}")

    if other_counter:
        print("\nNon-feature errors (parser bugs?):")
        for kind, count in other_counter.most_common():
            print(f"  {count:5d}  {kind}")

    if successes:
        print("\nSample successes:")
        for path in successes[:5]:
            print(f"  {path.relative_to(root_path)}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 2 and sys.argv[1] == "audit":
        if len(sys.argv) < 3:
            print("Usage: modelica_script.py audit <path>")
            sys.exit(1)
        _run_audit(sys.argv[2])
    else:
        _run_demo()
