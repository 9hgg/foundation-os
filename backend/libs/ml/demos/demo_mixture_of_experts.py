"""Mixture of experts demo — json->labels.

Idea: weak classifiers (keyword rules) handle high-confidence samples;
an LLM handles the rest.
"""

from __future__ import annotations

import json as _json
import random
from collections import Counter
from dataclasses import dataclass as _dc
from typing import Any

import numpy as np
from rich import box
from rich.console import Console
from rich.table import Table
from sklearn.feature_extraction.text import TfidfVectorizer

from libs.ml import (
    ClassificationTarget,
    DatasetSample,
    JSONClassificationDataset,
    JsonInput,
    JSONMultiLabelClassificationDataset,
    MultiLabelClassificationTarget,
)
from libs.ml.evaluation.plots import (
    print_confusion_matrix,
    print_multilabel_confusion,
    print_precision_recall_curves,
    print_precision_recall_table,
    save_precision_recall_curves,
)
from libs.ml.metrics import accuracy, macro_f1, macro_precision, macro_recall, per_class_f1
from libs.ml.methods.keyword_classifier import (
    KeywordMultiLabelJsonClassifier,
)
from libs.ml.methods.sklearn.json import (
    LinearSVMJsonClassifier,
    LogisticRegressionJsonClassifier,
    LogisticRegressionMultiLabelJsonClassifier,
    SVMMultiLabelJsonClassifier,
)
from libs.ml.models import ClassificationPrediction, Label, TrainableClassifier
from libs.ml.registry import TaskFormalism

console = Console()


def _word_tfidf() -> TfidfVectorizer:
    return TfidfVectorizer(min_df=2, ngram_range=(1, 2), max_features=60_000)


def _char_tfidf() -> TfidfVectorizer:
    return TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=2,
        max_features=60_000,
    )

# ─── Synthetic dataset ────────────────────────────────────────────────────────

# Each sample is a maintenance event with structured fields.
# Labels describe what kind of issue is present (multi-label: a single event
# can involve a leak AND a component failure simultaneously).

_LABELS = ["leak", "vibration", "electrical", "mechanical", "no_issue"]

_RAW: list[tuple[dict[str, Any], list[str]]] = [
    # ── Leak ──────────────────────────────────────────────────────────────────
    ({"component": "pump",        "observation": "oil dripping from the base",                              "severity": "low"},    ["leak"]),
    ({"component": "pipe",        "observation": "fluid escaping at the joint",                             "severity": "medium"}, ["leak"]),
    ({"component": "seal",        "observation": "gasket failure, coolant leaking",                         "severity": "medium"}, ["leak", "mechanical"]),
    ({"component": "valve",       "observation": "slow drip detected near flange",                          "severity": "low"},    ["leak"]),
    ({"component": "tank",        "observation": "seepage through weld seam",                               "severity": "low"},    ["leak"]),
    ({"component": "pump",        "observation": "fuel leak confirmed during inspection",                    "severity": "high"},   ["leak"]),
    ({"component": "hose",        "observation": "hydraulic fluid on the floor, source traced to hose",     "severity": "medium"}, ["leak"]),
    ({"component": "pipe",        "observation": "coolant puddle under the pipe run",                       "severity": "medium"}, ["leak"]),
    ({"component": "pump",        "observation": "oil film on casing, confirmed drip at base plate",        "severity": "low"},    ["leak"]),
    ({"component": "tank",        "observation": "level drops overnight despite no consumption",            "severity": "medium"}, ["leak"]),
    ({"component": "valve",       "observation": "external leakage through packing gland",                  "severity": "medium"}, ["leak"]),
    ({"component": "compressor",  "observation": "oil mist visible near shaft exit",                        "severity": "low"},    ["leak"]),
    ({"component": "heat exchanger", "observation": "water ingress in oil circuit, emulsification detected","severity": "high"},   ["leak"]),
    ({"component": "pipe",        "observation": "pinhole leak on elbow, dripping",                         "severity": "low"},    ["leak"]),
    ({"component": "seal",        "observation": "lip seal worn, oil trace on shaft",                       "severity": "medium"}, ["leak", "mechanical"]),
    ({"component": "pump",        "observation": "stuffing box leaking, repacking required",                "severity": "medium"}, ["leak"]),
    ({"component": "tank",        "observation": "overflow through vent, no blockage found",                "severity": "low"},    ["leak"]),
    ({"component": "valve",       "observation": "seat leak causing downstream contamination",              "severity": "high"},   ["leak", "mechanical"]),
    # ── Vibration ─────────────────────────────────────────────────────────────
    ({"component": "motor",       "observation": "abnormal vibration at startup",                           "severity": "medium"}, ["vibration"]),
    ({"component": "shaft",       "observation": "excessive oscillation detected",                          "severity": "high"},   ["vibration", "mechanical"]),
    ({"component": "bearing",     "observation": "vibration level exceeds threshold",                       "severity": "medium"}, ["vibration"]),
    ({"component": "fan",         "observation": "imbalance causing resonance",                             "severity": "low"},    ["vibration"]),
    ({"component": "gearbox",     "observation": "abnormal noise and shaking under load",                   "severity": "high"},   ["vibration", "mechanical"]),
    ({"component": "rotor",       "observation": "high-frequency vibration during operation",               "severity": "medium"}, ["vibration"]),
    ({"component": "pump",        "observation": "vibration spike at 50 Hz, cavitation suspected",          "severity": "medium"}, ["vibration"]),
    ({"component": "compressor",  "observation": "structure-borne noise, vibration dampers worn",           "severity": "low"},    ["vibration", "mechanical"]),
    ({"component": "motor",       "observation": "velocity RMS above alarm limit at drive end bearing",     "severity": "high"},   ["vibration"]),
    ({"component": "fan",         "observation": "blade tip clearance uneven, causing periodic impulse",    "severity": "medium"}, ["vibration", "mechanical"]),
    ({"component": "shaft",       "observation": "critical speed crossed during run-up, resonance observed","severity": "high"},   ["vibration"]),
    ({"component": "pump",        "observation": "rattling noise at full load, loose impeller nut",         "severity": "medium"}, ["vibration", "mechanical"]),
    ({"component": "gearbox",     "observation": "tooth-mesh frequency elevated in spectrum",               "severity": "medium"}, ["vibration"]),
    ({"component": "motor",       "observation": "frame vibration transmits to baseplate, bolts loosened",  "severity": "low"},    ["vibration", "mechanical"]),
    ({"component": "bearing",     "observation": "sub-harmonic component in spectrum, likely looseness",    "severity": "medium"}, ["vibration"]),
    ({"component": "compressor",  "observation": "surge detected, vibration burst recorded",                "severity": "high"},   ["vibration"]),
    # ── Electrical ────────────────────────────────────────────────────────────
    ({"component": "cable",       "observation": "short circuit detected on line 3",                        "severity": "high"},   ["electrical"]),
    ({"component": "breaker",     "observation": "unexpected trip, no apparent cause",                      "severity": "medium"}, ["electrical"]),
    ({"component": "motor",       "observation": "insulation resistance below minimum",                     "severity": "high"},   ["electrical"]),
    ({"component": "sensor",      "observation": "erratic signal, suspected wiring fault",                  "severity": "low"},    ["electrical"]),
    ({"component": "panel",       "observation": "earth fault alarm triggered",                             "severity": "medium"}, ["electrical"]),
    ({"component": "generator",   "observation": "voltage drop under load",                                 "severity": "medium"}, ["electrical"]),
    ({"component": "motor",       "observation": "winding temperature exceeds class limit",                 "severity": "high"},   ["electrical"]),
    ({"component": "cable",       "observation": "insulation damage found at cable tray entry",             "severity": "medium"}, ["electrical"]),
    ({"component": "inverter",    "observation": "overcurrent fault on phase 2",                            "severity": "high"},   ["electrical"]),
    ({"component": "panel",       "observation": "loose terminal causing intermittent contact",             "severity": "medium"}, ["electrical"]),
    ({"component": "sensor",      "observation": "4-20 mA loop broken, transmitter replaced",              "severity": "low"},    ["electrical"]),
    ({"component": "motor",       "observation": "phase imbalance detected, one phase at 80% voltage",     "severity": "high"},   ["electrical"]),
    ({"component": "generator",   "observation": "exciter diode failed, AVR unable to regulate",           "severity": "high"},   ["electrical"]),
    ({"component": "cable",       "observation": "high contact resistance at junction box",                 "severity": "medium"}, ["electrical"]),
    ({"component": "breaker",     "observation": "arc flash marks on contacts, replacement ordered",        "severity": "high"},   ["electrical"]),
    ({"component": "inverter",    "observation": "IGBT module failed, drive offline",                       "severity": "high"},   ["electrical"]),
    # ── Mechanical ────────────────────────────────────────────────────────────
    ({"component": "coupling",    "observation": "misalignment confirmed by laser measurement",             "severity": "medium"}, ["mechanical"]),
    ({"component": "bearing",     "observation": "worn races, replacement required",                        "severity": "high"},   ["mechanical"]),
    ({"component": "impeller",    "observation": "blade erosion visible on inspection",                     "severity": "medium"}, ["mechanical"]),
    ({"component": "shaft",       "observation": "surface crack found during NDT",                          "severity": "high"},   ["mechanical"]),
    ({"component": "valve",       "observation": "seat damaged, full replacement scheduled",                "severity": "medium"}, ["mechanical"]),
    ({"component": "gearbox",     "observation": "pitting on gear flanks, oil analysis confirms metal",    "severity": "high"},   ["mechanical"]),
    ({"component": "pump",        "observation": "casing wear ring clearance exceeded, efficiency drop",    "severity": "medium"}, ["mechanical"]),
    ({"component": "coupling",    "observation": "flexible element cracked, torque transmission affected",  "severity": "high"},   ["mechanical"]),
    ({"component": "bearing",     "observation": "spalling on outer race confirmed by borescope",           "severity": "high"},   ["mechanical"]),
    ({"component": "shaft",       "observation": "fretting corrosion at interference fit",                  "severity": "medium"}, ["mechanical"]),
    ({"component": "valve",       "observation": "stem seized, actuator unable to close",                   "severity": "high"},   ["mechanical"]),
    ({"component": "impeller",    "observation": "cavitation damage on suction side blades",               "severity": "medium"}, ["mechanical"]),
    ({"component": "gearbox",     "observation": "broken tooth on pinion, debris in oil",                   "severity": "high"},   ["mechanical"]),
    ({"component": "pump",        "observation": "shaft deflection measured above acceptance criterion",    "severity": "medium"}, ["mechanical"]),
    ({"component": "coupling",    "observation": "rubber spider degraded, replacing before failure",        "severity": "low"},    ["mechanical"]),
    # ── No issue ──────────────────────────────────────────────────────────────
    ({"component": "pump",        "observation": "routine inspection, no anomaly found",                    "severity": "none"},   ["no_issue"]),
    ({"component": "motor",       "observation": "scheduled maintenance completed successfully",             "severity": "none"},   ["no_issue"]),
    ({"component": "panel",       "observation": "quarterly test passed all criteria",                      "severity": "none"},   ["no_issue"]),
    ({"component": "valve",       "observation": "greasing done, operation nominal",                        "severity": "none"},   ["no_issue"]),
    ({"component": "sensor",      "observation": "calibration check: within tolerance",                     "severity": "none"},   ["no_issue"]),
    ({"component": "bearing",     "observation": "vibration trending stable, lubrication topped up",        "severity": "none"},   ["no_issue"]),
    ({"component": "gearbox",     "observation": "oil sample analysed, no abnormal wear particles",         "severity": "none"},   ["no_issue"]),
    ({"component": "compressor",  "observation": "annual overhaul completed, all clearances within spec",   "severity": "none"},   ["no_issue"]),
    ({"component": "motor",       "observation": "thermal imaging shows uniform temperature distribution",  "severity": "none"},   ["no_issue"]),
    ({"component": "pump",        "observation": "performance test passed, flow and head within tolerance", "severity": "none"},   ["no_issue"]),
    ({"component": "fan",         "observation": "balance check after blade cleaning: acceptable",          "severity": "none"},   ["no_issue"]),
    ({"component": "generator",   "observation": "load test completed, output stable across full range",    "severity": "none"},   ["no_issue"]),
    # ── Multi-label combinations ───────────────────────────────────────────────
    ({"component": "pump",        "observation": "oil leak and abnormal vibration, bearing suspected",      "severity": "high"},   ["leak", "vibration", "mechanical"]),
    ({"component": "motor",       "observation": "vibration high, cable connector burned",                  "severity": "high"},   ["vibration", "electrical"]),
    ({"component": "gearbox",     "observation": "leak at shaft seal, gear teeth worn",                     "severity": "medium"}, ["leak", "mechanical"]),
    ({"component": "generator",   "observation": "earth fault and resonance during run test",               "severity": "high"},   ["electrical", "vibration"]),
    ({"component": "compressor",  "observation": "oil mist around casing and vibration on start",           "severity": "medium"}, ["leak", "vibration"]),
    ({"component": "motor",       "observation": "insulation degraded and shaft misaligned",                "severity": "high"},   ["electrical", "mechanical"]),
    ({"component": "pump",        "observation": "cavitation causing vibration and seal wear leaking",      "severity": "high"},   ["vibration", "mechanical", "leak"]),
    ({"component": "bearing",     "observation": "spalling and elevated temperature, oil leak at cap",      "severity": "high"},   ["mechanical", "leak"]),
    ({"component": "gearbox",     "observation": "tooth damage and lubricant escaping through breather",    "severity": "high"},   ["mechanical", "leak"]),
    ({"component": "motor",       "observation": "winding fault, rotor rubbing, high vibration",            "severity": "high"},   ["electrical", "mechanical", "vibration"]),
    ({"component": "fan",         "observation": "blade cracked and motor overheating",                     "severity": "high"},   ["mechanical", "electrical"]),
    ({"component": "compressor",  "observation": "discharge valve leaking and piston ring worn",            "severity": "high"},   ["leak", "mechanical"]),
    # ── Ambiguous / low-signal ────────────────────────────────────────────────
    ({"component": "pump",        "observation": "slight noise, operator not certain",                      "severity": "low"},    ["vibration"]),
    ({"component": "valve",       "observation": "possible trace of moisture, inconclusive",                "severity": "low"},    ["leak"]),
    ({"component": "motor",       "observation": "intermittent alarm, cause unknown",                       "severity": "low"},    ["electrical"]),
    ({"component": "bearing",     "observation": "temperature slightly elevated, monitoring requested",     "severity": "low"},    ["mechanical"]),
    ({"component": "cable",       "observation": "visual check suggests some wear",                         "severity": "low"},    ["electrical"]),
    ({"component": "pump",        "observation": "minor oil stain on floor, could be splash",               "severity": "low"},    ["leak"]),
    ({"component": "shaft",       "observation": "faint rumbling noise at speed, unconfirmed",              "severity": "low"},    ["vibration"]),
    ({"component": "sensor",      "observation": "one spurious reading in the last week",                   "severity": "low"},    ["electrical"]),
    ({"component": "gearbox",     "observation": "slightly elevated metal count in oil sample",             "severity": "low"},    ["mechanical"]),
    ({"component": "fan",         "observation": "occasional vibration peak, not repeatable",               "severity": "low"},    ["vibration"]),
]



def make_dataset() -> JSONMultiLabelClassificationDataset:
    samples = [
        DatasetSample(
            input=JsonInput(json_value=_json.dumps(fields, ensure_ascii=False)),
            target=MultiLabelClassificationTarget(label_ids=label_ids),
        )
        for fields, label_ids in _RAW
    ]
    return JSONMultiLabelClassificationDataset(
        title="Equipment maintenance events",
        formalism=TaskFormalism.JSON_TO_LABELS,
        samples=samples,
    )


# ─── Statistics ───────────────────────────────────────────────────────────────

def print_dataset_stats(dataset: JSONMultiLabelClassificationDataset) -> None:
    labeled = dataset.labeled_samples()
    total = len(labeled)

    # Label frequency
    label_counts: Counter = Counter()
    labels_per_sample: list[int] = []
    for s in labeled:
        ids = s.target.label_ids  # type: ignore[union-attr]
        label_counts.update(ids)
        labels_per_sample.append(len(ids))

    console.rule("[bold green]Dataset statistics[/bold green]")
    console.print(f"   Total samples: {total}")
    console.print(f"   Avg labels/sample: {sum(labels_per_sample) / total:.2f}")
    console.print(f"   Multi-label samples: {sum(1 for n in labels_per_sample if n > 1)} ({sum(1 for n in labels_per_sample if n > 1) / total * 100:.0f}%)")

    # Label distribution table
    freq_table = Table(title="Label distribution", box=box.ROUNDED)
    freq_table.add_column("Label", style="cyan")
    freq_table.add_column("Count", justify="right")
    freq_table.add_column("%", justify="right")
    for label in _LABELS:
        n = label_counts[label]
        freq_table.add_row(label, str(n), f"{n / total * 100:.1f}%")
    console.print(freq_table)

    # Label count distribution
    count_dist = Counter(labels_per_sample)
    dist_table = Table(title="Labels-per-sample distribution", box=box.ROUNDED)
    dist_table.add_column("# labels", justify="right")
    dist_table.add_column("samples", justify="right")
    dist_table.add_column("%", justify="right")
    for n in sorted(count_dist):
        c = count_dist[n]
        dist_table.add_row(str(n), str(c), f"{c / total * 100:.0f}%")
    console.print(dist_table)

    # Co-occurrence matrix
    co: dict[str, Counter] = {lbl: Counter() for lbl in _LABELS}
    for s in labeled:
        ids = s.target.label_ids  # type: ignore[union-attr]
        for a in ids:
            for b in ids:
                if a != b:
                    co[a][b] += 1

    co_table = Table(title="Label co-occurrence", box=box.SIMPLE_HEAVY)
    co_table.add_column("", style="dim")
    for lbl in _LABELS:
        co_table.add_column(lbl, justify="right")
    for a in _LABELS:
        co_table.add_row(a, *[str(co[a][b]) if co[a][b] else "·" for b in _LABELS])
    console.print(co_table)


# ─── Splits ──────────────────────────────────────────────────────────────────

SEED = 42
EVAL_RATIO = 0.2  # fraction held out for final evaluation


def make_splits(
    dataset: Any,
    *,
    eval_ratio: float = EVAL_RATIO,
    seed: int = SEED,
) -> tuple[Any, Any]:
    """Return (train_test, eval) splits with a fixed seed."""
    samples = list(dataset.labeled_samples())
    rng = random.Random(seed)  # noqa: S311
    rng.shuffle(samples)
    n_eval = max(1, round(len(samples) * eval_ratio))
    cls = type(dataset)
    return (
        cls(title=f"{dataset.title} — train/test", formalism=dataset.formalism, samples=samples[n_eval:]),
        cls(title=f"{dataset.title} — eval",       formalism=dataset.formalism, samples=samples[:n_eval]),
    )


def _target_label_ids(target: Any) -> list[str]:
    if hasattr(target, "label_ids"):
        return list(target.label_ids)
    return [target.label_id]


def print_split_stats(train_test: Any, eval_ds: Any) -> None:
    all_labeled = train_test.labeled_samples() + eval_ds.labeled_samples()
    total = len(all_labeled)
    all_labels = sorted({lbl for s in all_labeled for lbl in _target_label_ids(s.target)})

    table = Table(title=f"Splits  (seed={SEED})", box=box.ROUNDED)
    table.add_column("Split", style="cyan", no_wrap=True)
    table.add_column("n", justify="right")
    table.add_column("%", justify="right")
    for label in all_labels:
        table.add_column(label, justify="right")

    for ds in (train_test, eval_ds):
        labeled = ds.labeled_samples()
        n = len(labeled)
        counts: Counter = Counter(lbl for s in labeled for lbl in _target_label_ids(s.target))
        table.add_row(
            (ds.title or "?").split(" — ")[-1],
            str(n),
            f"{n / total * 100:.0f}%",
            *[str(counts[lbl]) for lbl in all_labels],
        )

    console.print(table)


# ─── Training & evaluation ────────────────────────────────────────────────────



def train_and_evaluate(
    train_test: JSONMultiLabelClassificationDataset,
    eval_ds: JSONMultiLabelClassificationDataset,
) -> None:
    train_labeled = train_test.labeled_samples()
    eval_labeled  = eval_ds.labeled_samples()

    train_inputs = [s.input for s in train_labeled]
    eval_inputs  = [s.input for s in eval_labeled]

    train_targets = [
        [Label(id=lid, name=lid) for lid in s.target.label_ids]  # type: ignore[union-attr]
        for s in train_labeled
    ]
    label_names = sorted({lid for lbls in train_targets for lbl in lbls for lid in [lbl.id]})

    console.print("\n[bold blue]── Fitting LogisticRegressionMultiLabelJsonClassifier[/bold blue]")
    clf = LogisticRegressionMultiLabelJsonClassifier(TfidfVectorizer(min_df=1))
    clf.fit(train_inputs, train_targets)
    console.print(f"   train: {len(train_inputs)}  eval: {len(eval_inputs)}  labels: {label_names}")

    # threshold=0.5 → hard predictions for confusion matrix
    preds_hard = clf.classify_multi_label(eval_inputs)
    # threshold=0.0 → all labels with scores for PR curve
    preds_all  = clf.classify_multi_label(eval_inputs, threshold=0.0)

    Y_true = np.array([
        [1 if lbl in s.target.label_ids else 0 for lbl in label_names]  # type: ignore[union-attr]
        for s in eval_labeled
    ])
    Y_pred = np.array([
        [1 if any(p.label_id == lbl for p in row) else 0 for lbl in label_names]
        for row in preds_hard
    ])
    Y_proba = np.array([
        [next((p.score for p in row if p.label_id == lbl), 0.0) for lbl in label_names]
        for row in preds_all
    ])

    print_multilabel_confusion(Y_true, Y_pred, label_names)
    print_precision_recall_curves(Y_true, Y_proba, label_names)
    print_precision_recall_table(Y_true, Y_proba, label_names)
    save_precision_recall_curves(Y_true, Y_proba, label_names)


# ─── Single-label dataset ────────────────────────────────────────────────────

# Root-cause classification: one primary cause per event.

_RAW_SINGLE: list[tuple[dict[str, Any], str]] = [
    # wear
    ({"component": "bearing",    "observation": "pitting and surface fatigue on races",            "severity": "high"},   "wear"),
    ({"component": "impeller",   "observation": "progressive blade erosion from particles",         "severity": "medium"}, "wear"),
    ({"component": "shaft",      "observation": "fretting wear at keyway",                          "severity": "medium"}, "wear"),
    ({"component": "valve",      "observation": "seat worn, no longer sealing",                     "severity": "high"},   "wear"),
    ({"component": "gearbox",    "observation": "tooth surface wear, backlash increasing",          "severity": "medium"}, "wear"),
    ({"component": "pump",       "observation": "wear ring clearance exceeded, performance drop",   "severity": "medium"}, "wear"),
    ({"component": "coupling",   "observation": "rubber spider degraded through use",               "severity": "low"},    "wear"),
    ({"component": "bearing",    "observation": "cage fracture from advanced fatigue wear",         "severity": "high"},   "wear"),
    ({"component": "seal",       "observation": "lip seal worn through, no longer effective",       "severity": "medium"}, "wear"),
    ({"component": "shaft",      "observation": "journal worn below minimum diameter",              "severity": "high"},   "wear"),
    ({"component": "valve",      "observation": "stem scoring from repeated actuation",             "severity": "low"},    "wear"),
    ({"component": "gearbox",    "observation": "micro-pitting observed on pinion flanks",          "severity": "medium"}, "wear"),
    ({"component": "pump",       "observation": "casing bore worn, efficiency declining",           "severity": "medium"}, "wear"),
    ({"component": "motor",      "observation": "brush wear on slip ring assembly",                 "severity": "low"},    "wear"),
    ({"component": "compressor", "observation": "piston ring wear, blowby detected",               "severity": "high"},   "wear"),
    ({"component": "fan",        "observation": "blade leading edge eroded by sand",               "severity": "medium"}, "wear"),
    ({"component": "bearing",    "observation": "fluting on inner race from electrical discharge",  "severity": "medium"}, "wear"),
    ({"component": "pump",       "observation": "throat bushing worn, increased vibration",         "severity": "low"},    "wear"),
    # corrosion
    ({"component": "pipe",       "observation": "external rust, wall thickness reduced",            "severity": "medium"}, "corrosion"),
    ({"component": "tank",       "observation": "internal pitting corrosion near weld",             "severity": "high"},   "corrosion"),
    ({"component": "valve",      "observation": "body corroded, thread seized",                     "severity": "medium"}, "corrosion"),
    ({"component": "heat exchanger", "observation": "tube bundle corroded, leaking",               "severity": "high"},   "corrosion"),
    ({"component": "pipe",       "observation": "galvanic corrosion at dissimilar metal joint",    "severity": "medium"}, "corrosion"),
    ({"component": "pump",       "observation": "casing pitting in aggressive fluid service",       "severity": "medium"}, "corrosion"),
    ({"component": "tank",       "observation": "atmospheric corrosion on external shell",          "severity": "low"},    "corrosion"),
    ({"component": "valve",      "observation": "seat corroded, unable to achieve tight shutoff",   "severity": "high"},   "corrosion"),
    ({"component": "pipe",       "observation": "crevice corrosion under insulation",               "severity": "medium"}, "corrosion"),
    ({"component": "heat exchanger", "observation": "stress corrosion cracking on tube sheet",     "severity": "high"},   "corrosion"),
    ({"component": "pump",       "observation": "impeller corroded, balance disturbed",             "severity": "medium"}, "corrosion"),
    ({"component": "tank",       "observation": "microbial corrosion in low-flow zone",             "severity": "medium"}, "corrosion"),
    ({"component": "pipe",       "observation": "erosion-corrosion at elbow, wall thinning",        "severity": "high"},   "corrosion"),
    ({"component": "valve",      "observation": "dezincification of brass body",                    "severity": "medium"}, "corrosion"),
    ({"component": "pump",       "observation": "shaft corrosion under mechanical seal",            "severity": "low"},    "corrosion"),
    # overload
    ({"component": "motor",      "observation": "winding overheated, tripped on thermal",          "severity": "high"},   "overload"),
    ({"component": "gearbox",    "observation": "tooth failure from torque spike",                  "severity": "high"},   "overload"),
    ({"component": "shaft",      "observation": "fatigue crack from cyclic overload",               "severity": "high"},   "overload"),
    ({"component": "bearing",    "observation": "overload spalling, short service life",            "severity": "high"},   "overload"),
    ({"component": "pump",       "observation": "motor trips repeatedly at full load",              "severity": "medium"}, "overload"),
    ({"component": "compressor", "observation": "pressure relief valve lifting, overpressure",      "severity": "high"},   "overload"),
    ({"component": "motor",      "observation": "current draw 30% above nameplate rating",         "severity": "medium"}, "overload"),
    ({"component": "gearbox",    "observation": "housing cracked from shock load",                  "severity": "high"},   "overload"),
    ({"component": "shaft",      "observation": "torsional failure at keyway under peak torque",    "severity": "high"},   "overload"),
    ({"component": "fan",        "observation": "blade root cracked from stall-induced load",       "severity": "high"},   "overload"),
    ({"component": "pump",       "observation": "deadhead operation damaged impeller",              "severity": "medium"}, "overload"),
    ({"component": "motor",      "observation": "insulation burned from sustained overload",        "severity": "high"},   "overload"),
    ({"component": "bearing",    "observation": "white layer formation from dynamic overload",      "severity": "high"},   "overload"),
    ({"component": "compressor", "observation": "intercooler bypass, downstream stage overloaded",  "severity": "medium"}, "overload"),
    # electrical_fault
    ({"component": "motor",      "observation": "winding insulation breakdown, phase to earth",     "severity": "high"},   "electrical_fault"),
    ({"component": "cable",      "observation": "short circuit, insulation melted",                 "severity": "high"},   "electrical_fault"),
    ({"component": "inverter",   "observation": "IGBT failed, drive shutdown",                      "severity": "high"},   "electrical_fault"),
    ({"component": "panel",      "observation": "earth leakage current above trip threshold",       "severity": "medium"}, "electrical_fault"),
    ({"component": "motor",      "observation": "turn-to-turn fault in stator winding",             "severity": "high"},   "electrical_fault"),
    ({"component": "generator",  "observation": "rotor winding fault, excitation loss",             "severity": "high"},   "electrical_fault"),
    ({"component": "cable",      "observation": "partial discharge detected in HV cable",           "severity": "medium"}, "electrical_fault"),
    ({"component": "breaker",    "observation": "contact failure, resistance too high",             "severity": "medium"}, "electrical_fault"),
    ({"component": "motor",      "observation": "rotor bar broken, slip frequency in spectrum",     "severity": "high"},   "electrical_fault"),
    ({"component": "panel",      "observation": "overheating terminal due to loose connection",     "severity": "medium"}, "electrical_fault"),
    ({"component": "inverter",   "observation": "capacitor bank degraded, harmonic distortion",     "severity": "medium"}, "electrical_fault"),
    ({"component": "generator",  "observation": "diode failure in rectifier bridge",                "severity": "high"},   "electrical_fault"),
    ({"component": "cable",      "observation": "treeing in cable insulation, imminent failure",    "severity": "high"},   "electrical_fault"),
    ({"component": "motor",      "observation": "phase loss, single-phasing detected",              "severity": "high"},   "electrical_fault"),
    # no_fault
    ({"component": "pump",       "observation": "scheduled inspection passed, no findings",         "severity": "none"},   "no_fault"),
    ({"component": "motor",      "observation": "annual service completed within spec",             "severity": "none"},   "no_fault"),
    ({"component": "bearing",    "observation": "greased, vibration within normal range",           "severity": "none"},   "no_fault"),
    ({"component": "gearbox",    "observation": "oil change done, no abnormal particles",           "severity": "none"},   "no_fault"),
    ({"component": "valve",      "observation": "functional test passed, seats in good condition",  "severity": "none"},   "no_fault"),
    ({"component": "compressor", "observation": "major overhaul completed, cleared for service",    "severity": "none"},   "no_fault"),
    ({"component": "motor",      "observation": "thermography: temperature distribution normal",    "severity": "none"},   "no_fault"),
    ({"component": "pipe",       "observation": "UT thickness measurement: all within tolerance",   "severity": "none"},   "no_fault"),
    ({"component": "generator",  "observation": "load test passed, output stable",                  "severity": "none"},   "no_fault"),
    ({"component": "sensor",     "observation": "calibration verified, signal clean",               "severity": "none"},   "no_fault"),
    ({"component": "fan",        "observation": "balance check after cleaning: acceptable",         "severity": "none"},   "no_fault"),
    ({"component": "tank",       "observation": "inspection: no corrosion, coating intact",         "severity": "none"},   "no_fault"),
]


def make_single_label_dataset() -> JSONClassificationDataset:
    samples = [
        DatasetSample(
            input=JsonInput(json_value=_json.dumps(fields, ensure_ascii=False)),
            target=ClassificationTarget(label_id=label),
        )
        for fields, label in _RAW_SINGLE
    ]
    return JSONClassificationDataset(
        title="Equipment root-cause classification",
        formalism=TaskFormalism.JSON_TO_LABEL,
        samples=samples,
    )


def train_and_evaluate_single_label(
    train_test: JSONClassificationDataset,
    eval_ds: JSONClassificationDataset,
) -> None:
    train_labeled = train_test.labeled_samples()
    eval_labeled  = eval_ds.labeled_samples()

    train_inputs = [s.input for s in train_labeled]
    eval_inputs  = [s.input for s in eval_labeled]

    train_targets = [
        Label(id=s.target.label_id, name=s.target.label_id)  # type: ignore[union-attr]
        for s in train_labeled
    ]
    y_eval = [s.target.label_id for s in eval_labeled]  # type: ignore[union-attr]

    console.print("\n[bold blue]── Fitting LogisticRegressionJsonClassifier[/bold blue]")
    clf = LogisticRegressionJsonClassifier(_word_tfidf(), max_iter=1000)
    clf.fit(train_inputs, train_targets)
    console.print(f"   train: {len(train_inputs)}  eval: {len(eval_inputs)}")

    preds = clf.classify(eval_inputs)
    y_pred = [p.label_id for p in preds]
    label_names = sorted(set(y_eval) | set(y_pred))

    print_confusion_matrix(y_eval, y_pred, label_names)

    # Build per-class score matrix from metadata for PR curves
    class_scores = [p.metadata.get("class_scores", {}) if p.metadata else {} for p in preds]
    if any(cs for cs in class_scores):
        Y_true = np.array([[1 if t == lbl else 0 for lbl in label_names] for t in y_eval])
        Y_proba = np.array([[cs.get(lbl, 0.0) for lbl in label_names] for cs in class_scores])
        print_precision_recall_curves(Y_true, Y_proba, label_names)
        print_precision_recall_table(Y_true, Y_proba, label_names)
        save_precision_recall_curves(
            Y_true, Y_proba, label_names,
            path="pr_curves_single_label.png",
            title=f"PR curves — {eval_ds.title or 'single-label'}",
        )


# ─── Keyword rule sets ───────────────────────────────────────────────────────

# Rules for json->labels (maintenance events)
_ML_KW_RULES: dict[str, list[str]] = {
    "leak":        ["leak", "drip", "seepage", "leaking", "fluid", "mist", "overflow", "escaping"],
    "vibration":   ["vibration", "oscillation", "resonance", "imbalance", "shaking", "rattle", "surge"],
    "electrical":  ["short circuit", "insulation", "earth fault", "winding", "voltage", "overcurrent", "trip"],
    "mechanical":  ["worn", "crack", "wear", "erosion", "misalignment", "spalling", "pitting", "fatigue"],
    "no_issue":    ["nominal", "passed", "no anomaly", "completed", "acceptable", "within tolerance"],
}

# Rules for json->label (root-cause classification)
_SL_KW_RULES: dict[str, list[str]] = {
    "wear":             ["worn", "wear", "fatigue", "erosion", "pitting", "fretting", "degraded", "scoring"],
    "corrosion":        ["corrosion", "rust", "corroded", "oxidation", "galvanic", "dezincification"],
    "overload":         ["overload", "overheated", "torque", "tripped", "thermal", "overcurrent", "stall"],
    "electrical_fault": ["short circuit", "insulation", "winding", "earth fault", "phase", "diode", "igbt"],
    "no_fault":         ["passed", "nominal", "completed", "no anomaly", "within tolerance", "acceptable"],
}


# ─── Cascade / MoE ───────────────────────────────────────────────────────────


@_dc
class Tier:
    name: str
    classifier: Any
    threshold: float | None  # None = final tier, always answers


class ScoreBiasedJsonClassifier(TrainableClassifier[JsonInput]):
    """Re-pick the label from classifier scores after applying class biases."""

    def __init__(self, classifier: Any, class_bias: dict[str, float]) -> None:
        self.classifier = classifier
        self.class_bias = class_bias

    def _fit(self, inputs: list[JsonInput], targets: list[Label]) -> None:
        self.classifier.fit(inputs, targets)

    def _classify(self, inputs: list[JsonInput]) -> list[ClassificationPrediction]:
        predictions = self.classifier.classify(inputs)
        adjusted: list[ClassificationPrediction] = []
        for pred in predictions:
            class_scores = (pred.metadata or {}).get("class_scores")
            if not class_scores:
                adjusted.append(pred)
                continue

            biased_scores = {
                label: float(score) * self.class_bias.get(label, 1.0)
                for label, score in class_scores.items()
            }
            total = sum(biased_scores.values())
            if total > 0:
                biased_scores = {
                    label: score / total for label, score in biased_scores.items()
                }
            label_id = max(biased_scores, key=biased_scores.get)
            adjusted.append(
                ClassificationPrediction(
                    label_id=label_id,
                    score=biased_scores[label_id],
                    metadata={
                        "class_scores": biased_scores,
                        "raw_class_scores": class_scores,
                        "class_bias": self.class_bias,
                    },
                )
            )
        return adjusted


def _single_confidence(pred: ClassificationPrediction) -> float:
    return pred.score if pred.score is not None else 0.0


def _multi_confidence(preds: list[ClassificationPrediction]) -> float:
    if not preds:
        return 0.0
    scores = [p.score for p in preds if p.score is not None]
    if scores:
        return min(scores)
    # Keyword classifiers have no score: use match count as proxy
    counts = [len((p.metadata or {}).get("matched_keywords", [])) for p in preds]
    return min(counts) / 3.0 if counts else 0.0


def _print_routing_stats(tier_used: list[str], tiers: list[Tier]) -> None:
    total = len(tier_used)
    counts: Counter = Counter(tier_used)
    table = Table(title="Routing", box=box.ROUNDED)
    table.add_column("Tier", style="cyan")
    table.add_column("Samples", justify="right")
    table.add_column("%", justify="right")
    table.add_column("Role", style="dim")
    roles = (
        ["fast / high-confidence", "fallback (LLM in production)"]
        if len(tiers) == 2
        else ["fast / high-confidence", "medium / trainable", "fallback (LLM in production)"]
    )
    for i, tier in enumerate(tiers):
        n = counts[tier.name]
        role = roles[i] if i < len(roles) else "—"
        table.add_row(tier.name, str(n), f"{n / total * 100:.1f}%", role)
    console.print(table)


def _print_method_comparison(
    results: list[tuple[str, list[str]]],
    y_eval: list[str],
    label_names: list[str],
) -> None:
    table = Table(title="Method comparison · macro metrics", box=box.ROUNDED)
    table.add_column("Method", style="cyan")
    table.add_column("Accuracy", justify="right")
    table.add_column("Macro Precision", justify="right")
    table.add_column("Macro Recall", justify="right")
    table.add_column("Macro F1", justify="right", style="bold yellow")
    for name, y_pred in results:
        table.add_row(
            name,
            f"{accuracy(y_eval, y_pred):.3f}",
            f"{macro_precision(y_eval, y_pred, labels=label_names):.3f}",
            f"{macro_recall(y_eval, y_pred, labels=label_names):.3f}",
            f"{macro_f1(y_eval, y_pred, labels=label_names):.3f}",
        )
    console.print(table)

    per_class = Table(title="Per-class F1", box=box.ROUNDED)
    per_class.add_column("Method", style="cyan")
    for label in label_names:
        per_class.add_column(label, justify="right")
    per_class.add_column("Average", justify="right", style="bold yellow")
    for name, y_pred in results:
        f1_by_label = per_class_f1(y_eval, y_pred, labels=label_names)
        f1_values = [f1_by_label[label] for label in label_names]
        per_class.add_row(
            name,
            *[f"{value:.3f}" for value in f1_values],
            f"{float(np.mean(f1_values)):.3f}",
        )
    console.print(per_class)


def run_single_label_cascade(
    tiers: list[Tier],
    train_labeled: list,
    eval_labeled: list,
    title: str = "single-label cascade",
) -> None:
    console.rule(f"[bold green]MoE — {title}[/bold green]")

    train_inputs = [s.input for s in train_labeled]
    eval_inputs  = [s.input for s in eval_labeled]
    y_eval       = [s.target.label_id for s in eval_labeled]  # type: ignore[union-attr]
    label_names  = sorted(set(y_eval))

    # Fit trainable tiers
    for tier in tiers:
        clf = tier.classifier
        if getattr(clf, "trainable", False):
            console.print(f"   Fitting [cyan]{tier.name}[/cyan]…")
            train_targets = [Label(id=s.target.label_id, name=s.target.label_id) for s in train_labeled]  # type: ignore[union-attr]
            clf.fit(train_inputs, train_targets)

    # Independent evaluation of each tier
    method_results: list[tuple[str, list[str]]] = []
    for tier in tiers:
        preds = tier.classifier.classify(eval_inputs)
        method_results.append((tier.name, [p.label_id for p in preds]))

    # Cascade routing
    n = len(eval_inputs)
    predictions: list[Any] = [None] * n
    tier_used: list[str] = ["?"] * n
    pending = list(range(n))

    for tier in tiers:
        if not pending:
            break
        batch_preds = tier.classifier.classify([eval_inputs[i] for i in pending])
        remaining = []
        for global_i, pred in zip(pending, batch_preds):
            if tier.threshold is None or _single_confidence(pred) >= tier.threshold:
                predictions[global_i] = pred
                tier_used[global_i] = tier.name
            else:
                remaining.append(global_i)
        pending = remaining

    method_results.append(("cascade", [p.label_id for p in predictions]))
    _print_routing_stats(tier_used, tiers)
    _print_method_comparison(method_results, y_eval, label_names)

    # PR curves from cascade predictions
    class_scores = [
        p.metadata.get("class_scores", {}) if p.metadata else {}
        for p in predictions
    ]
    if any(cs for cs in class_scores):
        Y_true  = np.array([[1 if t == lbl else 0 for lbl in label_names] for t in y_eval])
        Y_proba = np.array([[cs.get(lbl, 0.0) for lbl in label_names] for cs in class_scores])
        print_precision_recall_curves(Y_true, Y_proba, label_names)
        print_precision_recall_table(Y_true, Y_proba, label_names)
        save_precision_recall_curves(Y_true, Y_proba, label_names,
                                     path="pr_cascade_single.png", title=f"PR — {title}")


def run_multilabel_cascade(
    tiers: list[Tier],
    train_labeled: list,
    eval_labeled: list,
    title: str = "multi-label cascade",
) -> None:
    console.rule(f"[bold green]MoE — {title}[/bold green]")

    train_inputs  = [s.input for s in train_labeled]
    eval_inputs   = [s.input for s in eval_labeled]
    eval_label_ids = [set(s.target.label_ids) for s in eval_labeled]  # type: ignore[union-attr]
    label_names   = sorted({lbl for lbls in eval_label_ids for lbl in lbls} |
                            {lbl for s in train_labeled for lbl in s.target.label_ids})  # type: ignore[union-attr]

    # Fit trainable tiers
    for tier in tiers:
        clf = tier.classifier
        if getattr(clf, "trainable", False):
            console.print(f"   Fitting [cyan]{tier.name}[/cyan]…")
            train_targets = [
                [Label(id=lid, name=lid) for lid in s.target.label_ids]  # type: ignore[union-attr]
                for s in train_labeled
            ]
            clf.fit(train_inputs, train_targets)

    # Cascade routing
    n = len(eval_inputs)
    predictions: list[Any] = [None] * n
    tier_used: list[str] = ["?"] * n
    pending = list(range(n))

    for tier in tiers:
        if not pending:
            break
        # Use threshold=0.0 to get all labels with scores for confidence calc
        batch_preds = tier.classifier.classify_multi_label(
            [eval_inputs[i] for i in pending], threshold=0.0
        )
        remaining = []
        for global_i, preds in zip(pending, batch_preds):
            # Apply hard threshold to get actual predictions
            if tier.threshold is not None:
                hard_preds = [p for p in preds if (p.score or 0.0) >= tier.threshold]
            else:
                hard_preds = [p for p in preds if (p.score or 0.0) >= 0.5]
            conf = _multi_confidence(preds)
            if tier.threshold is None or conf >= tier.threshold:
                predictions[global_i] = hard_preds
                tier_used[global_i] = tier.name
            else:
                remaining.append(global_i)
        pending = remaining

    # Multi-label confusion + PR
    Y_true = np.array([
        [1 if lbl in eval_label_ids[i] else 0 for lbl in label_names]
        for i in range(n)
    ])
    Y_pred = np.array([
        [1 if any(p.label_id == lbl for p in (predictions[i] or [])) else 0 for lbl in label_names]
        for i in range(n)
    ])

    # For PR: use scores from last tier (SVM/LR) for samples that went through it
    # Use threshold=0.0 on the final tier for full score matrix
    final_clf = tiers[-1].classifier
    preds_all = final_clf.classify_multi_label(eval_inputs, threshold=0.0)
    Y_proba = np.array([
        [next((p.score for p in row if p.label_id == lbl), 0.0) for lbl in label_names]
        for row in preds_all
    ])

    _print_routing_stats(tier_used, tiers)
    print_multilabel_confusion(Y_true, Y_pred, label_names)
    print_precision_recall_curves(Y_true, Y_proba, label_names)
    print_precision_recall_table(Y_true, Y_proba, label_names)
    save_precision_recall_curves(Y_true, Y_proba, label_names,
                                 path="pr_cascade_multilabel.png", title=f"PR — {title}")


# ─── Entry point ─────────────────────────────────────────────────────────────

def main() -> None:

    multi = False   # demo multi-label classification (maintenance events)
    single = True  # demo single-label classification (root-cause)

    if multi:
        # ── Multi-label: maintenance events ──────────────────────────────────────
        console.rule("[bold green]json->labels — maintenance events[/bold green]")
        dataset = make_dataset()
        print_dataset_stats(dataset)
        train_test, eval_ds = make_splits(dataset)
        print_split_stats(train_test, eval_ds)
        train_and_evaluate(train_test, eval_ds)

        run_multilabel_cascade(
            tiers=[
                # Tier 1: keyword rules — no training, fires only on strong matches
                Tier("keyword", KeywordMultiLabelJsonClassifier(rules=_ML_KW_RULES), threshold=0.2),
                # Tier 2: logistic regression — trained, fast, medium accuracy
                Tier("logistic_regression", LogisticRegressionMultiLabelJsonClassifier(TfidfVectorizer()), threshold=0.55),
                # Tier 3: SVM — more expressive; replace with LLMZeroShotJsonMultiLabelClassifier in production
                Tier("svm (→ llm in prod)", SVMMultiLabelJsonClassifier(TfidfVectorizer()), threshold=None),
            ],
            train_labeled=train_test.labeled_samples(),
            eval_labeled=eval_ds.labeled_samples(),
            title="maintenance events",
        )

    if single:
        # ── Single-label: EDF Diesel BPE Fd ──────────────────────────────────────
        console.rule("[bold green]json->label — EDF Diesel BPE Fd[/bold green]")
        from libs.ml.demos.demo_benchmark import _make_edf_diesel_bpe_fd_dataset
        single_ds = _make_edf_diesel_bpe_fd_dataset()
        sl_train, sl_eval = make_splits(single_ds)
        print_split_stats(sl_train, sl_eval)
        train_and_evaluate_single_label(sl_train, sl_eval)

        run_single_label_cascade(
            tiers=[
                # Tier 1: logistic regression — only answer when very confident.
                # EDF labels are impact buckets, so root-cause keyword rules are
                # intentionally skipped here; they were pure noise for this task.
                Tier("logistic_regression", LogisticRegressionJsonClassifier(_word_tfidf(), max_iter=1000), threshold=0.80),
                # Tier 2: char n-gram SVM — robust fallback on noisy French text.
                # Modest class bias reflects the metric/business preference for
                # surfacing rare non-zero Fd buckets instead of hiding behind accuracy.
                # Replace with LLMZeroShotJsonClassifier in production if desired.
                Tier(
                    "biased char linear svm (→ llm in prod)",
                    ScoreBiasedJsonClassifier(
                        LinearSVMJsonClassifier(_char_tfidf(), max_iter=5000),
                        class_bias={"<fd>0.1": 1.0, "<fd>0.5": 2.0, "<fd>1.0": 1.5},
                    ),
                    threshold=None,
                ),
            ],
            train_labeled=sl_train.labeled_samples(),
            eval_labeled=sl_eval.labeled_samples(),
            title="EDF Diesel BPE Fd classification",
        )


if __name__ == "__main__":
    main()
