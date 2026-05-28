"""Terminal and file plots for ML evaluation."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from rich import box
from rich.console import Console
from rich.table import Table
from rich.text import Text
from sklearn.metrics import average_precision_score, precision_recall_curve

console = Console()

_COLORS = ["red", "green", "blue", "yellow", "magenta", "cyan", "white"]
_CHARS  = ["●", "◆", "▲", "■", "★", "◉", "◈"]


def print_precision_recall_curves(
    Y_true: np.ndarray,
    Y_proba: np.ndarray,
    label_names: list[str],
    *,
    width: int = 56,
    height: int = 16,
) -> None:
    """Render per-label precision-recall curves as ASCII art in the terminal."""
    grid: list[list[tuple[str, str]]] = [
        [("·", "bright_black")] * width for _ in range(height)
    ]
    ap_scores: dict[str, float] = {}
    for i, lbl in enumerate(label_names):
        if Y_true[:, i].sum() == 0:
            ap_scores[lbl] = float("nan")
            continue
        prec, rec, _ = precision_recall_curve(Y_true[:, i], Y_proba[:, i])
        ap_scores[lbl] = float(average_precision_score(Y_true[:, i], Y_proba[:, i]))
        color = _COLORS[i % len(_COLORS)]
        ch    = _CHARS[i % len(_CHARS)]
        for r, p in zip(rec, prec):
            x = max(0, min(int(r * (width - 1)), width - 1))
            y = max(0, min(int((1.0 - p) * (height - 1)), height - 1))
            grid[y][x] = (ch, color)

    text = Text()
    for row_idx, row in enumerate(grid):
        p_val = 1.0 - row_idx / (height - 1)
        if row_idx in (0, height - 1, height // 2):
            text.append(f"{p_val:.1f} │", style="dim")
        else:
            text.append("     │", style="dim")
        for ch, color in row:
            text.append(ch, style=color)
        text.append("\n")
    text.append("     └" + "─" * width + "\n", style="dim")
    pad = width // 2 - 3
    text.append(f"      0.0{' ' * pad}0.5{' ' * pad}1.0\n", style="dim")
    text.append(f"{'Recall':>{width // 2 + 6}}\n", style="dim")

    console.print("\n[bold cyan]Precision-Recall curves[/bold cyan]")
    console.print(text)

    legend = Table(box=box.SIMPLE, show_header=True)
    legend.add_column("Label", style="cyan")
    legend.add_column("", justify="center", width=3)
    legend.add_column("AP", justify="right", style="yellow")
    for i, lbl in enumerate(label_names):
        ap = ap_scores[lbl]
        legend.add_row(
            lbl,
            Text(_CHARS[i % len(_CHARS)], style=_COLORS[i % len(_COLORS)]),
            f"{ap:.3f}" if not np.isnan(ap) else "n/a",
        )
    console.print(legend)


def save_precision_recall_curves(
    Y_true: np.ndarray,
    Y_proba: np.ndarray,
    label_names: list[str],
    path: str | Path = "pr_curves.png",
    *,
    title: str = "Precision-Recall curves",
) -> Path:
    """Save per-label precision-recall curves as a PNG file.

    Returns the resolved output path.
    """
    import matplotlib.pyplot as plt

    path = Path(path)
    fig, ax = plt.subplots(figsize=(8, 6))

    recall_grid = np.linspace(0, 1, 200)
    for i, lbl in enumerate(label_names):
        if Y_true[:, i].sum() == 0:
            continue
        prec, rec, _ = precision_recall_curve(Y_true[:, i], Y_proba[:, i])
        ap = average_precision_score(Y_true[:, i], Y_proba[:, i])
        # Interpolated precision: at each recall point take max precision achievable
        # at that recall or higher (standard PASCAL VOC interpolation)
        prec_interp = np.array([
            prec[rec >= r].max() if (rec >= r).any() else 0.0
            for r in recall_grid
        ])
        ax.plot(recall_grid, prec_interp, label=f"{lbl}  (AP={ap:.3f})")

    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.05)
    ax.set_title(title)
    ax.legend(loc="lower left")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)

    console.print(f"   PR curve saved → [cyan]{path.resolve()}[/cyan]")
    return path


def print_precision_recall_table(
    Y_true: np.ndarray,
    Y_proba: np.ndarray,
    label_names: list[str],
    *,
    step: float = 0.1,
) -> None:
    """Show precision at every `step` of recall for each label.

    Uses the standard interpolation: precision at recall r =
    max(precision[i] for i where recall[i] >= r).
    """
    recall_levels = [round(r * step, 10) for r in range(int(1 / step) + 1)]

    # precision_at[label][recall_level] -> float | None
    curves: dict[str, dict[float, float | None]] = {}
    ap_scores: dict[str, float] = {}
    for i, lbl in enumerate(label_names):
        if Y_true[:, i].sum() == 0:
            curves[lbl] = {r: None for r in recall_levels}
            ap_scores[lbl] = float("nan")
            continue
        prec, rec, _ = precision_recall_curve(Y_true[:, i], Y_proba[:, i])
        ap_scores[lbl] = float(average_precision_score(Y_true[:, i], Y_proba[:, i]))
        curves[lbl] = {
            r: float(prec[rec >= r].max()) if (rec >= r).any() else None
            for r in recall_levels
        }

    table = Table(title="Precision at recall level", box=box.ROUNDED)
    table.add_column("Recall", style="dim", justify="right")
    for lbl in label_names:
        table.add_column(lbl, justify="right")

    for r in recall_levels:
        cells = []
        for lbl in label_names:
            val = curves[lbl][r]
            if val is None:
                cells.append("—")
            else:
                color = "green" if val >= 0.7 else "yellow" if val >= 0.4 else "red"
                cells.append(f"[{color}]{val:.2f}[/{color}]")
        table.add_row(f"{r:.1f}", *cells)

    # AP row
    table.add_section()
    table.add_row(
        "[bold]AP[/bold]",
        *[
            f"[bold]{ap_scores[lbl]:.3f}[/bold]" if not np.isnan(ap_scores[lbl]) else "n/a"
            for lbl in label_names
        ],
    )

    console.print("\n")
    console.print(table)


def print_multilabel_confusion(
    Y_true: np.ndarray,
    Y_pred: np.ndarray,
    label_names: list[str],
) -> None:
    """Per-label binary confusion table: TP / FP / TN / FN + precision/recall/F1."""
    table = Table(title="Per-label confusion", box=box.ROUNDED)
    table.add_column("Label", style="cyan")
    table.add_column("TP", justify="right")
    table.add_column("FP", justify="right")
    table.add_column("TN", justify="right")
    table.add_column("FN", justify="right")
    table.add_column("Precision", justify="right", style="yellow")
    table.add_column("Recall", justify="right", style="yellow")
    table.add_column("F1", justify="right", style="bold yellow")

    for i, lbl in enumerate(label_names):
        yt, yp = Y_true[:, i], Y_pred[:, i]
        tp = int(((yt == 1) & (yp == 1)).sum())
        fp = int(((yt == 0) & (yp == 1)).sum())
        tn = int(((yt == 0) & (yp == 0)).sum())
        fn = int(((yt == 1) & (yp == 0)).sum())
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec  = tp / (tp + fn) if (tp + fn) else 0.0
        f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        table.add_row(
            lbl,
            str(tp), str(fp), str(tn), str(fn),
            f"{prec:.2f}", f"{rec:.2f}", f"{f1:.2f}",
        )

    console.print(table)


def print_confusion_matrix(
    y_true: list[str],
    y_pred: list[str],
    label_names: list[str],
) -> None:
    """Multi-class confusion matrix as a Rich table (row = true, col = predicted).

    Each row shows percentages; the support (n) is appended to the row label so
    100%-on-diagonal artefacts from tiny classes are immediately visible.
    """
    from sklearn.metrics import confusion_matrix as sk_cm

    matrix = sk_cm(y_true, y_pred, labels=label_names)
    table = Table(title="Confusion matrix", box=box.SIMPLE_HEAVY)
    table.add_column("true \\ pred  (n)", style="dim")
    for lbl in label_names:
        table.add_column(lbl, justify="right")
    for i, true_lbl in enumerate(label_names):
        row_sum = int(matrix[i].sum())
        table.add_row(
            f"{true_lbl}  ({row_sum})",
            *[
                f"{matrix[i][j] / row_sum * 100:.0f}%" if row_sum else "—"
                for j in range(len(label_names))
            ],
        )
    console.print(table)
