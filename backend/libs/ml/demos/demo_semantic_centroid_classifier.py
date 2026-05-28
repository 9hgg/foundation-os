"""Demo: semantic-centroid JSON classifier on EDF Diesel BPE Fd.

Default mode uses the real EDF dataset with bounded sampling so local Ollama
runs stay practical. Use ``--offline-smoke`` for a tiny deterministic mechanics
test that does not require Ollama.

Run real EDF demo:
    uv run libs/ml/demos/demo_semantic_centroid_classifier.py

Run offline smoke demo:
    uv run libs/ml/demos/demo_semantic_centroid_classifier.py --offline-smoke
"""

from __future__ import annotations

import json
import logging
import math
import random
import re
from collections import Counter
from collections.abc import Sequence
from typing import Any

import numpy as np
import typer
from rich import box
from rich.console import Console
from rich.table import Table

from libs.ml import (
    ClassificationTarget,
    DatasetSample,
    JSONClassificationDataset,
    JsonInput,
    Label,
    OllamaEmbeddingClient,
)
from libs.ml.demos.demo_benchmark import _make_edf_diesel_bpe_fd_dataset
from libs.ml.demos.demo_mixture_of_experts import make_splits, print_split_stats
from libs.ml.evaluation.plots import (
    print_confusion_matrix,
    print_precision_recall_curves,
    print_precision_recall_table,
    save_precision_recall_curves,
)
from libs.ml.llm import (
    EmbeddingResponse,
    LLMMessage,
    LLMResponse,
    OpenAILLMClient,
)
from libs.ml.methods.semantic_centroid import SemanticCentroidJsonClassifier
from libs.ml.metrics import accuracy, macro_f1, per_class_f1
from libs.ml.registry import TaskFormalism
from libs.ml.tracing import TRACE
from parc.naming import ecs

console = Console()


class DemoCentroidLLMClient:
    """Tiny deterministic client used only for --offline-smoke."""

    _CENTROIDS = {
        "<fd>0.0": [
            {
                "name": "no functional impact",
                "description": "Observation is monitored or corrected without loss of backup function.",
                "examples": [
                    "routine check acceptable",
                    "minor anomaly but equipment remains available",
                ],
            },
            {
                "name": "preventive maintenance",
                "description": "Maintenance, replacement, or inspection is planned without immediate reliability impact.",
                "examples": [
                    "planned inspection",
                    "preventive replacement during outage",
                ],
            },
        ],
        "<fd>0.1": [
            {
                "name": "degraded but available",
                "description": "Equipment is degraded or performance is reduced but the function remains available.",
                "examples": [
                    "small leak with monitoring",
                    "vibration above warning threshold",
                ],
            },
            {
                "name": "partial corrective action",
                "description": "A defect requires corrective action but does not create full unavailability.",
                "examples": [
                    "replace auxiliary pump after weak flow",
                    "repair sensor chain after intermittent alarm",
                ],
            },
        ],
        "<fd>1.0": [
            {
                "name": "backup source unavailable",
                "description": "The diesel or backup electrical source is unavailable, fails to start, or trips under demand.",
                "examples": [
                    "diesel failed to start",
                    "generator unavailable after trip",
                ],
            },
            {
                "name": "complete functional loss",
                "description": "A required safety function is lost until repair or requalification.",
                "examples": [
                    "loss of internal electrical source",
                    "pump does not deliver required flow",
                ],
            },
        ],
    }
    _REFINEMENTS = {
        "<fd>0.1": [
            {
                "name": "vibration warning trend",
                "description": "Vibration or warning-threshold anomalies define a degraded-but-available condition.",
                "examples": [
                    "minor vibration above warning threshold",
                    "vibration trend monitored",
                ],
            }
        ],
    }

    def complete(
        self,
        messages: Sequence[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        prompt = "\n".join(message.content for message in messages)
        normalized_prompt = prompt.lower()
        if any(
            term in normalized_prompt
            for term in ("failed to start", "generator trip", "unavailable")
        ):
            label_id = "<fd>1.0"
        elif any(
            term in normalized_prompt
            for term in ("vibration", "weak flow", "intermittent alarm")
        ):
            label_id = "<fd>0.1"
        else:
            label_id = "<fd>0.0"
        centroids = (
            self._REFINEMENTS.get(label_id, [])
            if "misclassified these samples" in prompt
            else self._CENTROIDS[label_id]
        )
        payload = {"centroids": centroids or self._CENTROIDS[label_id][:1]}
        return LLMResponse(text=json.dumps(payload), model=model or "demo-centroid-llm")


class DemoEmbeddingClient:
    """Small deterministic semantic embedding client used only for --offline-smoke."""

    _CONCEPTS = [
        {
            "routine",
            "inspection",
            "acceptable",
            "passed",
            "preventive",
            "planned",
            "available",
            "monitoring",
        },
        {
            "degraded",
            "weak",
            "vibration",
            "warning",
            "corrective",
            "replacement",
            "flow",
            "reduced",
            "alarm",
        },
        {
            "unavailable",
            "failed",
            "fail",
            "trip",
            "loss",
            "lost",
            "complete",
            "start",
            "source",
            "function",
        },
        {"diesel", "generator", "backup", "electrical", "internal"},
        {"pump", "sensor", "auxiliary", "flow"},
    ]

    def embed(
        self,
        texts: Sequence[str],
        *,
        model: str | None = None,
    ) -> EmbeddingResponse:
        return EmbeddingResponse(
            embeddings=[self._embed_one(text) for text in texts],
            model=model or "demo-embedding",
        )

    def _embed_one(self, text: str) -> list[float]:
        tokens = set(re.findall(r"[a-zA-Z0-9.]+", text.lower()))
        vector = [
            float(sum(1 for token in tokens if token in concept))
            for concept in self._CONCEPTS
        ]
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector


def _offline_dataset() -> JSONClassificationDataset:
    rows = [
        (
            {
                "rf": "LHQ001GE",
                "summary": "routine inspection, no anomaly found, periodic test passed",
            },
            "<fd>0.0",
        ),
        (
            {
                "rf": "LHQ204PO",
                "summary": "preventive replacement planned during outage",
            },
            "<fd>0.0",
        ),
        (
            {
                "rf": "LHQ416MT",
                "summary": "minor vibration above warning threshold, trend monitored",
            },
            "<fd>0.1",
        ),
        (
            {
                "rf": "LHQ204PO",
                "summary": "auxiliary pump weak flow, replacement required",
            },
            "<fd>0.1",
        ),
        (
            {
                "rf": "LHP001GE",
                "summary": "diesel failed to start during test, backup source unavailable",
            },
            "<fd>1.0",
        ),
        (
            {
                "rf": "LHQ001GE",
                "summary": "generator trip under load, internal electrical source unavailable",
            },
            "<fd>1.0",
        ),
    ]
    return JSONClassificationDataset(
        title="Semantic centroid smoke demo",
        formalism=TaskFormalism.JSON_TO_LABEL,
        samples=[
            DatasetSample(
                input=JsonInput(
                    json_value=json.dumps(
                        JsonInput.serialize(payload), ensure_ascii=False
                    )
                ),
                target=ClassificationTarget(label_id=label_id),
            )
            for payload, label_id in rows
        ],
    )


def _edf_enrich(text: str, *, max_chars: int = 6000) -> str:
    """Extract relevant fields from EDF JSON and truncate for LLM/embedding calls."""
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        value = {"text": text}

    fields = [
        ("site", value.get("Site", "") or value.get("site", "")),
        ("rf", value.get("RF", "") or value.get("rf", "")),
        ("resume_1", value.get("Résumé 1", "") or value.get("summary", "")),
        ("resume_2", value.get("Résumé 2", "") or value.get("comment", "")),
        ("text", value.get("text", "")),
    ]
    compact = "\n".join(f"{name}: {content}" for name, content in fields if content)
    # normalize whitespace and trim:
    compact = re.sub(r"\s+", " ", compact).strip()

    # to lowercase:
    compact = compact.lower()

    # remove <x> and </x>
    compact = compact.replace("<x>", "").replace("</x>", "")
    # replace " dt " with "demande de travaux" (common abbreviation in comments)
    compact = compact.replace(" dt ", " demande de travaux ")
    # replace " ot " with "ordre de travail" (common abbreviation in comments)
    compact = compact.replace(" ot ", " ordre de travail ")
    # ex: "rex du pqs dmt rge 4lhp201ge-"
    # replace " ep " with " entretien périodique " (common abbreviation in comments)
    compact = compact.replace(" ep ", " essai périodique ")

    ## work over ECS
    found_rfs = ecs.extract_references(compact)
    # set of list
    found_rfs = list(set(found_rfs))

    for rf in found_rfs:
        rf_details = ecs.validate_rf(rf.canonical, limit=1)
        if rf_details.is_exact_match and rf_details.candidates:
            candidate = rf_details.candidates[0]
            details_str = f"{candidate.system_label} {candidate.system}"
            compact = compact.replace(rf.raw, f"{rf.canonical}({details_str})", 1)
        else:
            compact = compact.replace(rf.raw, rf.canonical, 1)

    return compact[:max_chars]


def _sample_per_label(samples: list[Any], *, per_label: int, seed: int) -> list[Any]:
    rng = random.Random(seed)
    grouped: dict[str, list[Any]] = {}
    for sample in samples:
        grouped.setdefault(sample.target.label_id, []).append(sample)  # type: ignore[union-attr]

    selected: list[Any] = []
    for label_id in sorted(grouped):
        rows = list(grouped[label_id])
        rng.shuffle(rows)
        selected.extend(rows[:per_label])
    rng.shuffle(selected)
    return selected


def _limit_eval_samples(
    samples: list[Any], *, limit: int | None, seed: int
) -> list[Any]:
    """Return up to ``limit`` eval samples, stratified by label so every class
    has at least ``min_per_label`` representatives regardless of limit."""
    if limit is None or len(samples) <= limit:
        return samples
    rng = random.Random(seed)  # noqa: S311
    by_label: dict[str, list[Any]] = {}
    for s in samples:
        by_label.setdefault(s.target.label_id, []).append(s)  # type: ignore[union-attr]
    n_labels = len(by_label)
    # Reserve slots for minority classes: at least min_per_label each
    min_per_label = max(10, limit // (n_labels * 4))
    reserved = n_labels * min_per_label
    remaining_slots = max(0, limit - reserved)
    # Fill guaranteed slots first
    selected: list[Any] = []
    for lbl_samples in by_label.values():
        rows = list(lbl_samples)
        rng.shuffle(rows)
        selected.extend(rows[:min_per_label])
    # Fill remaining slots proportionally from leftovers
    leftovers: list[Any] = []
    for lbl_samples in by_label.values():
        leftovers.extend(lbl_samples[min_per_label:])
    rng.shuffle(leftovers)
    selected.extend(leftovers[:remaining_slots])
    rng.shuffle(selected)
    return selected


def _print_results(
    *,
    classifier: SemanticCentroidJsonClassifier,
    y_true: list[str],
    predictions: list[Any],
    show_predictions: int,
    pr_curve_path: str = "pr_curves_semantic_centroid.png",
) -> None:
    y_pred = [prediction.label_id or "" for prediction in predictions]
    labels = sorted(set(y_true) | set(y_pred))

    console.rule("[bold green]Semantic centroid classifier[/bold green]")
    console.print(f"Accuracy: [cyan]{accuracy(y_true, y_pred):.3f}[/cyan]")
    console.print(
        f"Macro F1: [bold yellow]{macro_f1(y_true, y_pred, labels=labels):.3f}[/bold yellow]"
    )
    console.print(f"Refinement history: [cyan]{classifier.refinement_history_}[/cyan]")

    # ── Confusion matrix ──────────────────────────────────────────────────────
    print_confusion_matrix(y_true, y_pred, labels)

    # ── PR curves — per-class score = max centroid similarity for that class ──
    # Each prediction carries centroid_scores: [{label_id, name, score}, ...]
    # We take the max score across all centroids of each class as the class score.
    Y_true = np.array([[1 if t == lbl else 0 for lbl in labels] for t in y_true])
    Y_proba = np.zeros((len(predictions), len(labels)), dtype=float)
    for i, pred in enumerate(predictions):
        centroid_scores = (pred.metadata or {}).get("centroid_scores", [])
        class_max: dict[str, float] = {}
        for entry in centroid_scores:
            lid = entry["label_id"]
            s = float(entry["score"])
            if s > class_max.get(lid, -1.0):
                class_max[lid] = s
        for j, lbl in enumerate(labels):
            Y_proba[i, j] = class_max.get(lbl, 0.0)

    print_precision_recall_curves(Y_true, Y_proba, labels)
    print_precision_recall_table(Y_true, Y_proba, labels)
    save_precision_recall_curves(
        Y_true,
        Y_proba,
        labels,
        path=pr_curve_path,
        title="PR curves — semantic centroid classifier",
    )

    f1_by_label = per_class_f1(y_true, y_pred, labels=labels)
    f1_table = Table(title="Per-class F1", box=box.ROUNDED)
    f1_table.add_column("Label", style="cyan")
    f1_table.add_column("F1", justify="right")
    f1_table.add_column("Support", justify="right")
    support = Counter(y_true)
    for label in labels:
        f1_table.add_row(label, f"{f1_by_label[label]:.3f}", str(support[label]))
    console.print(f1_table)

    centroid_table = Table(title="Generated semantic centroids", box=box.ROUNDED)
    centroid_table.add_column("Label", style="cyan")
    centroid_table.add_column("Centroid")
    centroid_table.add_column("Description")
    for centroid in classifier.centroids_:
        centroid_table.add_row(centroid.label_id, centroid.name, centroid.description)
    console.print(centroid_table)

    # Sample predictions balanced across all labels
    rng = random.Random(42)  # noqa: S311
    per_label: dict[str, list[tuple[str, Any]]] = {}
    for true_lbl, pred in zip(y_true, predictions, strict=True):
        per_label.setdefault(true_lbl, []).append((true_lbl, pred))
    n_per_label = max(1, show_predictions // len(per_label))
    sampled: list[tuple[str, Any]] = []
    for lbl in sorted(per_label):
        rows = list(per_label[lbl])
        rng.shuffle(rows)
        sampled.extend(rows[:n_per_label])
    rng.shuffle(sampled)

    prediction_table = Table(
        title=f"Predictions sample ({len(sampled)}, balanced across labels)",
        box=box.ROUNDED,
    )
    prediction_table.add_column("True", style="cyan")
    prediction_table.add_column("Pred")
    prediction_table.add_column("✓", justify="center", width=3)
    prediction_table.add_column("Score", justify="right")
    prediction_table.add_column("Nearest centroid")
    for true_lbl, prediction in sampled:
        pred_lbl = prediction.label_id or "?"
        ok = "✓" if pred_lbl == true_lbl else "[red]✗[/red]"
        prediction_table.add_row(
            true_lbl,
            pred_lbl,
            ok,
            f"{prediction.score or 0.0:.3f}",
            str((prediction.metadata or {}).get("centroid_name", "?")),
        )
    console.print(prediction_table)


def _configure_llm_logging() -> None:
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
        force=True,
    )
    for logger_name in (
        "libs.ml.llm.structured",
        "libs.ml.llm.providers",
        "libs.ml.methods.semantic_centroid",
    ):
        logging.getLogger(logger_name).setLevel(logging.DEBUG)


app = typer.Typer(help=__doc__)


@app.command()
def main(
    offline_smoke: bool = typer.Option(
        False, "--offline-smoke", help="Run the tiny deterministic smoke demo."
    ),
    llm_model: str = typer.Option(
        "gemma4:e2b",
        "--llm-model",
        help="Ollama chat model used to generate centroids.",
    ),
    embedding_model: str = typer.Option(
        "nomic-embed-text-v2-moe", "--embedding-model", help="Ollama embedding model."
    ),
    ollama_url: str = typer.Option(
        "http://localhost:11434", "--ollama-url", help="Base Ollama URL."
    ),
    train_per_label: int = typer.Option(
        12, "--train-per-label", help="Training samples per label for centroid fit."
    ),
    eval_limit: int = typer.Option(
        400, "--eval-limit", help="Eval sample limit; use 0 for full eval."
    ),
    max_centroids_per_label: int = typer.Option(6, "--max-centroids-per-label"),
    refinement_iterations: int = typer.Option(1, "--refinement-iterations"),
    embedding_batch_size: int = typer.Option(16, "--embedding-batch-size"),
    show_predictions: int = typer.Option(20, "--show-predictions"),
    seed: int = typer.Option(42, "--seed"),
    label_score_aggregation: str = typer.Option(
        "max",
        "--label-score-aggregation",
        help="max: nearest centroid wins. mean: average over all label centroids (penalises redundant centroids).",
    ),
    contrast_per_label: int = typer.Option(
        2,
        "--contrast-per-label",
        help="Counter-examples from each other class injected into centroid generation prompts (0 = disabled).",
    ),
    cross_label_threshold: float = typer.Option(
        1.0,
        "--cross-label-threshold",
        help="Prune centroids with cosine similarity > threshold to any other-label centroid (1.0 = disabled).",
    ),
    trace: bool = typer.Option(
        False, "--trace", help="Show structured_completion traces."
    ),
    log_llm: bool = typer.Option(
        False, "--log-llm", help="Configure Python logging for LLM and embedding calls."
    ),
) -> None:
    if log_llm:
        _configure_llm_logging()
    TRACE.enabled = trace

    if offline_smoke:
        dataset = _offline_dataset()
        train_samples = dataset.labeled_samples()
        eval_samples = train_samples
        llm_client: Any = DemoCentroidLLMClient()
        embedding_client: Any = DemoEmbeddingClient()
        enrich = lambda text: _edf_enrich(text, max_chars=1200)
        clustering_model = None
    else:
        dataset = _make_edf_diesel_bpe_fd_dataset()
        train_ds, eval_ds = make_splits(dataset)
        print_split_stats(train_ds, eval_ds)
        train_samples = _sample_per_label(
            train_ds.labeled_samples(),
            per_label=train_per_label,
            seed=seed,
        )
        eval_samples = _limit_eval_samples(
            eval_ds.labeled_samples(),
            limit=None if eval_limit == 0 else eval_limit,
            seed=seed,
        )
        llm_client = OpenAILLMClient(model="gpt-5.4-nano")
        clustering_model = llm_client.model
        embedding_client = OllamaEmbeddingClient(
            model=embedding_model,
            base_url=f"{ollama_url.rstrip('/')}/api/embed",
        )
        enrich = lambda text: _edf_enrich(text, max_chars=1800)

    console.print(
        f"   train samples: [cyan]{len(train_samples)}[/cyan]  "
        f"eval samples: [cyan]{len(eval_samples)}[/cyan]"
    )

    train_inputs = [sample.input for sample in train_samples]
    train_targets = [
        Label(id=sample.target.label_id, name=sample.target.label_id)  # type: ignore[union-attr]
        for sample in train_samples
    ]
    eval_inputs = [sample.input for sample in eval_samples]
    y_eval = [sample.target.label_id for sample in eval_samples]  # type: ignore[union-attr]

    classifier = SemanticCentroidJsonClassifier(
        llm_client=llm_client,
        embedding_client=embedding_client,
        clustering_model=clustering_model,
        embedding_model=embedding_model,
        max_samples_per_label=train_per_label,
        max_centroids_per_label=max_centroids_per_label,
        refinement_iterations=refinement_iterations,
        embedding_batch_size=embedding_batch_size,
        label_score_aggregation=label_score_aggregation,  # type: ignore[arg-type]
        contrast_examples_per_other_label=contrast_per_label,
        cross_label_similarity_threshold=cross_label_threshold,
        enrich=enrich,
        seed=seed,
    )
    classifier.fit(train_inputs, train_targets)
    predictions = classifier.classify(eval_inputs)
    _print_results(
        classifier=classifier,
        y_true=y_eval,
        predictions=predictions,
        show_predictions=show_predictions,
    )


if __name__ == "__main__":
    app()
