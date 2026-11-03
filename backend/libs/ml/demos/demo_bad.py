"""Interactive Typer demo for the BAD workflow.

Trains every ``json->label`` method registered in the default ML registry on a
user-supplied Excel/CSV file, persists each trained model under
``./.bad/<materiel>/<file_settings_hash>/methods/<method_hash>/``, then offers a
sibling ``infer`` command that reloads the models and writes predictions back
into a copy of an arbitrary source file.

Run from ``backend/``::

    uv run python -m libs.ml.demos.demo_bad train
    uv run python -m libs.ml.demos.demo_bad infer
    uv run python -m libs.ml.demos.demo_bad list
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import statistics
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
import typer
from rich.console import Console
from rich.progress import (
    BarColumn,
    Progress,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from rich.prompt import Confirm, IntPrompt, Prompt
from rich.table import Table

from libs.ml.constants import create_default_ml_registry
from libs.ml.datasets import Dataset, DatasetSample
from libs.ml.evaluation import evaluate_classifier
from libs.ml.models import JsonInput, Label
from libs.ml.registry import MethodSpec, MLRegistry, ParameterSpec, TaskFormalism
from libs.ml.targets import ClassificationTarget

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    _HAS_MPL = True
except ImportError:
    _HAS_MPL = False

BAD_ROOT = Path(".bad")
SCANS_DIR = BAD_ROOT / "_scans"
NO_FD_LABEL = "<fd>0.0"
FORMALISM = TaskFormalism.JSON_TO_LABEL

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="BAD: scan a folder, train json->label classifiers and run inference.",
)
console = Console()


BANNER_ART = r"""
                                       
█████▄ ▄████▄ ████▄         ██▄  ▄██ ██     
██▄▄██ ██▄▄██ ██  ██  ████  ██ ▀▀ ██ ██     
██▄▄█▀ ██  ██ ████▀         ██    ██ ██████ 
                                       
"""


def _print_banner() -> None:
    """Compact welcome card printed at the start of every command."""
    console.print()
    console.print(f"[bold cyan]{BANNER_ART.rstrip()}[/bold cyan]")
    console.print()
    console.print("[bold cyan]BAD ML[/bold cyan] — Excel/CSV json→label classification workflow")
    console.print()
    console.print("[bold]Commands[/bold]")
    console.print("  [bold cyan]bad scan FOLDER[/bold cyan]  [dim]·[/dim] explore a folder, persist a scan")
    console.print("  [bold cyan]bad train[/bold cyan]        [dim]·[/dim] configure a source file and train method runs")
    console.print("  [bold cyan]bad infer[/bold cyan]        [dim]·[/dim] predict on a new file using configured methods")
    console.print("  [bold cyan]bad list[/bold cyan]         [dim]·[/dim] show every configured source file + its methods")
    console.print()
    materiel_dirs = (
        [d for d in sorted(BAD_ROOT.iterdir()) if d.is_dir() and not d.name.startswith("_")]
        if BAD_ROOT.exists()
        else []
    )
    if materiel_dirs:
        console.print(f"[bold]Materiels[/bold] ({len(materiel_dirs)} configured)")
        for materiel_dir in materiel_dirs:
            configs = [
                d for d in sorted(materiel_dir.iterdir())
                if d.is_dir() and (d / "config.json").exists()
            ]
            trained_total = sum(len(_list_trained_methods(c)) for c in configs)
            console.print(
                f"  · [cyan]{materiel_dir.name}[/cyan] · "
                f"{len(configs)} source config(s) · {trained_total} method run(s) trained"
            )
    else:
        console.print("[bold]Materiels[/bold] [dim]none yet — start with `bad train`[/dim]")
    console.print()
    console.print("[bold]How to…[/bold]")
    console.print("  • add a method run to a source config   → [cyan]bad train[/cyan] → choose source config → option [bold]5[/bold]")
    console.print("  • create a new source config            → [cyan]bad train[/cyan], answer [bold]n[/bold] to reuse")
    console.print("  • change a method run's parameters      → [cyan]bad train[/cyan] → choose source config → option [bold]2[/bold]")
    console.print("  • delete a materiel                     → [bold]rm -rf .bad/<materiel>/[/bold]")
    console.print("  • delete a source config / method run   → [bold]rm -rf .bad/<materiel>/<hash>/[/bold]   or   [bold]…/methods/<m_hash>/[/bold]")
    console.print()


# ─── Hashing / paths ──────────────────────────────────────────────────────────


def _hash(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]  # noqa: S324


def file_settings_hash(
    materiel: str, sheet: str | None, label_column: str, input_columns: list[str]
) -> str:
    return _hash(
        {
            "materiel": materiel,
            "sheet": sheet,
            "label_column": label_column,
            "input_columns": sorted(input_columns),
        }
    )


def method_hash(method_key: str, params: dict[str, Any], n_splits: int) -> str:
    return _hash({"key": method_key, "params": params, "n_splits": n_splits})


def settings_dir(materiel: str, settings_hash: str) -> Path:
    return BAD_ROOT / _slug(materiel) / settings_hash


def methods_dir(materiel: str, settings_hash: str) -> Path:
    return settings_dir(materiel, settings_hash) / "methods"


_HASH_ONLY_RE = re.compile(r"^[0-9a-f]{16}$")


def method_dir(materiel: str, settings_hash: str, method_key: str, m_hash: str) -> Path:
    return methods_dir(materiel, settings_hash) / f"{method_key}_{m_hash}"


def inference_dir(materiel: str, settings_hash: str) -> Path:
    return settings_dir(materiel, settings_hash) / "inference"


def _slug(value: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in value.strip()).lower() or "_"


# ─── File IO ──────────────────────────────────────────────────────────────────


@dataclass
class SourceFile:
    path: Path
    is_excel: bool
    sheet: str | None


def _read_dataframe(source: SourceFile) -> pd.DataFrame:
    if source.is_excel:
        return pd.read_excel(source.path, sheet_name=source.sheet)
    return _read_csv(source.path)


def _read_csv(path: Path) -> pd.DataFrame:
    """Read a CSV with separator autodetection (handles ``,`` and ``;``)."""
    return pd.read_csv(path, sep=None, engine="python")


def _list_sheets(path: Path) -> list[str]:
    return pd.ExcelFile(path).sheet_names


def _is_excel(path: Path) -> bool:
    return path.suffix.lower() in {".xlsx", ".xlsm", ".xls"}


# ─── Label derivation ─────────────────────────────────────────────────────────


def _fd_label(value: Any) -> str:
    if value is None:
        return NO_FD_LABEL
    if isinstance(value, float) and pd.isna(value):
        return NO_FD_LABEL
    text = str(value).strip().replace(",", ".")
    if not text or text.lower() == "nan":
        return NO_FD_LABEL
    try:
        return f"<fd>{float(text):.1f}"
    except ValueError:
        return f"<fd>{text}"


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            value = value.item()
        except ValueError:
            pass
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def _build_dataset(
    frame: pd.DataFrame, input_columns: list[str], label_column: str
) -> Dataset:
    samples: list[DatasetSample] = []
    for record in frame.to_dict(orient="records"):
        payload = {col: _json_safe(record.get(col)) for col in input_columns}
        target = ClassificationTarget(label_id=_fd_label(record.get(label_column)))
        samples.append(
            DatasetSample(
                input=JsonInput(json_value=json.dumps(payload, ensure_ascii=False)),
                target=target,
            )
        )
    return Dataset(formalism=FORMALISM, samples=samples)


# ─── Interactive helpers ──────────────────────────────────────────────────────


def _list_existing_configs() -> list[Path]:
    """Return all ``<materiel>/<settings_hash>`` paths that already have a ``config.json``."""
    if not BAD_ROOT.exists():
        return []
    out: list[Path] = []
    for materiel_dir in sorted(BAD_ROOT.iterdir()):
        if not materiel_dir.is_dir() or materiel_dir.name.startswith("_"):
            continue
        for settings_dir_path in sorted(materiel_dir.iterdir()):
            if (settings_dir_path / "config.json").exists():
                out.append(settings_dir_path)
    return out


def _pick_existing_config(configs: list[Path]) -> "TrainConfig":
    """Prompt the user to pick one of the existing ``TrainConfig``s."""
    console.print("[bold]Existing source file configs[/bold]")
    for i, path in enumerate(configs):
        cfg = _load_config(path / "config.json")
        trained = _list_trained_methods(path)
        console.print(
            f"  [cyan]{i:>2}[/cyan]  {cfg.materiel}/{path.name}  "
            f"[dim]{cfg.label_column} ← {len(cfg.input_columns)} cols · "
            f"{len(trained)} method run(s) trained[/dim]"
        )
        console.print(f"        [dim]{cfg.source_path}[/dim]")
    index = IntPrompt.ask("Pick a source file config", default=0)
    if not 0 <= index < len(configs):
        raise typer.Exit("Out of range.")
    return _load_config(configs[index] / "config.json")


def _pick_source_file() -> tuple[Path, str | None] | None:
    """Offer to pick a (file, sheet) from a saved scan. Returns ``None`` if user declines or no scan."""
    scans = _list_scans()
    if not scans:
        return None
    if not Confirm.ask(f"Use a previously saved scan? ({len(scans)} available)", default=True):
        return None
    if len(scans) == 1:
        results = scans[0][1]
    else:
        console.print("[bold]Saved scans[/bold]")
        for i, (path, results) in enumerate(scans):
            console.print(f"  [cyan]{i}[/cyan]  {results['folder']}  [dim]({results['scanned_at']})[/dim]")
        results = scans[IntPrompt.ask("Pick a scan", default=0)][1]

    entries: list[tuple[Path, str | None, int, dict[str, int]]] = []
    for entry in results["files"]:
        for sheet in entry["sheets"]:
            entries.append(
                (Path(entry["path"]), sheet["name"] or None, int(sheet["rows"]), sheet["distribution"])
            )
    entries.sort(key=lambda e: (str(e[0]).lower(), (e[1] or "").lower()))
    if not entries:
        console.print("[dim]Scan is empty.[/dim]")
        return None

    console.print("[bold]Pick a ground-truth file/sheet[/bold]")
    table = _new_distribution_table(with_index=True)
    for i, (path, sheet, rows, dist) in enumerate(entries):
        _add_distribution_row(
            table,
            file_label=path.name,
            sheet_name=sheet or "(csv)",
            rows=rows,
            distribution=dist,
            index=i,
        )
    console.print(table)
    index = IntPrompt.ask("Index", default=0)
    if not 0 <= index < len(entries):
        return None
    picked_path, picked_sheet, _, _ = entries[index]
    return picked_path, picked_sheet


def _ask_path(question: str, default: str | None = None) -> Path:
    while True:
        raw = Prompt.ask(question, default=default) if default else Prompt.ask(question)
        path = Path(raw).expanduser()
        if path.exists() and path.is_file():
            return path.resolve()
        console.print(f"[red]File not found:[/red] {path}")


def _ask_sheet(path: Path) -> str:
    sheets = _list_sheets(path)
    if len(sheets) == 1:
        console.print(f"[dim]Only sheet:[/dim] {sheets[0]}")
        return sheets[0]
    console.print("[bold]Available sheets:[/bold]")
    for i, name in enumerate(sheets):
        console.print(f"  [cyan]{i}[/cyan]  {name}")
    index = IntPrompt.ask("Pick a sheet index", default=0)
    return sheets[index]


def _ask_label_column(columns: list[str], default: str = "Fd") -> str:
    _print_columns(columns)
    fallback = default if default in columns else columns[0]
    while True:
        raw = Prompt.ask(
            f"Label column (Fd target — name or index){_index_hint(fallback, columns)}",
            default=fallback,
        ).strip()
        col = _resolve_column(raw, columns)
        if col is not None:
            return col
        console.print(f"[red]Unknown column:[/red] {raw}")


def _index_hint(value: str, columns: list[str]) -> str:
    """Render `` [#N]`` if ``value`` is a known column, empty otherwise."""
    if value and value in columns:
        return f" [dim]\\[#{columns.index(value)}][/dim]"
    return ""


def _resolve_column(raw: str, columns: list[str]) -> str | None:
    if raw in columns:
        return raw
    if raw.isdigit():
        index = int(raw)
        if 0 <= index < len(columns):
            return columns[index]
    return None


def _print_columns(columns: list[str]) -> None:
    console.print("[bold]Columns available[/bold]")
    for i, name in enumerate(columns):
        console.print(f"  [cyan]{i:>3}[/cyan]  {name}")


def _ask_multiselect(
    label: str, options: list[str], defaults: Iterable[str] | None = None
) -> list[str]:
    default_set = set(defaults or [])
    console.print(f"[bold]{label}[/bold] (comma-separated indices, ranges like 1-4 OK)")
    for i, name in enumerate(options):
        mark = "[green]✔[/green]" if name in default_set else " "
        console.print(f"  {mark} [cyan]{i}[/cyan]  {name}")
    default_indices = ",".join(str(i) for i, n in enumerate(options) if n in default_set)
    raw = Prompt.ask("Pick", default=default_indices or "")
    return [options[i] for i in _parse_index_list(raw, len(options))]


def _parse_index_list(raw: str, n: int) -> list[int]:
    result: list[int] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            a, b = chunk.split("-", 1)
            result.extend(range(int(a), int(b) + 1))
        else:
            result.append(int(chunk))
    seen: set[int] = set()
    out: list[int] = []
    for i in result:
        if 0 <= i < n and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def _coerce_param(spec: ParameterSpec, raw: str) -> Any:
    if raw == "" and not spec.required:
        return spec.default
    if spec.type == "number":
        try:
            value = float(raw)
        except ValueError as exc:
            raise ValueError(f"{spec.name}: expected a number, got {raw!r}") from exc
        return int(value) if value.is_integer() else value
    if spec.type == "boolean":
        return raw.strip().lower() in {"1", "true", "y", "yes", "oui"}
    if spec.type == "json":
        return json.loads(raw)
    return raw


def _ask_method_params(
    method: MethodSpec,
    defaults: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Drive prompts from a method's ParameterSpec list. Empty input keeps default."""
    config: dict[str, Any] = {}
    defaults = defaults or {}
    if not method.parameters:
        console.print(f"[dim]Parameters for {method.name}: none[/dim]")
        return config
    console.print(f"[bold]Parameters for {method.name}[/bold]")
    for spec in method.parameters:
        required = spec.required or _is_required_in_context(method, spec)
        default_value = defaults.get(spec.name, spec.default)
        default_repr = (
            ""
            if default_value is None
            else json.dumps(default_value)
            if spec.type == "json"
            else str(default_value)
        )
        label = f"  {spec.label} ({spec.type}){' *' if required else ''}"
        if spec.description:
            console.print(f"[dim]{label} — {spec.description}[/dim]")
        if spec.possible_values:
            formatted_possible_values = ", ".join(str(value) for value in spec.possible_values)
            console.print(f"[dim]    Possible values: {formatted_possible_values}[/dim]")
        while True:
            raw = Prompt.ask(spec.name, default=default_repr)
            try:
                value = _coerce_param(spec, raw)
            except (ValueError, json.JSONDecodeError) as exc:
                raise typer.BadParameter(str(exc)) from exc
            if required and (value is None or value == ""):
                console.print(f"[red]'{spec.name}' is required for {method.name}.[/red]")
                continue
            break
        if value is not None or required:
            config[spec.name] = value
    return config


def _is_required_in_context(method: MethodSpec, spec: ParameterSpec) -> bool:
    """A zero-shot LLM is meaningless without a prompt — treat it as required here."""
    return method.zero_shot and spec.name == "prompt"


# ─── Config persistence ───────────────────────────────────────────────────────


@dataclass
class TrainConfig:
    materiel: str
    source_path: Path
    is_excel: bool
    sheet: str | None
    label_column: str
    input_columns: list[str]
    n_splits: int

    @property
    def settings_hash(self) -> str:
        return file_settings_hash(self.materiel, self.sheet, self.label_column, self.input_columns)

    def to_dict(self) -> dict[str, Any]:
        return {
            "materiel": self.materiel,
            "source_path": str(self.source_path),
            "is_excel": self.is_excel,
            "sheet": self.sheet,
            "label_column": self.label_column,
            "input_columns": list(self.input_columns),
            "n_splits": self.n_splits,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TrainConfig":
        return cls(
            materiel=data["materiel"],
            source_path=Path(data["source_path"]),
            is_excel=bool(data["is_excel"]),
            sheet=data.get("sheet"),
            label_column=data["label_column"],
            input_columns=list(data["input_columns"]),
            n_splits=int(data.get("n_splits", 5)),
        )


def _save_config(config: TrainConfig) -> Path:
    out = settings_dir(config.materiel, config.settings_hash)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "config.json"
    path.write_text(json.dumps(config.to_dict(), indent=2, ensure_ascii=False))
    return path


def _load_config(path: Path) -> TrainConfig:
    return TrainConfig.from_dict(json.loads(path.read_text()))


@dataclass
class MethodRun:
    method: MethodSpec
    params: dict[str, Any]
    path: Path
    meta: dict[str, Any]


# ─── Training ─────────────────────────────────────────────────────────────────


def _filter_methods(registry: MLRegistry) -> list[MethodSpec]:
    return [m for m in registry.list(formalism=FORMALISM)]


def _print_methods(
    methods: list[MethodSpec],
    statuses: dict[str, str] | None = None,
    *,
    title: str = "Available json->label methods",
) -> None:
    table = Table(title=title, show_lines=False)
    table.add_column("#", style="cyan", justify="right")
    table.add_column("Key")
    table.add_column("Name")
    table.add_column("Trainable")
    table.add_column("Rule")
    table.add_column("Zero-shot")
    if statuses is not None:
        table.add_column("Status")
    for i, m in enumerate(methods):
        row = [
            str(i),
            m.key,
            m.name,
            "✔" if m.trainable else "·",
            "✔" if m.rule_based else "·",
            "✔" if m.zero_shot else "·",
        ]
        if statuses is not None:
            row.append(statuses.get(m.key, "[dim]unknown[/dim]"))
        table.add_row(*row)
    console.print(table)


def _print_already_trained(settings_path: Path) -> None:
    """Show every method already attempted for this config — to avoid redoing work."""
    entries = _list_method_entries(settings_path)
    if not entries:
        return
    table = Table(
        title="Already attempted methods (this config)",
        show_lines=True,
        expand=False,
        header_style="bold cyan",
    )
    table.add_column("", style="white", no_wrap=True)
    table.add_column("Method", style="white", overflow="fold", max_width=40)
    table.add_column("Folder", style="dim white", no_wrap=True)
    table.add_column("Params", style="white", overflow="fold", max_width=40)
    table.add_column("Primary", justify="right", style="yellow", no_wrap=True)
    for _m_hash, path, meta in entries:
        if "error" in meta:
            status = "[red]✗[/red]"
            primary_str = "[red]failed[/red]"
        elif (path / "model.joblib").exists():
            status = "[green]✔[/green]"
            metrics = meta.get("cv_metrics") or {}
            primary = (
                metrics.get("binary_recall_gt0")
                or metrics.get("positive_recall")
                or metrics.get("f1")
                or metrics.get("accuracy")
            )
            primary_str = f"{primary:.3f}" if isinstance(primary, (int, float)) else "—"
        else:
            status = "[cyan]•[/cyan]"
            primary_str = "[cyan]configured[/cyan]"
        params = meta.get("params") or {}
        params_str = ", ".join(f"{k}={json.dumps(v, ensure_ascii=False)}" for k, v in params.items()) or "—"
        table.add_row(status, meta.get("method_name", ""), path.name, params_str, primary_str)
    console.print(table)


def _method_statuses(
    methods: list[MethodSpec],
    train_config: TrainConfig,
    method_params: dict[str, dict[str, Any]],
) -> dict[str, str]:
    settings_path = settings_dir(train_config.materiel, train_config.settings_hash)
    return {
        method.key: _method_status(
            settings_path, train_config, method, method_params.get(method.key)
        )
        for method in methods
    }


def _method_status(
    settings_path: Path,
    train_config: TrainConfig,
    method: MethodSpec,
    params: dict[str, Any] | None,
) -> str:
    if not method.trainable:
        return "[green]ready[/green]"
    if params is not None and _already_trained(train_config, method, params):
        return "[green]trained[/green]"

    successes = 0
    failures = 0
    configured = 0
    for _m_hash, path, meta in _list_method_entries(settings_path):
        if meta.get("method_key") != method.key:
            continue
        if (path / "model.joblib").exists():
            successes += 1
        elif "error" in meta:
            failures += 1
        else:
            configured += 1

    if successes:
        if params is not None:
            return "[green]trained[/green] [dim](other params)[/dim]"
        return "[green]trained[/green]"
    if failures:
        return "[red]failed[/red]"
    if configured:
        return "[cyan]configured[/cyan]"
    return "[dim]not trained[/dim]"


def _method_by_key(methods: list[MethodSpec]) -> dict[str, MethodSpec]:
    return {method.key: method for method in methods}


def _list_method_runs(train_config: TrainConfig, methods: list[MethodSpec]) -> list[MethodRun]:
    known_methods = _method_by_key(methods)
    runs: list[MethodRun] = []
    settings_path = settings_dir(train_config.materiel, train_config.settings_hash)
    for _m_hash, path, meta in _list_method_entries(settings_path):
        method_key = meta.get("method_key")
        if method_key not in known_methods or "params" not in meta:
            continue
        params_file = path / "params.json"
        params = json.loads(params_file.read_text()) if params_file.exists() else dict(meta["params"])
        runs.append(
            MethodRun(
                method=known_methods[method_key],
                params=params,
                path=path,
                meta=meta,
            )
        )
    return runs


def _method_run_status(run: MethodRun) -> str:
    if not run.method.trainable:
        return "[green]ready[/green]"
    if (run.path / "model.joblib").exists():
        return "[green]trained[/green]"
    if "error" in run.meta:
        return "[red]failed[/red]"
    return "[cyan]configured[/cyan]"


def _print_method_runs(runs: list[MethodRun], *, title: str = "Configured method runs") -> None:
    if not runs:
        console.print("[dim]No configured method runs yet.[/dim]")
        return
    table = Table(title=title, show_lines=False)
    table.add_column("#", style="cyan", justify="right")
    table.add_column("Method", style="white", overflow="fold", max_width=40)
    table.add_column("Folder", style="dim white", no_wrap=True)
    table.add_column("Params", style="white", overflow="fold", max_width=48)
    table.add_column("Status", no_wrap=True)
    for i, run in enumerate(runs):
        params_str = (
            ", ".join(
                f"{key}={json.dumps(value, ensure_ascii=False)}"
                for key, value in run.params.items()
            )
            or "—"
        )
        table.add_row(
            str(i),
            run.method.name,
            run.path.name,
            params_str,
            _method_run_status(run),
        )
    console.print(table)


def _pick_method_run(
    train_config: TrainConfig,
    methods: list[MethodSpec],
    *,
    title: str,
) -> MethodRun | None:
    runs = _list_method_runs(train_config, methods)
    _print_method_runs(runs, title=title)
    if not runs:
        return None
    index = IntPrompt.ask("Pick a configured method run", default=0)
    if 0 <= index < len(runs):
        return runs[index]
    console.print("[red]Out of range.[/red]")
    return None


def _pick_method_runs_to_train(
    train_config: TrainConfig,
    methods: list[MethodSpec],
) -> list[MethodRun]:
    runs = _list_method_runs(train_config, methods)
    _print_method_runs(runs, title="Configured method runs")
    default_indices = [
        str(i)
        for i, run in enumerate(runs)
        if run.method.trainable and not (run.path / "model.joblib").exists()
    ]
    raw = Prompt.ask(
        "Pick configured runs to train (comma/range)",
        default=",".join(default_indices),
    )
    indices = _parse_index_list(raw, len(runs))
    selected = [runs[i] for i in indices if runs[i].method.trainable]
    skipped = len(indices) - len(selected)
    if skipped:
        console.print(f"[dim]Skipped {skipped} non-trainable ready run(s).[/dim]")
    return selected


def _train_one(
    *,
    registry: MLRegistry,
    method: MethodSpec,
    params: dict[str, Any],
    dataset: Dataset,
    labels: list[Label],
    n_splits: int,
) -> dict[str, Any]:
    """Train + CV-score on the full dataset, then refit on everything and persist."""
    config = dict(params)
    if _method_uses_labels(method):
        config.setdefault("labels", labels)

    cv_metrics: dict[str, float] = {}
    confusion: dict[str, dict[str, int]] = {}
    if method.trainable and n_splits >= 2 and len(dataset) >= n_splits:
        folds = dataset.k_fold_splits(n_splits)
        per_fold: list[dict[str, float]] = []
        for train, evaluation in folds:
            algorithm = registry.build(method.key, config)
            algorithm.fit(
                [s.input for s in train.labeled_samples()],
                [Label(id=s.target.label_id, name=s.target.label_id) for s in train.labeled_samples()],
            )
            result = evaluate_classifier(algorithm, evaluation, include_confusion_matrix=True)
            per_fold.append(result.metrics)
            _merge_confusion(confusion, (result.metadata or {}).get("confusion_matrix") or {})
        if per_fold:
            for key in per_fold[0]:
                values = [m[key] for m in per_fold]
                cv_metrics[key] = statistics.fmean(values)
                cv_metrics[f"{key}_std"] = statistics.pstdev(values)
            cv_metrics["folds"] = float(len(per_fold))

    final = registry.build(method.key, config)
    if method.trainable:
        final.fit(
            [s.input for s in dataset.labeled_samples()],
            [Label(id=s.target.label_id, name=s.target.label_id) for s in dataset.labeled_samples()],
        )
    else:
        result = evaluate_classifier(final, dataset, include_confusion_matrix=True)
        cv_metrics.update(result.metrics)
        _merge_confusion(confusion, (result.metadata or {}).get("confusion_matrix") or {})
    per_class = _per_class_recall(confusion)
    cv_metrics.update(_imbalance_metrics(confusion, per_class))
    return {
        "algorithm": final,
        "cv_metrics": cv_metrics,
        "confusion": confusion,
        "per_class_recall": per_class,
    }


def _method_uses_labels(method: MethodSpec) -> bool:
    """Methods whose factory reads ``config['labels']`` (LLM zero-shot / few-shot)."""
    return method.key.startswith("llm_")


def _per_class_recall(confusion: dict[str, dict[str, int]]) -> dict[str, float]:
    recall: dict[str, float] = {}
    for true_label, predictions in confusion.items():
        total = sum(predictions.values())
        if total:
            recall[true_label] = predictions.get(true_label, 0) / total
    return recall


def _imbalance_metrics(
    confusion: dict[str, dict[str, int]], per_class: dict[str, float]
) -> dict[str, float]:
    out: dict[str, float] = {}
    positive_classes = [label for label in per_class if label != NO_FD_LABEL]
    if positive_classes:
        out["positive_recall"] = statistics.fmean(per_class[label] for label in positive_classes)
    pos_total = 0
    pos_caught = 0
    for true_label, predictions in confusion.items():
        if true_label == NO_FD_LABEL:
            continue
        for predicted_label, count in predictions.items():
            pos_total += count
            if predicted_label != NO_FD_LABEL:
                pos_caught += count
    if pos_total:
        out["binary_recall_gt0"] = pos_caught / pos_total
    return out


def _merge_confusion(
    accumulator: dict[str, dict[str, int]], matrix: dict[str, dict[str, int]]
) -> None:
    for true_label, predicted_counts in matrix.items():
        row = accumulator.setdefault(str(true_label), {})
        for predicted_label, count in predicted_counts.items():
            row[str(predicted_label)] = row.get(str(predicted_label), 0) + int(count)


def _save_confusion_png(matrix: dict[str, dict[str, int]], out: Path, title: str) -> bool:
    if not _HAS_MPL or not matrix:
        return False
    labels = sorted({lab for row in matrix.values() for lab in row.keys()} | set(matrix.keys()))
    grid = [[matrix.get(t, {}).get(p, 0) for p in labels] for t in labels]
    fig, ax = plt.subplots(figsize=(max(4.0, 0.6 * len(labels) + 2), max(3.5, 0.5 * len(labels) + 2)))
    im = ax.imshow(grid, cmap="Blues")
    ax.set_xticks(range(len(labels)), labels, rotation=45, ha="right")
    ax.set_yticks(range(len(labels)), labels)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title)
    for i, row in enumerate(grid):
        total = sum(row) or 1
        for j, value in enumerate(row):
            ax.text(j, i, f"{value}\n{100 * value / total:.0f}%", ha="center", va="center", fontsize=8)
    fig.colorbar(im, ax=ax, fraction=0.04)
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)
    return True


def _save_method(
    *,
    train_config: TrainConfig,
    method: MethodSpec,
    params: dict[str, Any],
    m_hash: str,
    algorithm: Any,
    cv_metrics: dict[str, float],
    confusion: dict[str, dict[str, int]],
    per_class_recall: dict[str, float],
    labels: list[Label],
) -> Path:
    out = method_dir(train_config.materiel, train_config.settings_hash, method.key, m_hash)
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(algorithm, out / "model.joblib")
    cm_png_written = _save_confusion_png(
        confusion, out / "confusion_matrix.png", f"{method.name} · CV folds={int(cv_metrics.get('folds', 0))}"
    )
    meta = {
        "method_key": method.key,
        "method_name": method.name,
        "trainable": method.trainable,
        "zero_shot": method.zero_shot,
        "rule_based": method.rule_based,
        "params": {k: _meta_safe(v) for k, v in params.items()},
        "n_splits": train_config.n_splits,
        "cv_metrics": cv_metrics,
        "labels": [label.id for label in labels],
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "input_columns": list(train_config.input_columns),
        "label_column": train_config.label_column,
        "confusion_matrix": confusion,
        "confusion_matrix_png": "confusion_matrix.png" if cm_png_written else None,
        "per_class_recall": per_class_recall,
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return out


def _save_method_config(
    *,
    train_config: TrainConfig,
    method: MethodSpec,
    params: dict[str, Any],
) -> Path:
    """Persist selected parameters before training so the method can be resumed later."""
    safe_params = _meta_safe(params)
    m_hash = method_hash(method.key, safe_params, train_config.n_splits)
    out = method_dir(train_config.materiel, train_config.settings_hash, method.key, m_hash)
    out.mkdir(parents=True, exist_ok=True)
    (out / "params.json").write_text(json.dumps(safe_params, indent=2, ensure_ascii=False))
    meta_file = out / "meta.json"
    if meta_file.exists():
        meta = json.loads(meta_file.read_text())
    else:
        meta = {
            "method_key": method.key,
            "method_name": method.name,
            "trainable": method.trainable,
            "zero_shot": method.zero_shot,
            "rule_based": method.rule_based,
            "n_splits": train_config.n_splits,
            "configured_at": datetime.now().isoformat(timespec="seconds"),
        }
    if not (out / "model.joblib").exists():
        meta.pop("error", None)
        meta.pop("failed_at", None)
        meta["configured_at"] = datetime.now().isoformat(timespec="seconds")
    meta["params"] = safe_params
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return out


def _save_failed_method(
    *,
    train_config: TrainConfig,
    method: MethodSpec,
    params: dict[str, Any],
    m_hash: str,
    error: str,
) -> Path:
    """Persist a failure marker so the attempt shows up in ``bad list``."""
    out = method_dir(train_config.materiel, train_config.settings_hash, method.key, m_hash)
    out.mkdir(parents=True, exist_ok=True)
    meta = {
        "method_key": method.key,
        "method_name": method.name,
        "trainable": method.trainable,
        "zero_shot": method.zero_shot,
        "params": {k: _meta_safe(v) for k, v in params.items()},
        "n_splits": train_config.n_splits,
        "error": error,
        "failed_at": datetime.now().isoformat(timespec="seconds"),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return out


def _meta_safe(value: Any) -> Any:
    if isinstance(value, Label):
        return {"id": value.id, "name": value.name}
    if isinstance(value, list):
        return [_meta_safe(v) for v in value]
    if isinstance(value, dict):
        return {k: _meta_safe(v) for k, v in value.items()}
    return value


def _already_trained(
    train_config: TrainConfig, method: MethodSpec, params: dict[str, Any]
) -> Path | None:
    if not method.trainable:
        return None
    m_hash = method_hash(method.key, _meta_safe(params), train_config.n_splits)
    path = method_dir(train_config.materiel, train_config.settings_hash, method.key, m_hash)
    if (path / "model.joblib").exists():
        return path
    return None


# ─── Train command ────────────────────────────────────────────────────────────


@app.command()
def train(
    include_sentence_transformers: bool = typer.Option(
        False, "--st", help="Include sentence-transformer-backed methods (heavy download)."
    ),
) -> None:
    """Interactive training session."""
    _print_banner()
    registry = create_default_ml_registry(
        include_llm=True,
        include_sentence_transformers=include_sentence_transformers,
    )
    methods = _filter_methods(registry)
    if not methods:
        raise typer.Exit("No json->label methods registered.")

    existing = _list_existing_configs()
    resume = bool(existing) and Confirm.ask(
        f"Reuse an existing source file config? ({len(existing)} available)",
        default=False,
    )
    if resume:
        train_config = _pick_existing_config(existing)
        path = train_config.source_path
        if not path.exists():
            console.print(f"[yellow]Source file missing:[/yellow] {path}")
            path = _ask_path("New source path")
            train_config.source_path = path
            _save_config(train_config)
        is_excel = train_config.is_excel
        sheet = train_config.sheet
        frame = _read_dataframe(SourceFile(path=path, is_excel=is_excel, sheet=sheet))
        label_column = train_config.label_column
        input_columns = list(train_config.input_columns)
        n_splits = train_config.n_splits
        console.print(
            f"[dim]Reusing config:[/dim] Fd=[bold]{label_column}[/bold] · "
            f"features=[bold]{', '.join(input_columns)}[/bold] · folds={train_config.n_splits}"
        )
    else:
        picked = _pick_source_file()
        if picked is None:
            path = _ask_path("Source file (.xlsx/.csv)")
            is_excel = _is_excel(path)
            sheet = _ask_sheet(path) if is_excel else None
        else:
            path, sheet = picked
            is_excel = _is_excel(path)
            console.print(f"[green]Picked:[/green] {path} · sheet={sheet or '(csv)'}")
        frame = _read_dataframe(SourceFile(path=path, is_excel=is_excel, sheet=sheet))
        columns = list(frame.columns)

        console.print(f"[dim]{len(columns)} columns, {len(frame)} rows.[/dim]")
        label_column = _ask_label_column(columns, default="Fd")
        feature_candidates = [c for c in columns if c != label_column]
        input_columns = _ask_multiselect(
            "Learning columns (features)", feature_candidates, defaults=feature_candidates
        )
        if not input_columns:
            raise typer.BadParameter("At least one feature column is required.")

        materiel = Prompt.ask("Material under study (e.g. diesel)").strip()
        if not materiel:
            raise typer.BadParameter("Material name must not be empty.")
        n_splits = IntPrompt.ask("Cross-validation folds", default=5)

        train_config = TrainConfig(
            materiel=materiel,
            source_path=path,
            is_excel=is_excel,
            sheet=sheet,
            label_column=label_column,
            input_columns=input_columns,
            n_splits=n_splits,
        )
        config_path = _save_config(train_config)
        console.print(f"[green]Config saved:[/green] {config_path}")

    dataset = _build_dataset(frame, input_columns, label_column)
    class_counts: dict[str, int] = {}
    for sample in dataset.labeled_samples():
        class_counts[sample.target.label_id] = class_counts.get(sample.target.label_id, 0) + 1
    label_ids = sorted(class_counts)
    labels = [Label(id=lid, name=lid) for lid in label_ids]
    console.print(f"[dim]Discovered {len(labels)} labels:[/dim] {', '.join(label_ids)}")
    _warn_underpopulated_classes(class_counts, n_splits)

    _interactive_loop(
        registry=registry,
        train_config=train_config,
        methods=methods,
        labels=labels,
        dataset=dataset,
    )


def _interactive_loop(
    *,
    registry: MLRegistry,
    train_config: TrainConfig,
    methods: list[MethodSpec],
    labels: list[Label],
    dataset: Dataset,
) -> None:
    while True:
        _print_summary(train_config, methods)
        console.print("\n[bold]Options[/bold]")
        console.print("  [cyan]1[/cyan] modify source file path")
        console.print("  [cyan]2[/cyan] modify configured method parameters")
        console.print("  [cyan]3[/cyan] train one method")
        console.print("  [cyan]4[/cyan] train all methods")
        console.print("  [cyan]5[/cyan] add new method + parameters")
        console.print("  [cyan]q[/cyan] quit")
        choice = Prompt.ask("Action", choices=["1", "2", "3", "4", "5", "q"], default="4")
        if choice == "q":
            return
        if choice == "1":
            new_path = _ask_path("New source path", default=str(train_config.source_path))
            train_config.source_path = new_path
            _save_config(train_config)
            console.print(f"[green]Path updated:[/green] {new_path}")
        elif choice == "2":
            run = _pick_method_run(
                train_config,
                methods,
                title="Configured method runs",
            )
            if run is not None:
                _configure_method(train_config, run.method, defaults=run.params)
        elif choice == "3":
            run = _pick_method_run(
                train_config,
                methods,
                title="Configured method runs",
            )
            if run is not None:
                if not run.method.trainable:
                    console.print(f"[yellow]{run.method.name} is ready without training.[/yellow]")
                    continue
                _train_and_save(
                    registry=registry,
                    train_config=train_config,
                    method=run.method,
                    params=run.params,
                    labels=labels,
                    dataset=dataset,
                )
        elif choice == "4":
            runs = _pick_method_runs_to_train(train_config, methods)
            if not runs:
                console.print("[dim]No configured trainable method run selected.[/dim]")
                continue
            for run in runs:
                _train_and_save(
                    registry=registry,
                    train_config=train_config,
                    method=run.method,
                    params=run.params,
                    labels=labels,
                    dataset=dataset,
                )
        elif choice == "5":
            method = _pick_one(methods, train_config)
            if method is not None:
                _configure_method(train_config, method)


def _configure_method(
    train_config: TrainConfig,
    method: MethodSpec,
    defaults: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params = _ask_method_params(method, defaults=defaults)
    saved = _save_method_config(train_config=train_config, method=method, params=params)
    console.print(f"[green]Method configured:[/green] {saved / 'params.json'}")
    return params


def _pick_one(
    methods: list[MethodSpec],
    train_config: TrainConfig | None = None,
    method_params: dict[str, dict[str, Any]] | None = None,
) -> MethodSpec | None:
    statuses = (
        _method_statuses(methods, train_config, method_params or {})
        if train_config is not None
        else None
    )
    _print_methods(methods, statuses)
    index = IntPrompt.ask("Pick a method index", default=0)
    if 0 <= index < len(methods):
        return methods[index]
    console.print("[red]Out of range.[/red]")
    return None


def _print_summary(
    train_config: TrainConfig,
    methods: list[MethodSpec],
) -> None:
    console.print("\n[bold underline]Summary[/bold underline]")
    file_ok = train_config.source_path.exists()
    flag = "[green]present[/green]" if file_ok else "[red]missing[/red]"
    console.print(f"  source: {train_config.source_path} ({flag})")
    console.print(f"  materiel: {train_config.materiel}")
    console.print(f"  sheet: {train_config.sheet}")
    console.print(f"  Fd column: {train_config.label_column}")
    console.print(f"  features: {', '.join(train_config.input_columns)}")
    console.print(f"  settings hash: {train_config.settings_hash}")
    console.print(f"  cv folds: {train_config.n_splits}")
    console.print("[bold]Methods[/bold]")
    _print_method_runs(_list_method_runs(train_config, methods))


def _train_and_save(
    *,
    registry: MLRegistry,
    train_config: TrainConfig,
    method: MethodSpec,
    params: dict[str, Any],
    labels: list[Label],
    dataset: Dataset,
) -> None:
    safe_params = _meta_safe(params)
    m_hash = method_hash(method.key, safe_params, train_config.n_splits)
    target = method_dir(train_config.materiel, train_config.settings_hash, method.key, m_hash)
    if (target / "model.joblib").exists():
        if not Confirm.ask(
            f"[yellow]{method.name} already trained at {target}. Retrain?[/yellow]",
            default=False,
        ):
            return

    console.print(f"[bold]Training[/bold] {method.name}…")
    try:
        outcome = _train_one(
            registry=registry,
            method=method,
            params=params,
            dataset=dataset,
            labels=labels,
            n_splits=train_config.n_splits,
        )
    except Exception as exc:  # noqa: BLE001
        console.print(f"[red]Training failed:[/red] {exc}")
        _save_failed_method(
            train_config=train_config,
            method=method,
            params=params,
            m_hash=m_hash,
            error=str(exc),
        )
        return
    saved = _save_method(
        train_config=train_config,
        method=method,
        params=params,
        m_hash=m_hash,
        algorithm=outcome["algorithm"],
        cv_metrics=outcome["cv_metrics"],
        confusion=outcome["confusion"],
        per_class_recall=outcome["per_class_recall"],
        labels=labels,
    )
    console.print(f"[green]Saved:[/green] {saved}")
    _print_training_metrics(outcome["cv_metrics"], outcome["per_class_recall"])


def _warn_underpopulated_classes(class_counts: dict[str, int], n_splits: int) -> None:
    tiny = [(label, count) for label, count in class_counts.items() if count < n_splits]
    if not tiny:
        return
    console.print(
        f"[yellow]Warning:[/yellow] {len(tiny)} class(es) have fewer than {n_splits} samples — "
        f"stratified CV will collapse to plain KFold and per-class recall will be unreliable:"
    )
    for label, count in sorted(tiny, key=lambda kv: kv[1]):
        console.print(f"  [yellow]·[/yellow] {label}: {count}")


def _print_training_metrics(
    cv_metrics: dict[str, float], per_class_recall: dict[str, float]
) -> None:
    if not cv_metrics:
        return
    primary_value = cv_metrics.get("binary_recall_gt0")
    primary_label = "binary_recall(>0)"
    if primary_value is None:
        primary_value = cv_metrics.get("positive_recall")
        primary_label = "positive_recall"
    if primary_value is None:
        primary_value = cv_metrics.get("f1") or cv_metrics.get("accuracy")
        primary_label = "f1" if "f1" in cv_metrics else "accuracy"
    if primary_value is not None:
        console.print(f"  [bold yellow]{primary_label}[/bold yellow] = {primary_value:.3f}")
    extras = []
    if "positive_recall" in cv_metrics and primary_label != "positive_recall":
        extras.append(f"positive_recall={cv_metrics['positive_recall']:.3f}")
    for key in ("accuracy", "precision", "recall", "f1"):
        if key in cv_metrics and primary_label != key:
            std = cv_metrics.get(f"{key}_std")
            extras.append(f"{key}={cv_metrics[key]:.3f}±{std:.3f}" if std is not None else f"{key}={cv_metrics[key]:.3f}")
    if extras:
        console.print(f"  [dim]{' · '.join(extras)}[/dim]")
    if per_class_recall:
        table = Table(title="per-class recall", show_lines=False, expand=False, header_style="bold cyan")
        for label in sorted(per_class_recall):
            table.add_column(label, justify="right", style="white", no_wrap=True)
        table.add_row(*[f"{per_class_recall[label]:.2f}" for label in sorted(per_class_recall)])
        console.print(table)


# ─── Infer command ────────────────────────────────────────────────────────────


def _pick_settings_dir() -> Path:
    materiels = (
        [p for p in BAD_ROOT.iterdir() if p.is_dir() and not p.name.startswith("_")]
        if BAD_ROOT.exists()
        else []
    )
    if not materiels:
        raise typer.Exit("No trained configs found under .bad/")
    console.print("[bold]Materiels[/bold]")
    for i, p in enumerate(materiels):
        console.print(f"  [cyan]{i}[/cyan] {p.name}")
    mat = materiels[IntPrompt.ask("Pick materiel", default=0)]
    settings = [p for p in mat.iterdir() if p.is_dir() and (p / "config.json").exists()]
    if not settings:
        raise typer.Exit(f"No configs found under {mat}")
    console.print("[bold]Configs[/bold]")
    for i, p in enumerate(settings):
        cfg = _load_config(p / "config.json")
        console.print(
            f"  [cyan]{i}[/cyan] {p.name} · {cfg.label_column} ← {', '.join(cfg.input_columns)}"
        )
    return settings[IntPrompt.ask("Pick settings hash", default=0)]


def _list_trained_methods(settings_path: Path) -> list[tuple[str, Path, dict[str, Any]]]:
    """Return only successfully trained methods (with a ``model.joblib``)."""
    out: list[tuple[str, Path, dict[str, Any]]] = []
    methods_root = settings_path / "methods"
    if not methods_root.exists():
        return out
    for d in sorted(methods_root.iterdir()):
        meta_file = d / "meta.json"
        model_file = d / "model.joblib"
        if meta_file.exists() and model_file.exists():
            out.append((d.name, d, json.loads(meta_file.read_text())))
    return out


def _pick_trained_methods(
    trained: list[tuple[str, Path, dict[str, Any]]],
) -> list[tuple[str, Path, dict[str, Any]]]:
    table = Table(title="Trained method runs", show_lines=False)
    table.add_column("#", style="cyan", justify="right")
    table.add_column("Method", style="white", overflow="fold", max_width=40)
    table.add_column("Folder", style="dim white", no_wrap=True)
    table.add_column("Params", style="white", overflow="fold", max_width=48)
    table.add_column("Primary", justify="right", style="yellow", no_wrap=True)
    for i, (_m_hash, path, meta) in enumerate(trained):
        params = meta.get("params") or {}
        params_str = ", ".join(
            f"{key}={json.dumps(value, ensure_ascii=False)}"
            for key, value in params.items()
        ) or "—"
        metrics = meta.get("cv_metrics") or {}
        primary = (
            metrics.get("binary_recall_gt0")
            or metrics.get("positive_recall")
            or metrics.get("f1")
            or metrics.get("accuracy")
        )
        primary_str = f"{primary:.3f}" if isinstance(primary, (int, float)) else "—"
        table.add_row(
            str(i),
            meta.get("method_name", ""),
            path.name,
            params_str,
            primary_str,
        )
    console.print(table)
    raw = Prompt.ask(
        "Pick method runs to infer (comma/range)",
        default=f"0-{len(trained) - 1}",
    )
    indices = _parse_index_list(raw, len(trained))
    return [trained[i] for i in indices]


def _list_method_entries(settings_path: Path) -> list[tuple[str, Path, dict[str, Any]]]:
    """Return every method attempt — both successful and failed.

    Also lazily migrates folders that were saved before the ``<method_key>_<hash>``
    naming convention (legacy: bare ``<hash>``).
    """
    out: list[tuple[str, Path, dict[str, Any]]] = []
    methods_root = settings_path / "methods"
    if not methods_root.exists():
        return out
    for d in sorted(methods_root.iterdir()):
        meta_file = d / "meta.json"
        if not meta_file.exists():
            continue
        meta = json.loads(meta_file.read_text())
        # legacy: bare hash → prepend method_key
        if _HASH_ONLY_RE.match(d.name) and (method_key := meta.get("method_key")):
            new_path = methods_root / f"{method_key}_{d.name}"
            if not new_path.exists():
                d.rename(new_path)
                d = new_path
        out.append((d.name, d, meta))
    return out


@app.command()
def infer() -> None:
    """Predict labels on a new file using previously trained models."""
    _print_banner()
    settings_path = _pick_settings_dir()
    train_config = _load_config(settings_path / "config.json")
    trained = _list_trained_methods(settings_path)
    if not trained:
        raise typer.Exit("No trained models for this config.")
    console.print(f"[dim]{len(trained)} trained method run(s) available.[/dim]")
    trained = _pick_trained_methods(trained)
    if not trained:
        raise typer.Exit("No method run selected.")

    picked = _pick_source_file()
    if picked is None:
        source = _ask_path("New file to predict (.xlsx/.csv)")
        is_excel = _is_excel(source)
        sheet = _ask_sheet(source) if is_excel else None
    else:
        source, sheet = picked
        is_excel = _is_excel(source)
        console.print(f"[green]Picked:[/green] {source} · sheet={sheet or '(csv)'}")
    if not Confirm.ask(f"Use {source}?", default=True):
        raise typer.Exit("Aborted.")
    frame = _read_dataframe(SourceFile(path=source, is_excel=is_excel, sheet=sheet))
    columns = list(frame.columns)

    _print_columns(columns)
    default_fd = train_config.label_column if train_config.label_column in columns else ""
    label_column_raw = Prompt.ask(
        f"Fd target column{_index_hint(default_fd, columns)} — name or index "
        "(empty if absent — evaluation is skipped)",
        default=default_fd,
    ).strip()
    label_column: str | None = _resolve_column(label_column_raw, columns) if label_column_raw else None
    if label_column_raw and label_column is None:
        console.print(f"[yellow]Column '{label_column_raw}' not found — evaluation will be skipped.[/yellow]")

    console.print("[bold]Map training columns -> new file columns (name or index)[/bold]")
    mapping: dict[str, str] = {}
    for col in train_config.input_columns:
        default = col if col in columns else ""
        if default == "":
            console.print(f"[yellow]Warning:[/yellow] '{col}' missing in new file.")
        raw = Prompt.ask(f"  '{col}' →{_index_hint(default, columns)}", default=default)
        resolved = _resolve_column(raw, columns)
        if resolved is None:
            raise typer.BadParameter(
                f"Column '{raw}' not found in new file (training column '{col}')."
            )
        mapping[col] = resolved

    inputs = [
        JsonInput(
            json_value=json.dumps(
                {col: _json_safe(record.get(mapping[col])) for col in train_config.input_columns},
                ensure_ascii=False,
            )
        )
        for record in frame.to_dict(orient="records")
    ]

    predictions_frame = frame.copy()
    true_labels: list[str] | None = None
    if label_column is not None:
        true_labels = [_fd_label(record.get(label_column)) for record in frame.to_dict(orient="records")]

    cache_key = _hash({"source": str(source), "sheet": sheet, "mapping": mapping})
    report_rows: list[dict[str, Any]] = []
    for m_hash, path, meta in trained:
        method_key = meta["method_key"]
        console.print(f"[bold]Predicting[/bold] {meta['method_name']}…")
        algorithm = joblib.load(path / "model.joblib")
        cache_file = _inference_cache_file(settings_path, cache_key, method_key, m_hash)
        try:
            predicted_labels = _predict_with_cache(
                algorithm=algorithm,
                inputs=inputs,
                cache_file=cache_file,
                description=meta["method_name"],
                chunk_size=_inference_chunk_size(method_key),
            )
        except Exception as exc:  # noqa: BLE001
            console.print(f"[red]  failed:[/red] {exc}")
            report_rows.append({"meta": meta, "m_hash": m_hash, "error": str(exc)})
            continue
        col = f"fd_prediction_{method_key}_{m_hash[:8]}"
        predictions_frame[col] = predicted_labels

        row: dict[str, Any] = {"meta": meta, "m_hash": m_hash, "column": col}
        if true_labels is not None:
            row["metrics"], row["confusion"] = _score_predictions(true_labels, predicted_labels)
        report_rows.append(row)
        console.print(f"[green]  ✔[/green] column '{col}' (cache: {cache_file})")

    out_dir = inference_dir(train_config.materiel, train_config.settings_hash)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    default_out = out_dir / f"{source.stem}_{stamp}.xlsx"
    out_path = Path(Prompt.ask("Save results to", default=str(default_out))).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    predictions_frame.to_excel(out_path, index=False)
    console.print(f"[green]Saved:[/green] {out_path}")

    report_path = out_path.with_suffix(".md")
    report_path.write_text(
        _build_inference_report(
            train_config=train_config,
            source=source,
            sheet=sheet,
            label_column=label_column,
            mapping=mapping,
            rows=report_rows,
        )
    )
    console.print(f"[green]Report:[/green] {report_path}")


def _inference_chunk_size(method_key: str) -> int:
    """LLM methods are 1-by-1 (each call costs seconds). sklearn batches well."""
    return 1 if "llm" in method_key.lower() else 200


def _inference_cache_file(
    settings_path: Path, cache_key: str, method_key: str, m_hash: str
) -> Path:
    return settings_path / "inference" / "cache" / f"{method_key}_{m_hash[:8]}_{cache_key}.json"


def _predict_with_cache(
    *,
    algorithm: Any,
    inputs: list[JsonInput],
    cache_file: Path,
    description: str,
    chunk_size: int,
) -> list[str | None]:
    """Predict ``inputs`` chunk by chunk, persisting ``{index: label}`` after each chunk."""
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache: dict[str, str | None] = {}
    if cache_file.exists():
        try:
            cache = json.loads(cache_file.read_text())
        except json.JSONDecodeError:
            cache = {}

    predictions: list[str | None] = [cache.get(str(i)) for i in range(len(inputs))]
    missing = [i for i, value in enumerate(predictions) if value is None]
    if not missing:
        return predictions

    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(),
        TimeRemainingColumn(),
        console=console,
        transient=True,
    ) as progress:
        task = progress.add_task(
            f"{description} ({len(predictions) - len(missing)} cached, {len(missing)} to do)",
            total=len(missing),
        )
        for chunk_start in range(0, len(missing), chunk_size):
            chunk = missing[chunk_start: chunk_start + chunk_size]
            chunk_inputs = [inputs[idx] for idx in chunk]
            chunk_preds = algorithm.classify(chunk_inputs)
            for idx, pred in zip(chunk, chunk_preds, strict=True):
                label = pred.label_id
                predictions[idx] = label
                cache[str(idx)] = label
            cache_file.write_text(json.dumps(cache, ensure_ascii=False))
            progress.update(task, advance=len(chunk))

    return predictions


def _score_predictions(
    y_true: list[str], y_pred: list[str | None]
) -> tuple[dict[str, float], dict[str, dict[str, int]]]:
    from libs.ml.metrics import accuracy, f1_score, precision, recall

    paired = [(t, p) for t, p in zip(y_true, y_pred, strict=True) if p is not None]
    if not paired:
        return {}, {}
    y_t = [t for t, _ in paired]
    y_p = [p for _, p in paired]
    metrics = {
        "accuracy": accuracy(y_t, y_p),
        "precision": precision(y_t, y_p),
        "recall": recall(y_t, y_p),
        "f1": f1_score(y_t, y_p),
    }
    confusion: dict[str, dict[str, int]] = {}
    for t, p in paired:
        confusion.setdefault(str(t), {})[str(p)] = confusion.setdefault(str(t), {}).get(str(p), 0) + 1
    per_class = _per_class_recall(confusion)
    metrics.update(_imbalance_metrics(confusion, per_class))
    return metrics, confusion


def _build_inference_report(
    *,
    train_config: TrainConfig,
    source: Path,
    sheet: str | None,
    label_column: str | None,
    mapping: dict[str, str],
    rows: list[dict[str, Any]],
) -> str:
    lines: list[str] = []
    lines.append(f"# Inference report · {source.name}")
    lines.append(f"_Generated {datetime.now().isoformat(timespec='seconds')}_\n")
    lines.append("## Source")
    lines.append(f"- file: `{source}`")
    if sheet:
        lines.append(f"- sheet: `{sheet}`")
    lines.append(f"- materiel: `{train_config.materiel}`")
    lines.append(f"- settings hash: `{train_config.settings_hash}`")
    lines.append(f"- evaluation: {'**enabled** (Fd column `' + label_column + '`)' if label_column else '_skipped (no Fd column)_'}\n")

    lines.append("## Column mapping")
    lines.append("| training column | new file column |")
    lines.append("|---|---|")
    for train_col, new_col in mapping.items():
        lines.append(f"| `{train_col}` | `{new_col}` |")
    lines.append("")

    lines.append("## Methods")
    for row in rows:
        meta = row["meta"]
        lines.append(f"### {meta['method_name']}  ·  `{row['m_hash']}`")
        params = meta.get("params") or {}
        if params:
            lines.append("- params: " + ", ".join(f"`{k}={json.dumps(v, ensure_ascii=False)}`" for k, v in params.items()))
        cv = meta.get("cv_metrics") or {}
        if cv:
            lines.append("- CV (training):")
            for key in ("binary_recall_gt0", "positive_recall", "accuracy", "precision", "recall", "f1"):
                if key in cv:
                    std = cv.get(f"{key}_std")
                    suffix = f" ± {std:.3f}" if isinstance(std, (int, float)) else ""
                    lines.append(f"  - {key}: {cv[key]:.3f}{suffix}")
        train_per_class = meta.get("per_class_recall") or {}
        if train_per_class:
            lines.append("- CV per-class recall: " + ", ".join(
                f"`{label}`: {value:.2f}" for label, value in sorted(train_per_class.items())
            ))
        if "error" in row:
            lines.append(f"- [error] {row['error']}\n")
            continue
        lines.append(f"- prediction column: `{row['column']}`")
        metrics = row.get("metrics") or {}
        if metrics:
            lines.append("- inference metrics:")
            for key in ("binary_recall_gt0", "positive_recall", "accuracy", "precision", "recall", "f1"):
                if key in metrics:
                    lines.append(f"  - {key}: {metrics[key]:.3f}")
        infer_per_class = _per_class_recall(row.get("confusion") or {})
        if infer_per_class:
            lines.append("- inference per-class recall: " + ", ".join(
                f"`{label}`: {value:.2f}" for label, value in sorted(infer_per_class.items())
            ))
        confusion = row.get("confusion") or {}
        if confusion:
            labels = sorted({lab for inner in confusion.values() for lab in inner} | set(confusion.keys()))
            header = "| true \\ pred | " + " | ".join(labels) + " |"
            sep = "|---|" + "---|" * len(labels)
            lines.append("")
            lines.append(header)
            lines.append(sep)
            for true_label in labels:
                row_counts = confusion.get(true_label, {})
                cells = [str(row_counts.get(p, 0)) for p in labels]
                lines.append(f"| {true_label} | " + " | ".join(cells) + " |")
        lines.append("")
    return "\n".join(lines)


# ─── List command ────────────────────────────────────────────────────────────


@app.command("list")
def list_configs() -> None:
    """List all trained configurations under .bad/."""
    _print_banner()
    if not BAD_ROOT.exists():
        console.print(f"[dim]{BAD_ROOT}/ does not exist yet.[/dim]")
        return
    materiel_dirs = [
        d for d in sorted(BAD_ROOT.iterdir()) if d.is_dir() and not d.name.startswith("_")
    ]
    if not materiel_dirs:
        console.print("[dim]empty[/dim]")
        return
    for materiel_dir in materiel_dirs:
        console.print(f"\n[bold cyan]{materiel_dir.name}[/bold cyan]")
        for settings in sorted(materiel_dir.iterdir()):
            config_file = settings / "config.json"
            if not config_file.exists():
                continue
            cfg = _load_config(config_file)
            here = "" if cfg.source_path.exists() else " [red](missing)[/red]"
            console.print(f"  {settings.name} · {cfg.label_column} ← {len(cfg.input_columns)} cols")
            console.print(f"    source: {cfg.source_path}{here}")
            entries = _list_method_entries(settings)
            if not entries:
                console.print("    [dim]no trained methods[/dim]")
            for m_hash, _path, meta in entries:
                if "error" in meta:
                    short = (meta["error"] or "").splitlines()[0][:120]
                    console.print(
                        f"    [red]✗[/red] {meta['method_name']} · {m_hash[:8]} · [red]{short}[/red]"
                    )
                    continue
                metrics = meta.get("cv_metrics") or {}
                primary = (
                    metrics.get("binary_recall_gt0")
                    or metrics.get("positive_recall")
                    or metrics.get("f1")
                    or metrics.get("accuracy")
                )
                primary_str = f"{primary:.3f}" if isinstance(primary, (int, float)) else "—"
                console.print(f"    [green]✔[/green] {meta['method_name']} · {m_hash[:8]} · {primary_str}")


@app.command()
def scan(
    folder: Path = typer.Argument(..., exists=True, file_okay=False, dir_okay=True),
    recursive: bool = typer.Option(True, "--recursive/--no-recursive", "-r/-R"),
) -> None:
    """List xlsx/csv files in ``folder`` that have an Fd column, with per-sheet class repartition."""
    _print_banner()
    results = _scan_folder(folder, recursive=recursive)
    if not results["files"]:
        console.print(f"[dim]No Fd column found in any file under {folder}.[/dim]")
    else:
        _print_scan_table(results)
    saved = _save_scan(results)
    console.print(f"\n[green]Scan saved:[/green] {saved}")


def _scan_folder(folder: Path, *, recursive: bool) -> dict[str, Any]:
    folder = folder.resolve()
    pattern_xlsx = "**/*.xlsx" if recursive else "*.xlsx"
    pattern_xls = "**/*.xls" if recursive else "*.xls"
    pattern_csv = "**/*.csv" if recursive else "*.csv"
    paths = sorted(
        set(folder.glob(pattern_xlsx)) | set(folder.glob(pattern_xls)) | set(folder.glob(pattern_csv))
    )
    files: list[dict[str, Any]] = []
    for path in paths:
        sheets = _scan_file_sheets(path)
        if not sheets:
            continue
        files.append(
            {
                "path": str(path),
                "sheets": [
                    {"name": name, "rows": rows, "distribution": dist}
                    for name, rows, dist in sheets
                ],
            }
        )
    return {
        "folder": str(folder),
        "recursive": recursive,
        "scanned_at": datetime.now().isoformat(timespec="seconds"),
        "files": files,
    }


def _save_scan(results: dict[str, Any]) -> Path:
    SCANS_DIR.mkdir(parents=True, exist_ok=True)
    scan_id = _hash({"folder": results["folder"], "recursive": results["recursive"]})
    path = SCANS_DIR / f"{scan_id}.json"
    path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    return path


def _list_scans() -> list[tuple[Path, dict[str, Any]]]:
    if not SCANS_DIR.exists():
        return []
    out: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(SCANS_DIR.glob("*.json")):
        out.append((path, _migrate_scan(json.loads(path.read_text()))))
    return out


def _migrate_scan(results: dict[str, Any]) -> dict[str, Any]:
    """Convert legacy distributions stored as percentages back to integer counts.

    Heuristic: compare sum(distribution) with the sheet ``rows`` count. If they match,
    the values are already counts. Otherwise (e.g. they sum to ~100), they are
    percentages and need to be multiplied back.
    """
    for entry in results.get("files", []):
        for sheet in entry.get("sheets", []):
            distribution = sheet.get("distribution") or {}
            if not distribution:
                continue
            rows = int(sheet.get("rows", 0))
            total = sum(float(v) for v in distribution.values())
            if rows > 0 and abs(total - rows) <= 1:
                sheet["distribution"] = {k: int(round(float(v))) for k, v in distribution.items()}
            else:
                base = rows if rows > 0 else int(round(total))
                sheet["distribution"] = {
                    k: int(round(base * float(v) / 100.0)) for k, v in distribution.items()
                }
    return results


MAIN_FD_LABELS = ["<fd>0.0", "<fd>0.1", "<fd>0.5", "<fd>1.0"]


def _print_scan_table(results: dict[str, Any]) -> None:
    table = _new_distribution_table(with_index=False)
    for entry in results["files"]:
        for sheet in entry["sheets"]:
            _add_distribution_row(
                table,
                file_label=Path(entry["path"]).name,
                sheet_name=sheet["name"] or "(csv)",
                rows=int(sheet["rows"]),
                distribution=sheet["distribution"],
            )
    console.print(table)


def _new_distribution_table(*, with_index: bool) -> Table:
    table = Table(show_lines=True, expand=False, header_style="bold cyan", pad_edge=False)
    if with_index:
        table.add_column("#", justify="right", style="cyan", no_wrap=True)
    table.add_column("File", style="white", overflow="fold", max_width=50)
    table.add_column("Sheet", style="white", overflow="fold", max_width=24)
    table.add_column("rows", justify="right", style="dim white", no_wrap=True)
    for label in MAIN_FD_LABELS:
        table.add_column(label, justify="right", style="white", no_wrap=True)
    table.add_column("other", justify="right", style="yellow", no_wrap=True)
    return table


def _add_distribution_row(
    table: Table,
    *,
    file_label: str,
    sheet_name: str,
    rows: int,
    distribution: dict[str, int],
    index: int | None = None,
) -> None:
    total = sum(distribution.values()) or 1
    cells = [_cell(distribution.get(label, 0), total) for label in MAIN_FD_LABELS]
    other_total = sum(c for label, c in distribution.items() if label not in MAIN_FD_LABELS)
    cells.append(_cell(other_total, total))
    base = [str(index)] if index is not None else []
    table.add_row(*base, file_label, sheet_name, str(rows), *cells)


def _cell(count: int, total: int) -> str:
    if count == 0:
        return ""
    return f"{count} ({100.0 * count / total:.1f}%)"


def _has_fd_column(columns: Iterable[Any]) -> str | None:
    for column in columns:
        if isinstance(column, str) and column.strip().lower() == "fd":
            return column
    return None


def _scan_file_sheets(path: Path) -> list[tuple[str, int, dict[str, float]]]:
    """Return ``(sheet_name, row_count, label_distribution)`` for sheets exposing an Fd column."""
    out: list[tuple[str, int, dict[str, float]]] = []
    suffix = path.suffix.lower()
    try:
        if suffix == ".csv":
            frame = _read_csv(path)
            column = _has_fd_column(frame.columns)
            if column is not None:
                out.append(("", len(frame), _label_distribution(frame[column])))
        elif suffix in {".xlsx", ".xlsm", ".xls"}:
            for sheet_name in pd.ExcelFile(path).sheet_names:
                frame = pd.read_excel(path, sheet_name=sheet_name)
                column = _has_fd_column(frame.columns)
                if column is not None:
                    out.append((sheet_name, len(frame), _label_distribution(frame[column])))
    except Exception as exc:  # noqa: BLE001
        console.print(f"[yellow]Skipping {path}: {exc}[/yellow]")
    return out


def _label_distribution(series: pd.Series) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in series.tolist():
        label = _fd_label(value)
        counts[label] = counts.get(label, 0) + 1
    return counts


def _format_distribution(distribution: dict[str, int]) -> str:
    if not distribution:
        return "—"
    total = sum(distribution.values()) or 1
    return ", ".join(
        f"{label}: {count} ({100.0 * count / total:.1f}%)"
        for label, count in sorted(distribution.items(), key=lambda kv: -kv[1])
    )


if __name__ == "__main__":
    app()
