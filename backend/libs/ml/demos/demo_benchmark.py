"""
                                     Spambase (OpenML 44) (json->label)
╭──────────────────────────────────────────────────────────────┬──────────┬───────────┬──────────┬──────────╮
│ Method                                                       │ accuracy │ precision │   recall │       f1 │
├──────────────────────────────────────────────────────────────┼──────────┼───────────┼──────────┼──────────┤
│ Structured Logistic Regression (JSON) [trainable,structured] │    0.924 │     0.920 │    0.921 │    0.920 │
│ Smart SVM (JSON) [smart,trainable]                           │    0.726 │     0.714 │    0.700 │    0.705 │
│ SVM (JSON) [trainable]                                       │    0.713 │     0.708 │    0.672 │    0.677 │
│ Gradient Boosting (JSON) [trainable]                         │    0.711 │     0.699 │    0.679 │    0.684 │
│ Random Forest (JSON) [trainable]                             │    0.704 │     0.693 │    0.669 │    0.673 │
│ Smart Random Forest (JSON) [smart,trainable]                 │    0.698 │     0.687 │    0.658 │    0.661 │
│ Smart MLP (JSON) [smart,trainable]                           │    0.696 │     0.681 │    0.682 │    0.682 │
│ MLP (JSON) [trainable]                                       │    0.678 │     0.661 │    0.653 │    0.656 │
│ Logistic Regression (JSON) [trainable]                       │    0.661 │     0.641 │    0.623 │    0.625 │
│ Smart Logistic Regression (JSON) [smart,trainable]           │    0.650 │     0.629 │    0.622 │    0.624 │
╰──────────────────────────────────────────────────────────────┴──────────┴───────────┴──────────┴──────────╯


                                          EDF Diesel BPE Fd (2015-2021) (json->label)
╭──────────────────────────────────────────────────────────────┬───────┬─────────────┬─────────────┬─────────────┬─────────────╮
│ Method                                                       │ folds │    accuracy │   precision │      recall │          f1 │
├──────────────────────────────────────────────────────────────┼───────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ Structured Linear SVM (JSON) [trainable,structured]          │     3 │ 0.681±0.015 │ 0.564±0.025 │ 0.536±0.020 │ 0.543±0.022 │
│ Linear SVM (JSON) [trainable]                                │     3 │ 0.694±0.013 │ 0.601±0.054 │ 0.529±0.038 │ 0.536±0.039 │
│ SGD Hinge (JSON) [trainable]                                 │     3 │ 0.676±0.033 │ 0.560±0.071 │ 0.523±0.067 │ 0.528±0.068 │
│ Structured Logistic Regression (JSON) [trainable,structured] │     3 │ 0.678±0.008 │ 0.611±0.053 │ 0.509±0.016 │ 0.523±0.018 │
│ Structured SGD Hinge (JSON) [trainable,structured]           │     3 │ 0.644±0.023 │ 0.527±0.033 │ 0.510±0.028 │ 0.513±0.030 │
│ Structured Gradient Boosting (JSON) [trainable,structured]   │     3 │ 0.668±0.019 │ 0.533±0.051 │ 0.478±0.010 │ 0.483±0.008 │
│ One-Shot LLM JSON Classifier [llm]                           │     — │       0.576 │       0.514 │       0.494 │       0.481 │
│ Logistic Regression (JSON) [trainable]                       │     3 │ 0.682±0.013 │ 0.722±0.017 │ 0.474±0.008 │ 0.478±0.007 │
│ Random Forest (JSON) [trainable]                             │     3 │ 0.662±0.022 │ 0.487±0.057 │ 0.444±0.020 │ 0.441±0.019 │
╰──────────────────────────────────────────────────────────────┴───────┴─────────────┴─────────────┴─────────────┴─────────────╯

   Confusion matrix · best method: Structured Linear SVM
                          (JSON)
╭─────────────┬──────────┬──────────┬──────────┬──────────╮
│ true \\ pred │  <fd>0.0 │  <fd>0.1 │  <fd>0.5 │  <fd>1.0 │
├─────────────┼──────────┼──────────┼──────────┼──────────┤
│ <fd>0.0     │    82.7% │    10.9% │     1.9% │     4.5% │
│ <fd>0.1     │    19.2% │    67.1% │     2.3% │    11.4% │
│ <fd>0.5     │    20.7% │    32.8% │    24.1% │    22.4% │
│ <fd>1.0     │    30.3% │    14.1% │    15.2% │    40.4% │
╰─────────────┴──────────┴──────────┴──────────┴──────────╯


                                                       News topics (text->labels)
╭────────────────────────────────────────────────────────┬───────┬─────────────┬──────────────┬─────────────┬─────────────┬─────────────╮
│ Method                                                 │ folds │ exact_match │ hamming_loss │   precision │      recall │          f1 │
├────────────────────────────────────────────────────────┼───────┼─────────────┼──────────────┼─────────────┼─────────────┼─────────────┤
│ Few-Shot LLM Text Classifier (Multi-Label) [trainable] │     3 │ 0.832±0.087 │  0.058±0.044 │ 0.984±0.022 │ 0.898±0.057 │ 0.939±0.041 │
╰────────────────────────────────────────────────────────┴───────┴─────────────┴──────────────┴─────────────┴─────────────┴─────────────╯
│ One-Shot LLM Text Classifier (Multi-Label) [llm].      │       │       0.805 │        0.055 │      0.948 │        0.912 │       0.930 │
╰────────────────────────────────────────────────────────┴───────┴─────────────┴──────────────┴────────────┴──────────────┴─────────────╯

"""

from __future__ import annotations

import json as _json
import os
import random
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rich import box, print
from rich.console import Console
from rich.table import Table
from tqdm import tqdm

from libs.ml import (
    ClassificationTarget,
    Dataset,
    DatasetSample,
    EvaluationResult,
    FeatureVectorClassificationDataset,
    FeatureVectorInput,
    JSONClassificationDataset,
    JsonInput,
    JSONMultiLabelClassificationDataset,
    Label,
    MultiLabelClassificationTarget,
    RegressionDataset,
    RegressionTarget,
    TextClassificationDataset,
    TextInput,
    TextMultiLabelClassificationDataset,
    evaluate_classifier,
    evaluate_multilabel_classifier,
    evaluate_regressor,
)
from libs.ml.constants import create_default_ml_registry
from libs.ml.registry import MethodSpec, MLRegistry, TaskFormalism

# ─── 1. Datasets ──────────────────────────────────────────────────────────────


_SENTIMENT_LABELS_RULES = {
    "pos": [
        "great",
        "love",
        "fantastic",
        "excellent",
        "happy",
        "recommend",
        "perfect",
        "outstanding",
        "solid",
    ],
    "neg": [
        "terrible",
        "awful",
        "waste",
        "broken",
        "disappointment",
        "frustrating",
        "garbage",
        "cheap",
        "avoid",
    ],
}

_TOPIC_RULES = {
    "tech": [
        "gpu",
        "ai",
        "open-source",
        "smartphone",
        "computing",
        "tech",
        "technology",
    ],
    "politics": [
        "parliament",
        "government",
        "policy",
        "budget",
        "vote",
        "law",
        "politics",
    ],
    "science": [
        "scientists",
        "exoplanet",
        "quantum",
        "climate",
        "fusion",
        "gene",
        "research",
        "biology",
        "physics",
        "environment",
        "science",
    ],
    "sports": ["championship", "olympic", "runner", "football", "marathon", "sport"],
}

_SENTIMENT_LABELS = [
    Label(id="pos", name="pos", description="Positive review."),
    Label(id="neg", name="neg", description="Negative review."),
]

_TOPIC_LABELS = [
    Label(
        id="tech",
        name="tech",
        description="Technology, software, hardware, AI, computing",
    ),
    Label(
        id="politics",
        name="politics",
        description="Government, parliament, policy, elections, law",
    ),
    Label(
        id="science",
        name="science",
        description="Research, physics, biology, space, environment",
    ),
    Label(
        id="sports",
        name="sports",
        description="Athletics, football, tennis, competition, records",
    ),
]


# Rule sets are injected per-dataset for all rule_based methods.
# Non-rule-based methods get their config from method_configs as before.

METHOD_CONFIG_TEXT = {
    "random_classifier": {"labels": ["pos", "neg"], "seed": 42},
    "llm_text_classifier": {
        "labels": _SENTIMENT_LABELS,
        "prompt": "Classify this product review as positive (pos) or negative (neg).",
    },
}
TEXT_RULE_SETS = {"sentiment": _SENTIMENT_LABELS_RULES}

METHOD_CONFIG_TEXT_MULTILABEL = {
    "llm_text_classifier": {
        "labels": _TOPIC_LABELS,
        "prompt": "Classify this sample into one or more topics.",
        "multi_class": True,
    },
    "llm_text_multilabel_classifier": {
        "labels": _TOPIC_LABELS,
        "prompt": "Classify this sample into one or more topics.",
    },
    "llm_few_shot_text_multilabel_classifier": {
        "labels": _TOPIC_LABELS,
    },
}
TEXT_MULTILABEL_RULE_SETS = {"topics": _TOPIC_RULES}

METHOD_CONFIG_JSON = {
    "llm_json_classifier": {
        "labels": _TOPIC_LABELS,
        "prompt": "Classify this news article into one topic based on title and category.",
    },
}
JSON_RULE_SETS = {"topics": _TOPIC_RULES}

METHOD_CONFIG_JSON_MULTILABEL = {
    "llm_json_classifier": {
        "labels": _TOPIC_LABELS,
        "prompt": "Classify this sample into one or more topics.",
        "multi_class": True,
    },
    "llm_json_multilabel_classifier": {
        "labels": _TOPIC_LABELS,
        "prompt": "Classify this sample into one or more topics.",
    },
}
JSON_MULTILABEL_RULE_SETS = {"topics": _TOPIC_RULES}

_EDF_DIESEL_BPE_XLSX_PATH = Path(
    os.environ.get(
        "EDF_DIESEL_BPE_XLSX_PATH",
        "/Users/jogue/workspace/edf/bad/transferedf-share-1738146195167_janvier25/REX GE/Fichier bilan Diesel_BPE_Vcntrl.xlsx",
    )
)
_EDF_DIESEL_BPE_SHEET = "Fichier bilan Diesels 2015-2021"
_EDF_DIESEL_BPE_INPUT_COLUMNS = ["Site", "RF", "Résumé 1", "Résumé 2"]
_EDF_DIESEL_BPE_FD_LABELS = [
    Label(
        id="<fd>0.0",
        name="<fd>0.0",
        description="No Fd value / no labelled reliability impact.",
    ),
    Label(id="<fd>0.1", name="<fd>0.1", description="Fd category 0.1."),
    Label(id="<fd>0.5", name="<fd>0.5", description="Fd category 0.5."),
    Label(id="<fd>1.0", name="<fd>1.0", description="Fd category 1.0."),
]


def _make_text_classification_dataset() -> TextClassificationDataset:
    """text→label  · Sentiment · 20 samples."""
    rows = [
        ("I love this product, it works great", "pos"),
        ("Absolutely terrible, total waste of money", "neg"),
        ("Best purchase I have ever made", "pos"),
        ("Would not recommend to anyone", "neg"),
        ("Exceeded all my expectations", "pos"),
        ("Complete disappointment from start to finish", "neg"),
        ("Fantastic quality and fast delivery", "pos"),
        ("Broken on arrival, very frustrating", "neg"),
        ("Highly recommend, works perfectly", "pos"),
        ("Awful customer service, never again", "neg"),
        ("Five stars, outstanding quality", "pos"),
        ("Returned it immediately, garbage", "neg"),
        ("Solid and reliable, very happy", "pos"),
        ("Cheap materials, fell apart in days", "neg"),
        ("Exactly as described, great value", "pos"),
        ("Not worth the price at all", "neg"),
        ("Super fast shipping and perfect condition", "pos"),
        ("Missing parts, terrible experience", "neg"),
        ("Really happy with this purchase", "pos"),
        ("Complete waste of money, avoid", "neg"),
    ]
    return TextClassificationDataset(
        title="Sentiment",
        formalism=TaskFormalism.TEXT_TO_LABEL,
        metadata={
            "title": "text->label   · Sentiment · TextInput -> ClassificationTarget",
            "primary_metric": "accuracy",
            "test_size": 5,
            "method_configs": METHOD_CONFIG_TEXT,
            "rule_sets": TEXT_RULE_SETS,
        },
        samples=[
            DatasetSample(
                input=TextInput(text_value=text),
                target=ClassificationTarget(label_id=label),
            )
            for text, label in rows
        ],
    )


def _make_text_multilabel_dataset() -> TextMultiLabelClassificationDataset:
    """text→labels  · Topics · 16 samples."""
    rows: list[tuple[str, list[str]]] = [
        ("New GPU breaks benchmark records with 40% speed boost", ["tech"]),
        ("Parliament debates proposed spending cuts", ["politics"]),
        ("Scientists discover new exoplanet in habitable zone", ["science"]),
        ("Championship final set for Sunday showdown", ["sports"]),
        ("Open-source AI model released under MIT licence", ["tech", "science"]),
        ("Government announces green energy policy shift", ["politics", "science"]),
        ("Olympic champion breaks world record in sprint", ["sports"]),
        ("Quantum computing milestone achieved by research team", ["science", "tech"]),
        ("Budget vote sparks heated debate in parliament", ["politics"]),
        ("New smartphone features AI-powered camera", ["tech"]),
        ("Marathon runner sets new national record", ["sports"]),
        ("Climate summit reaches landmark agreement", ["politics", "science"]),
        ("Fusion reactor produces net energy gain", ["science", "tech"]),
        ("Football star signs record-breaking contract", ["sports"]),
        ("Tech giant faces antitrust investigation", ["tech", "politics"]),
        ("Gene editing trial shows promising results", ["science"]),
        (
            "AI model trained on climate data to predict extreme weather",
            ["tech", "science"],
        ),
        (
            "Parliament passes sweeping green energy legislation",
            ["politics", "science"],
        ),
        ("Olympic athlete breaks world record in 100m sprint", ["sports"]),
        (
            "Quantum chip powers climate model with unprecedented speed",
            ["tech", "science"],
        ),
        (
            "Government funds space research program with new budget",
            ["politics", "science"],
        ),
        ("New GPU sets gaming benchmark with record performance", ["tech"]),
        (
            "Football league adopts AI refereeing technology for next season",
            ["sports", "tech"],
        ),
        ("Gene therapy trial shows promising results for rare disease", ["science"]),
        ("Tech tax bill passes third reading in parliament", ["tech", "politics"]),
        (
            "Fusion reactor reaches milestone with 10x energy output increase",
            ["science", "tech"],
        ),
        (
            "Marathon champion turns politician to advocate for sports funding",
            ["sports", "politics"],
        ),
        (
            "Climate vote splits parliament as controversial bill fails to pass",
            ["science", "politics"],
        ),
        (
            "President announces new initiative to support scientific research and innovation",
            ["politics", "science"],
        ),
        (
            "Macron unveils plan to boost tech industry and create jobs in France",
            ["politics", "tech"],
        ),
        (
            "EDF won't invest in new nuclear plants, focusing on renewables and energy efficiency instead",
            ["tech", "politics"],
        ),
        (
            "Elon Musk's SpaceX successfully tests Starship rocket, marking a major milestone for private space exploration",
            ["tech", "science"],
        ),
        (
            "India's Chandrayaan-3 mission successfully lands on the moon, making it the fourth country to achieve this feat and advancing scientific research in lunar exploration",
            ["science", "tech"],
        ),
        (
            "WHO reports significant progress in malaria vaccine development, with promising results from clinical trials offering hope for reducing the global burden of this deadly disease",
            ["science"],
        ),
        (
            "European Parliament approves new data privacy regulations, strengthening protections for citizens and imposing stricter requirements on companies handling personal data",
            ["politics", "tech"],
        ),
        (
            "Targeted sanctions imposed on Russia by EU and US in response to invasion of Ukraine, aiming to pressure the government to cease hostilities and engage in diplomatic negotiations",
            ["politics"],
        ),
        (
            "Breakthrough in fusion energy achieved as researchers successfully sustain plasma for over 20 minutes, bringing us closer to realizing clean and virtually limitless energy from nuclear fusion",
            ["science", "tech"],
        ),
        (
            "Event: FIFA World Cup 2022 kicks off in Qatar, showcasing the world's top football talent and bringing together fans from around the globe for a month of thrilling matches and unforgettable moments",
            ["sports"],
        ),
        (
            "NBA star LeBron James announces retirement after 20-year career, leaving behind a legacy as one of the greatest basketball players of all time and a global sports icon",
            ["sports"],
        ),
        (
            "Tennis legend Serena Williams wins her 24th Grand Slam title, cementing her status as one of the greatest athletes in history and inspiring a new generation of tennis players worldwide",
            ["sports"],
        ),
        (
            "This subject is not about science, technology or politics, it's about winning, competing, breaking records : it's about what makes the community thrives, it's Monaco Grand Prix, one of the most prestigious events in the Formula 1 calendar, where drivers navigate the challenging street circuit of Monte Carlo, showcasing their skill and precision",
            ["sports"],
        ),
    ]
    return TextMultiLabelClassificationDataset(
        title="News topics",
        formalism=TaskFormalism.TEXT_TO_LABELS,
        metadata={
            "title": "text->labels  · Topics    · TextInput -> MultiLabelClassificationTarget",
            "primary_metric": "f1",
            "test_size": 4,
            "method_configs": METHOD_CONFIG_TEXT_MULTILABEL,
            "rule_sets": TEXT_MULTILABEL_RULE_SETS,
        },
        samples=[
            DatasetSample(
                input=TextInput(text_value=text),
                target=MultiLabelClassificationTarget(label_ids=labels),
            )
            for text, labels in rows
        ],
    )


def _make_fv_classification_dataset() -> FeatureVectorClassificationDataset:
    """fv→label  · Points above/below y=x diagonal · 20 samples."""
    rows: list[tuple[list[float], str]] = [
        ([1.0, 3.0], "above"),
        ([2.0, 5.0], "above"),
        ([0.5, 2.0], "above"),
        ([1.5, 4.0], "above"),
        ([3.0, 7.0], "above"),
        ([2.5, 6.0], "above"),
        ([0.0, 1.5], "above"),
        ([4.0, 9.0], "above"),
        ([1.0, 2.5], "above"),
        ([3.5, 8.0], "above"),
        ([3.0, 1.0], "below"),
        ([5.0, 2.0], "below"),
        ([2.0, 0.5], "below"),
        ([4.0, 1.5], "below"),
        ([7.0, 3.0], "below"),
        ([6.0, 2.5], "below"),
        ([1.5, 0.0], "below"),
        ([9.0, 4.0], "below"),
        ([2.5, 1.0], "below"),
        ([8.0, 3.5], "below"),
    ]
    return FeatureVectorClassificationDataset(
        title="Points above/below diagonal",
        formalism=TaskFormalism.FV_TO_LABEL,
        metadata={
            "title": "fv->label     · Geometry  · FeatureVectorInput -> ClassificationTarget",
            "primary_metric": "accuracy",
            "test_size": 5,
        },
        samples=[
            DatasetSample(
                input=FeatureVectorInput(vector_value=vec),
                target=ClassificationTarget(label_id=label),
            )
            for vec, label in rows
        ],
    )


def _make_regression_dataset() -> RegressionDataset:
    """fv→value  · y=x² · 14 samples."""
    xs = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0]
    return RegressionDataset(
        title="Quadratic function",
        formalism=TaskFormalism.FV_TO_FLOAT,
        metadata={
            "title": "fv->float     · y=x2      · FeatureVectorInput -> RegressionTarget",
            "primary_metric": "r2",
            "test_size": 3,
            "method_configs": {
                "polynomial_regressor": {"degree": 2},
            },
        },
        samples=[
            DatasetSample(
                input=FeatureVectorInput(vector_value=[x]),
                target=RegressionTarget(value=x * x),
            )
            for x in xs
        ],
    )


def _make_json_classification_dataset() -> JSONClassificationDataset:
    """json→label  · News articles with title+category fields · 16 samples."""
    rows: list[tuple[dict, str]] = [
        ({"title": "New GPU breaks benchmark records", "category": "hardware"}, "tech"),
        (
            {"title": "Parliament debates spending cuts", "category": "government"},
            "politics",
        ),
        (
            {"title": "Scientists discover new exoplanet", "category": "astronomy"},
            "science",
        ),
        ({"title": "Championship final this Sunday", "category": "football"}, "sports"),
        ({"title": "Open-source AI model released", "category": "software"}, "tech"),
        (
            {"title": "Green energy policy announced", "category": "environment"},
            "politics",
        ),
        (
            {"title": "Olympic champion breaks record", "category": "athletics"},
            "sports",
        ),
        (
            {"title": "Quantum computing breakthrough", "category": "research"},
            "science",
        ),
        ({"title": "Budget vote sparks debate", "category": "parliament"}, "politics"),
        ({"title": "Smartphone features AI camera", "category": "mobile"}, "tech"),
        ({"title": "Marathon runner sets record", "category": "athletics"}, "sports"),
        (
            {"title": "Climate summit agreement reached", "category": "environment"},
            "science",
        ),
        ({"title": "Fusion reactor net energy gain", "category": "physics"}, "science"),
        ({"title": "Football star signs mega deal", "category": "football"}, "sports"),
        (
            {"title": "Tech giant faces antitrust probe", "category": "regulation"},
            "tech",
        ),
        ({"title": "Gene editing trial results", "category": "medicine"}, "science"),
    ]
    return JSONClassificationDataset(
        title="News articles with title+category fields",
        formalism=TaskFormalism.JSON_TO_LABEL,
        metadata={
            "title": "json->label   · News      · JsonInput -> ClassificationTarget",
            "primary_metric": "accuracy",
            "test_size": 5,
            "method_configs": METHOD_CONFIG_JSON,
            "rule_sets": JSON_RULE_SETS,
        },
        samples=[
            DatasetSample(
                input=JsonInput(json_value=_json.dumps(article)),
                target=ClassificationTarget(label_id=label),
            )
            for article, label in rows
        ],
    )


def _make_json_multilabel_dataset() -> JSONMultiLabelClassificationDataset:
    """json→labels  · Articles with multiple topic fields · 12 samples."""
    rows: list[tuple[dict, list[str]]] = [
        (
            {"title": "AI model trained on climate data", "source": "research"},
            ["tech", "science"],
        ),
        (
            {"title": "Parliament passes green energy law", "source": "parliament"},
            ["politics", "science"],
        ),
        (
            {"title": "Olympic athlete breaks world record", "source": "athletics"},
            ["sports"],
        ),
        (
            {"title": "Quantum chip powers climate model", "source": "lab"},
            ["tech", "science"],
        ),
        (
            {"title": "Government funds space research", "source": "budget"},
            ["politics", "science"],
        ),
        ({"title": "New GPU sets gaming benchmark", "source": "hardware"}, ["tech"]),
        (
            {"title": "Football league adopts AI refereeing", "source": "sports-tech"},
            ["sports", "tech"],
        ),
        (
            {"title": "Gene therapy trial shows results", "source": "medicine"},
            ["science"],
        ),
        (
            {"title": "Tech tax bill passes third reading", "source": "parliament"},
            ["tech", "politics"],
        ),
        (
            {"title": "Fusion reactor reaches milestone", "source": "physics"},
            ["science", "tech"],
        ),
        (
            {"title": "Marathon champion turns politician", "source": "celebrity"},
            ["sports", "politics"],
        ),
        (
            {"title": "Climate vote splits parliament", "source": "politics"},
            ["science", "politics"],
        ),
    ]
    return JSONMultiLabelClassificationDataset(
        title="News articles with title+category fields",
        formalism=TaskFormalism.JSON_TO_LABELS,
        metadata={
            "title": "json->labels  · News      · JsonInput -> MultiLabelClassificationTarget",
            "primary_metric": "f1",
            "test_size": 4,
            "method_configs": METHOD_CONFIG_JSON_MULTILABEL,
            "rule_sets": JSON_MULTILABEL_RULE_SETS,
        },
        samples=[
            DatasetSample(
                input=JsonInput(json_value=_json.dumps(article)),
                target=MultiLabelClassificationTarget(label_ids=labels),
            )
            for article, labels in rows
        ],
    )


def _make_json_structured_classification_dataset() -> JSONClassificationDataset:
    """json→label  · Heterogeneous support/sales/security events · faker-generated."""
    from faker import Faker

    seed = 1337
    faker = Faker()
    faker.seed_instance(seed)
    random_generator = random.Random(seed)  # noqa: S311

    def _support_payload() -> dict[str, Any]:
        return {
            "message": f"{faker.sentence(nb_words=9)} Need help with invoice and account setup.",
            "department": random_generator.choice(
                ["support", "helpdesk", "customer_success"]
            ),
            "ticket_count": random_generator.randint(1, 7),
            "monthly_spend_eur": round(random_generator.uniform(49.0, 850.0), 2),
            "is_enterprise": random_generator.random() < 0.2,
            "created_at": faker.date_time_between(
                start_date="-120d", end_date="-10d"
            ).isoformat(),
            "profile": {
                "country": faker.country_code(),
                "preferred_channel": random_generator.choice(
                    ["email", "chat", "phone"]
                ),
            },
            "tags": random_generator.sample(
                ["onboarding", "billing", "faq", "ux"], k=2
            ),
        }

    def _sales_payload() -> dict[str, Any]:
        return {
            "message": f"{faker.sentence(nb_words=8)} Interested in annual contract and premium features.",
            "department": random_generator.choice(["sales", "partnership", "growth"]),
            "ticket_count": random_generator.randint(1, 4),
            "monthly_spend_eur": round(random_generator.uniform(1200.0, 12000.0), 2),
            "is_enterprise": random_generator.random() < 0.85,
            "created_at": faker.date_time_between(
                start_date="-90d", end_date="-1d"
            ).isoformat(),
            "profile": {
                "country": faker.country_code(),
                "preferred_channel": random_generator.choice(
                    ["phone", "meeting", "email"]
                ),
            },
            "tags": random_generator.sample(
                ["pricing", "contract", "upgrade", "demo"], k=2
            ),
        }

    def _security_payload() -> dict[str, Any]:
        return {
            "message": f"{faker.sentence(nb_words=7)} Suspicious login detected and access revoked.",
            "department": random_generator.choice(
                ["security", "compliance", "trust_and_safety"]
            ),
            "ticket_count": random_generator.randint(4, 15),
            "monthly_spend_eur": round(random_generator.uniform(150.0, 2800.0), 2),
            "is_enterprise": random_generator.random() < 0.4,
            "created_at": faker.date_time_between(
                start_date="-60d", end_date="now"
            ).isoformat(),
            "profile": {
                "country": faker.country_code(),
                "preferred_channel": random_generator.choice(
                    ["email", "chat", "incident_room"]
                ),
            },
            "tags": random_generator.sample(
                ["security", "alert", "access", "incident"], k=2
            ),
        }

    rows: list[tuple[dict[str, Any], str]] = []
    for _ in range(96):
        label = random_generator.choices(
            ["support", "sales", "security"],
            weights=[0.45, 0.3, 0.25],
            k=1,
        )[0]
        if label == "support":
            rows.append((_support_payload(), label))
        elif label == "sales":
            rows.append((_sales_payload(), label))
        else:
            rows.append((_security_payload(), label))

    random_generator.shuffle(rows)

    return JSONClassificationDataset(
        title="Heterogeneous events with structured JSON input",
        formalism=TaskFormalism.JSON_TO_LABEL,
        metadata={
            "title": "json->label   · Heterogeneous events · Structured JsonInput -> ClassificationTarget",
            "primary_metric": "accuracy",
            "test_size": 12,
            "method_configs": METHOD_CONFIG_JSON,
            "rule_sets": {
                "departments": {
                    "support": ["invoice", "account", "setup", "billing", "onboarding"],
                    "sales": ["annual", "contract", "premium", "pricing", "demo"],
                    "security": ["suspicious", "login", "revoked", "alert", "incident"],
                }
            },
            "ignored_method_keys": [
                "svm_json_classifier",
                "smart_svm_json_classifier",
                "gradient_boosting_json_classifier",
                "smart_random_forest_json_classifier",
                "structured_svm_json_classifier",
                "structured_smart_svm_json_classifier",
                "structured_smart_random_forest_json_classifier",
                "mlp_json_classifier",
                "smart_mlp_json_classifier",
                "structured_mlp_json_classifier",
                "structured_smart_mlp_json_classifier",
                "smart_random_forest_json_classifier",
                "structured_random_forest_json_classifier",
                "structured_smart_logistic_regression_json_classifier",
                "smart_logistic_regression_json_classifier",
            ],
        },
        samples=[
            DatasetSample(
                input=JsonInput(json_value=_json.dumps(payload)),
                target=ClassificationTarget(label_id=label),
            )
            for payload, label in rows
        ],
    )


def _make_openml_credit_g_dataset() -> JSONClassificationDataset:
    """json→label  · German credit from OpenML dataset 31 · 1,000 samples."""
    import openml
    import pandas as pd

    print("Downloading and processing OpenML credit-g dataset...")
    # dataset = openml.datasets.get_dataset("credit-g") # or by ID get_dataset(31)
    # X, y, categorical_indicator, attribute_names = dataset.get_data(target="class")

    # dataset = openml.datasets.get_dataset("credit-g") # or by ID get_dataset(31)
    dataset = openml.datasets.get_dataset(31)
    features, target, _categorical_indicator, _attribute_names = dataset.get_data(
        target="class"
    )
    print("Dataset downloaded. Processing records...")

    def _json_safe(value: Any) -> Any:
        if pd.isna(value):
            return None
        if hasattr(value, "item"):
            return value.item()
        return value

    rows = [
        (
            {column: _json_safe(value) for column, value in record.items()},
            str(label),
        )
        for record, label in zip(
            features.to_dict(orient="records"), target.tolist(), strict=True
        )
    ]
    return JSONClassificationDataset(
        title="German credit (OpenML 31)",
        formalism=TaskFormalism.JSON_TO_LABEL,
        metadata={
            "title": "json->label   · German credit · OpenML 31 mixed fields -> ClassificationTarget",
            "primary_metric": "accuracy",
            "test_size": 200,
        },
        samples=[
            DatasetSample(
                input=JsonInput(json_value=_json.dumps(payload)),
                target=ClassificationTarget(label_id=label),
            )
            for payload, label in rows
        ],
    )


def _make_openml_spambase_dataset() -> JSONClassificationDataset:
    """json→label  · Spambase from OpenML dataset 44 · 4,601 samples."""
    import openml
    import pandas as pd

    print("Downloading and processing OpenML spambase dataset...")
    dataset = openml.datasets.get_dataset(44)
    features, target, _categorical_indicator, _attribute_names = dataset.get_data(
        target="class"
    )
    print("Dataset downloaded. Processing records...")

    def _json_safe(value: Any) -> Any:
        if pd.isna(value):
            return None
        if hasattr(value, "item"):
            return value.item()
        return value

    rows = [
        (
            {column: _json_safe(value) for column, value in record.items()},
            "spam" if str(label) == "1" else "ham",
        )
        for record, label in zip(
            features.to_dict(orient="records"), target.tolist(), strict=True
        )
    ]

    dataset = JSONClassificationDataset(
        title="Spambase (OpenML 44)",
        formalism=TaskFormalism.JSON_TO_LABEL,
        metadata={
            "title": "json->label   · Spambase   · OpenML 44 mixed fields -> ClassificationTarget",
            "primary_metric": "accuracy",
            "test_size": 460,
        },
        samples=[
            DatasetSample(
                input=JsonInput(json_value=_json.dumps(payload)),
                target=ClassificationTarget(label_id=label),
            )
            for payload, label in rows
        ],
    )

    print(len(dataset.samples), "samples processed and ready for benchmarking.")

    return dataset


def _make_edf_diesel_bpe_fd_dataset(merge_non_zero: bool = False) -> JSONClassificationDataset:
    """json→label · EDF Diesel BPE REX sheet · predict Fd from selected fields."""
    import pandas as pd

    if not _EDF_DIESEL_BPE_XLSX_PATH.exists():
        raise FileNotFoundError(
            f"EDF Diesel BPE workbook not found: {_EDF_DIESEL_BPE_XLSX_PATH}"
        )

    selected_columns = [*_EDF_DIESEL_BPE_INPUT_COLUMNS, "Fd"]
    frame = pd.read_excel(
        _EDF_DIESEL_BPE_XLSX_PATH,
        sheet_name=_EDF_DIESEL_BPE_SHEET,
        usecols=lambda column: column in selected_columns,
    )

    def _json_safe(value: Any) -> Any:
        if pd.isna(value):
            return None
        if hasattr(value, "item"):
            value = value.item()
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    def _fd_label(value: Any) -> str:
        if pd.isna(value):
            return "<fd>0.0"
        if hasattr(value, "item"):
            value = value.item()
        if isinstance(value, str):
            value = value.strip().replace(",", ".")
            if not value:
                return "<fd>0.0"
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            normalized = str(value).strip()
            return normalized if normalized.startswith("<fd>") else f"<fd>{normalized}"
        return f"<fd>{numeric:.1f}"
    
    def _merged_fd_label(value: Any) -> str:
        label = _fd_label(value)
        if label != "<fd>0.0":
            return "<fd>non-zero"
        return label

    samples = [
        DatasetSample(
            input=JsonInput(
                json_value=_json.dumps(
                    {
                        column: _json_safe(record.get(column))
                        for column in _EDF_DIESEL_BPE_INPUT_COLUMNS
                    },
                    ensure_ascii=False,
                )
            ),
            target=ClassificationTarget(label_id=_merged_fd_label(record.get("Fd")) if merge_non_zero else _fd_label(record.get("Fd"))),
        )
        for record in frame.to_dict(orient="records")
    ]

    # # only keep 10% where Fd is 0:
    # zero_samples = [s for s in samples if s.target.label_id == "<fd>0.0"]
    # non_zero_samples = [s for s in samples if s.target.label_id != "<fd>0.0"]
    # random.shuffle(zero_samples)
    # balanced_samples = zero_samples[: len(non_zero_samples)] + non_zero_samples
    # random.shuffle(balanced_samples)
    balanced_samples = samples

    return JSONClassificationDataset(
        title="EDF Diesel BPE Fd (2015-2021)",
        formalism=TaskFormalism.JSON_TO_LABEL,
        metadata={
            "title": "json->label   · EDF Diesel BPE · Site/RF/Résumé -> Fd",
            "primary_metric": "f1",
            "evaluation_splits": 3,
            "evaluation_jobs": 3,
            "method_configs": {
                "llm_json_classifier": {
                    "labels": _EDF_DIESEL_BPE_FD_LABELS,
                    "selection_mode": "label_id",
                    "prompt": (
                        "Predict the Fd category for this diesel event from the JSON fields "
                        "Site, RF, Résumé 1 and Résumé 2.\n\n"
                        "Fd is a reliability-weighting factor used in residual lifetime "
                        "calculations:\n"
                        "The allowed label ids are intentionally prefixed with '<fd>' to "
                        "avoid confusing the Fd value with a rank. Return the exact label "
                        "id, including the prefix and one decimal digit.\n\n"
                        "- <fd>0.0: the event should not affect reliability calculations; no "
                        "meaningful impact on failure-rate/lambda estimation.\n"
                        "- <fd>0.1: the event has a very weak reliability signal; include it "
                        "only as a minor contribution.\n"
                        "- <fd>0.5: the event has a partial reliability impact; it should "
                        "contribute to lifetime/failure-rate calculations, but less than "
                        "a full failure-relevant event.\n"
                        "- <fd>1.0: the event is clearly reliability-significant and should be "
                        "fully counted in lambda/failure-rate calculation.\n\n"
                        "Choose the label that best reflects whether the event should "
                        "influence residual lifetime and lambda estimation, not whether it "
                        "is merely operationally inconvenient or administratively important.\n\n"
                        "Return exactly one label id among: <fd>0.0, <fd>0.1, <fd>0.5, <fd>1.0."
                    ),
                },
            },
            "ignored_method_keys": [
                "svm_json_classifier",
                "smart_svm_json_classifier",
                "gradient_boosting_json_classifier",
                "smart_random_forest_json_classifier",
                "structured_svm_json_classifier",
                "structured_smart_svm_json_classifier",
                "structured_smart_random_forest_json_classifier",
                "mlp_json_classifier",
                "smart_mlp_json_classifier",
                "structured_mlp_json_classifier",
                "structured_smart_mlp_json_classifier",
                "smart_random_forest_json_classifier",
                "structured_random_forest_json_classifier",
                "structured_smart_logistic_regression_json_classifier",
                "smart_logistic_regression_json_classifier",
            ],
            "source": str(_EDF_DIESEL_BPE_XLSX_PATH),
            "sheet": _EDF_DIESEL_BPE_SHEET,
            "label_column": "Fd",
            "input_columns": list(_EDF_DIESEL_BPE_INPUT_COLUMNS),
        },
        samples=balanced_samples,
    )


def _method_config(method: MethodSpec, dataset: Dataset) -> dict[str, Any]:
    configs = (dataset.metadata or {}).get("method_configs", {})
    if not isinstance(configs, dict):
        return {}
    config = configs.get(method.key, {})
    if not isinstance(config, dict):
        return {}
    return dict(config)


def _ignored_method_keys(dataset: Dataset) -> set[str]:
    ignored = (dataset.metadata or {}).get("ignored_method_keys", [])
    if isinstance(ignored, str):
        return {ignored}
    if not isinstance(ignored, list | tuple | set):
        return set()
    return {str(key) for key in ignored}


def _method_tags(entry: MethodSpec) -> list[str]:
    tags: list[str] = []
    if entry.zero_shot:
        tags.append("llm")
    if (
        entry.key.startswith("smart_")
        or "_smart_" in entry.key
        or entry.key.startswith("json_smart_")
    ):
        tags.append("smart")
    if entry.rule_based:
        tags.append("rules")
    if entry.trainable:
        tags.append("trainable")
    if entry.key.startswith("structured_"):
        tags.append("structured")
    return tags


# ─── 3. Benchmark runners ─────────────────────────────────────────────────────


@dataclass
class BenchmarkRun:
    method: str
    tags: list[str]
    metrics: dict[str, float]
    confusion_matrix: dict[str, dict[str, int]] | None = None
    error: str | None = None


@dataclass
class DatasetBenchmark:
    title: str
    primary_metric: str
    runs: list[BenchmarkRun]
    class_counts: dict[str, int] | None = None


def _run_method(
    *,
    registry: MLRegistry,
    method: MethodSpec,
    dataset: Dataset,
    rule_set_name: str | None = None,
    rule_set: dict | None = None,
    show_fold_progress: bool = False,
) -> BenchmarkRun:
    formalism = dataset.formalism
    config = _method_config(method, dataset)
    if rule_set:
        config = {"rules": rule_set, **config}
    name = f"{method.name} ({rule_set_name})" if rule_set_name else method.name
    try:
        if method.trainable:
            n_splits = int((dataset.metadata or {}).get("evaluation_splits", 3))
            folds = dataset.k_fold_splits(n_splits)
            fold_jobs = _evaluation_jobs(method, dataset, n_splits)
            if fold_jobs > 1:
                fold_results = _run_folds_parallel(
                    registry=registry,
                    method=method,
                    config=config,
                    formalism=formalism,
                    folds=folds,
                    name=name,
                    max_workers=fold_jobs,
                    show_progress=show_fold_progress,
                )
            else:
                fold_results = []
                fold_iterator = tqdm(
                    folds,
                    desc=f"folds · {name}",
                    unit="fold",
                    leave=False,
                    disable=not show_fold_progress,
                )
                for train, evaluation_dataset in fold_iterator:
                    fold_results.append(
                        _run_trainable_fold(
                            registry=registry,
                            method=method,
                            config=config,
                            formalism=formalism,
                            train=train,
                            evaluation_dataset=evaluation_dataset,
                        )
                    )
            metrics = _aggregate_fold_metrics(fold_results)
            confusion_matrix = _merge_evaluation_confusion_matrices(fold_results)
        else:
            algorithm = registry.build(method.key, config)
            result = _evaluate_algorithm(algorithm, formalism, dataset)
            metrics = result.metrics
            confusion_matrix = _extract_evaluation_confusion_matrix(result)

        return BenchmarkRun(
            method=name,
            tags=_method_tags(method),
            metrics=metrics,
            confusion_matrix=confusion_matrix,
        )
    except Exception as exc:
        return BenchmarkRun(
            method=name, tags=_method_tags(method), metrics={}, error=str(exc)[:80]
        )


def _evaluation_jobs(method: MethodSpec, dataset: Dataset, n_splits: int) -> int:
    if (
        method.key.startswith("smart_")
        or method.key.startswith("structured_smart_")
        or "_smart_" in method.key
    ):
        return 1
    raw_jobs = os.environ.get("ML_BENCHMARK_FOLD_JOBS") or (dataset.metadata or {}).get(
        "evaluation_jobs", 1
    )
    try:
        requested_jobs = int(raw_jobs)
    except (TypeError, ValueError):
        return 1
    return max(1, min(requested_jobs, n_splits))


def _run_trainable_fold(
    *,
    registry: MLRegistry,
    method: MethodSpec,
    config: dict[str, Any],
    formalism: TaskFormalism,
    train: Dataset,
    evaluation_dataset: Dataset,
) -> EvaluationResult:
    algorithm = registry.build(method.key, config)
    _fit_algorithm(algorithm, formalism, train)
    return _evaluate_algorithm(algorithm, formalism, evaluation_dataset)


def _run_folds_parallel(
    *,
    registry: MLRegistry,
    method: MethodSpec,
    config: dict[str, Any],
    formalism: TaskFormalism,
    folds: list[tuple[Dataset, Dataset]],
    name: str,
    max_workers: int,
    show_progress: bool,
) -> list[EvaluationResult]:
    results: list[EvaluationResult | None] = [None] * len(folds)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(
                _run_trainable_fold,
                registry=registry,
                method=method,
                config=config,
                formalism=formalism,
                train=train,
                evaluation_dataset=evaluation_dataset,
            ): index
            for index, (train, evaluation_dataset) in enumerate(folds)
        }
        progress = tqdm(
            total=len(folds),
            desc=f"folds · {name} · {max_workers} workers",
            unit="fold",
            leave=False,
            disable=not show_progress,
        )
        try:
            for future in as_completed(future_to_index):
                index = future_to_index[future]
                results[index] = future.result()
                progress.update(1)
        finally:
            progress.close()
    return [result for result in results if result is not None]


def _fit_algorithm(algorithm: Any, formalism: TaskFormalism, train: Dataset) -> None:
    train_samples = train.labeled_samples()
    if formalism in {
        TaskFormalism.TEXT_TO_LABEL,
        TaskFormalism.JSON_TO_LABEL,
        TaskFormalism.FV_TO_LABEL,
    }:
        algorithm.fit(
            [sample.input for sample in train_samples],
            [Label(id=sample.target.label_id, name=sample.target.label_id) for sample in train_samples],  # type: ignore[union-attr]
        )
    elif formalism in {
        TaskFormalism.TEXT_TO_LABELS,
        TaskFormalism.JSON_TO_LABELS,
    }:
        algorithm.fit(
            [sample.input for sample in train_samples],
            [[Label(id=lid, name=lid) for lid in sample.target.label_ids] for sample in train_samples],  # type: ignore[union-attr]
        )
    elif formalism == TaskFormalism.FV_TO_FLOAT:
        algorithm.fit(
            [sample.input for sample in train_samples],
            [sample.target.value for sample in train_samples],  # type: ignore[union-attr]
        )


def _evaluate_algorithm(
    algorithm: Any, formalism: TaskFormalism, evaluation_dataset: Dataset
) -> EvaluationResult:
    if formalism in {TaskFormalism.TEXT_TO_LABELS, TaskFormalism.JSON_TO_LABELS}:
        return evaluate_multilabel_classifier(algorithm, evaluation_dataset)
    if formalism == TaskFormalism.FV_TO_FLOAT:
        return evaluate_regressor(algorithm, evaluation_dataset)
    return evaluate_classifier(
        algorithm,
        evaluation_dataset,
        include_confusion_matrix=True,
    )


def _aggregate_fold_metrics(results: list[EvaluationResult]) -> dict[str, float]:
    metric_keys = results[0].metrics.keys()
    metrics: dict[str, float] = {"folds": float(len(results))}
    for key in metric_keys:
        values = [result.metrics[key] for result in results]
        metrics[key] = statistics.fmean(values)
        metrics[f"{key}_std"] = statistics.pstdev(values)
    return metrics


def _extract_evaluation_confusion_matrix(
    result: EvaluationResult,
) -> dict[str, dict[str, int]] | None:
    """Extract the ML-lib confusion matrix from an evaluation result."""
    metadata = result.metadata or {}
    matrix = metadata.get("confusion_matrix")
    if not isinstance(matrix, dict):
        return None
    return {
        str(true_label): {
            str(predicted_label): int(count)
            for predicted_label, count in predicted_counts.items()
        }
        for true_label, predicted_counts in matrix.items()
        if isinstance(predicted_counts, dict)
    }


def _merge_evaluation_confusion_matrices(
    results: list[EvaluationResult],
) -> dict[str, dict[str, int]] | None:
    """Merge confusion matrices that were generated by ``evaluate_classifier``."""
    matrices = [
        matrix
        for result in results
        if (matrix := _extract_evaluation_confusion_matrix(result)) is not None
    ]
    if not matrices:
        return None

    labels = sorted(
        {
            label
            for matrix in matrices
            for true_label, predicted_counts in matrix.items()
            for label in {true_label, *predicted_counts.keys()}
        }
    )
    combined = {
        true_label: {predicted_label: 0 for predicted_label in labels}
        for true_label in labels
    }
    for matrix in matrices:
        for true_label, predicted_counts in matrix.items():
            for predicted_label, count in predicted_counts.items():
                combined[true_label][predicted_label] += int(count)
    return combined


# ─── 4. Display ───────────────────────────────────────────────────────────────


def _print_table(
    title: str,
    runs: list[BenchmarkRun],
    primary_metric: str,
    class_counts: dict[str, int] | None = None,
) -> None:
    console = Console()

    ok = sorted(
        [r for r in runs if not r.error],
        key=lambda r: r.metrics.get(primary_metric, -1),
        reverse=True,
    )
    err = [r for r in runs if r.error]

    _print_dataset_class_summary(title, class_counts, console)

    table = Table(
        title=title,
        box=box.ROUNDED,
        show_header=True,
        header_style="bold cyan",
        title_style="bold white",
        border_style="dim",
        expand=False,
    )
    table.add_column("Method", style="white", min_width=28)

    metric_keys = (
        [key for key in ok[0].metrics if key != "folds" and not key.endswith("_std")]
        if ok
        else []
    )
    has_folds = any("folds" in run.metrics for run in ok)
    if has_folds:
        table.add_column("folds", justify="right", style="dim white", min_width=5)
    for key in metric_keys:
        style = "bold yellow" if key == primary_metric else "dim white"
        table.add_column(key, justify="right", style=style, min_width=8)

    for run in ok:
        tag_str = " [dim]\\[" + ",".join(run.tags) + "][/dim]" if run.tags else ""
        name_cell = f"{run.method}{tag_str}"
        values = []
        if has_folds:
            folds = run.metrics.get("folds")
            values.append(str(int(folds)) if folds else "—")
        for key in metric_keys:
            value = run.metrics.get(key, 0.0)
            std = run.metrics.get(f"{key}_std")
            values.append(
                f"{value:.3f}±{std:.3f}" if std is not None else f"{value:.3f}"
            )
        # highlight the best (first) row in primary metric
        row_style = "green" if run == ok[0] else ""
        table.add_row(name_cell, *values, style=row_style)

    console.print()
    console.print(table)

    if err:
        err_table = Table(box=box.SIMPLE, show_header=False, border_style="dim red")
        err_table.add_column("method", style="red")
        err_table.add_column("error", style="dim")
        for run in err:
            err_table.add_row(f"✗ {run.method}", run.error or "")
        console.print(err_table)

    if ok and ok[0].confusion_matrix:
        _print_confusion_matrix(
            title=f"Confusion matrix · best method: {ok[0].method}",
            matrix=ok[0].confusion_matrix,
            console=console,
        )


def _print_confusion_matrix(
    *,
    title: str,
    matrix: dict[str, dict[str, int]],
    console: Console,
) -> None:
    labels = sorted(
        {
            label
            for true_label, predicted_counts in matrix.items()
            for label in {true_label, *predicted_counts.keys()}
        }
    )
    if not labels:
        return

    table = Table(
        title=title,
        box=box.ROUNDED,
        show_header=True,
        header_style="bold cyan",
        border_style="dim",
        expand=False,
    )
    table.add_column("true \\ pred", style="white", min_width=10)
    for label in labels:
        table.add_column(label, justify="right", style="dim white", min_width=8)

    for true_label in labels:
        counts = matrix.get(true_label, {})
        row_total = sum(counts.values())
        row = []
        for predicted_label in labels:
            count = counts.get(predicted_label, 0)
            percentage = (100 * count / row_total) if row_total else 0.0
            row.append(f"{percentage:.1f}%")
        table.add_row(true_label, *row)

    console.print()
    console.print(table)


def _print_dataset_class_summary(
    title: str,
    class_counts: dict[str, int] | None,
    console: Console,
) -> None:
    if not class_counts:
        return

    table = Table(
        title=f"Class distribution · {title}",
        box=box.SIMPLE,
        show_header=True,
        header_style="bold cyan",
        border_style="dim",
        expand=False,
    )
    table.add_column("class", style="white")
    table.add_column("items", justify="right", style="dim white")

    for label, count in sorted(
        class_counts.items(), key=lambda item: (-item[1], item[0])
    ):
        table.add_row(label, str(count))

    console.print()
    console.print(table)


# ─── 5. Main ──────────────────────────────────────────────────────────────────


def _benchmark_datasets() -> list[Dataset]:
    return [
        # _make_text_classification_dataset(),
        _make_text_multilabel_dataset(),
        # _make_fv_classification_dataset(),
        # _make_regression_dataset(),
        # _make_json_classification_dataset(),
        # _make_json_structured_classification_dataset(),
        # _make_edf_diesel_bpe_fd_dataset(),
        # _make_openml_credit_g_dataset(),
        # _make_openml_spambase_dataset(),
        # _make_json_multilabel_dataset(),
    ]


def _dataset_class_counts(dataset: Dataset) -> dict[str, int] | None:
    counts: dict[str, int] = {}
    for sample in dataset.labeled_samples():
        target = sample.target
        if isinstance(target, ClassificationTarget):
            counts[target.label_id] = counts.get(target.label_id, 0) + 1
        elif isinstance(target, MultiLabelClassificationTarget):
            for label_id in target.label_ids:
                counts[label_id] = counts.get(label_id, 0) + 1
        else:
            return None
    return counts or None


def run_benchmark() -> list[DatasetBenchmark]:
    datasets = _benchmark_datasets()
    include_llm = os.environ.get("ML_INCLUDE_LLM") == "1"
    registry = create_default_ml_registry(include_llm=include_llm)
    methods = registry.list()

    results: list[DatasetBenchmark] = []
    dataset_progress = tqdm(datasets, desc="datasets", unit="dataset")
    for dataset in dataset_progress:
        dataset_progress.set_postfix_str(dataset.title or str(dataset.formalism))
        compatible = [m for m in methods if dataset.formalism in m.formalisms]
        ignored_method_keys = _ignored_method_keys(dataset)
        rule_sets: dict[str, dict] = (dataset.metadata or {}).get("rule_sets", {})
        runs: list[BenchmarkRun] = []
        runnable_methods = [
            method
            for method in compatible
            if method.key not in ignored_method_keys
            and (not method.rule_based or rule_sets)
        ]
        method_progress = tqdm(
            runnable_methods,
            desc=f"methods · {dataset.title or dataset.formalism}",
            unit="method",
            leave=False,
        )
        for method in method_progress:
            # if "few_shot" in method.key:
            #     continue  # skip non-LLM methods in this demo to save time; set ML_INCLUDE_LLM=1 to include them
            # if "llm" not in method.key:
            #     continue
            method_progress.set_postfix_str(method.name)
            if method.rule_based and not rule_sets:
                continue
            if method.rule_based:
                for rs_name, rs_rules in rule_sets.items():
                    runs.append(
                        _run_method(
                            registry=registry,
                            method=method,
                            dataset=dataset,
                            rule_set_name=rs_name,
                            rule_set=rs_rules,
                            show_fold_progress=True,
                        )
                    )
            else:
                runs.append(
                    _run_method(
                        registry=registry,
                        method=method,
                        dataset=dataset,
                        show_fold_progress=True,
                    )
                )
        results.append(
            DatasetBenchmark(
                title=dataset.title + f" ({dataset.formalism})",
                primary_metric=str(
                    (dataset.metadata or {}).get("primary_metric", "f1")
                ),
                runs=runs,
                class_counts=_dataset_class_counts(dataset),
            )
        )

    total = sum(len(r.runs) for r in results)
    print(
        f"\nRunning benchmark — {total} method x dataset combinations across {len(datasets)} formalisms…"
    )
    return results


if __name__ == "__main__":
    import warnings

    warnings.filterwarnings("ignore")

    for result in run_benchmark():
        _print_table(
            result.title,
            result.runs,
            result.primary_metric,
            result.class_counts,
        )

    print(f"\n{'━' * 74}\n")
