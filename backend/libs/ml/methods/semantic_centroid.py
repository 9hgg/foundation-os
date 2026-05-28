"""Semantic-centroid classifiers."""

from __future__ import annotations

import json
import logging
import math
import random
import re
from collections import defaultdict
from collections.abc import Callable, Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from libs.ml.llm import EmbeddingClient, LLMClient, LLMMessage, structured_completion
from libs.ml.metrics import f1_score
from libs.ml.models import (
    ClassificationPrediction,
    JsonInput,
    Label,
    TrainableClassifier,
)
from libs.utils.types import BaseModelWithConfig

logger = logging.getLogger(__name__)


class SemanticCentroidDescription(BaseModelWithConfig):
    """Human-readable description of one semantic subgroup inside a class."""

    name: str = Field(
        min_length=1,
        description="Short name for the semantic subgroup, without class ids or label names.",
    )
    description: str = Field(
        min_length=1,
        description="Discriminative semantic description of the subgroup.",
    )
    examples: list[str] = Field(
        min_length=1,
        description=(
            "Short rewritten prototype snippets that preserve the ideas and vocabulary "
            "of the inputs without copying full samples or referring to input numbers."
        ),
    )

    @field_validator("examples")
    @classmethod
    def _examples_must_be_semantic_prototypes(cls, examples: list[str]) -> list[str]:
        bad_refs = [
            example
            for example in examples
            if re.fullmatch(
                r"\s*(example|sample)\s+\d+\s*", example, flags=re.IGNORECASE
            )
        ]
        if bad_refs:
            raise ValueError(
                "examples must be rewritten semantic prototypes, not references such as 'Example 2'"
            )
        return examples


class SemanticCentroidSet(BaseModel):
    """Centroid descriptions discovered for one internal target class."""

    model_config = ConfigDict(extra="forbid")

    centroids: list[SemanticCentroidDescription] = Field(min_length=1)


class FittedSemanticCentroid(BaseModel):
    """A fitted semantic centroid and its embedding."""

    label_id: str
    name: str
    description: str
    examples: list[str]
    embedding: list[float]


def _json_text(input_: JsonInput) -> str:
    return json.dumps(
        input_.json_value, ensure_ascii=False, sort_keys=True, default=str
    )


def _centroid_text(centroid: SemanticCentroidDescription) -> str:
    examples = "\n".join(f"- {example}" for example in centroid.examples)
    return (
        f"Centroid: {centroid.name}\n"
        f"Description: {centroid.description}\n"
        f"Examples:\n{examples}"
    )


def _cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _identity_text(text: str) -> str:
    return text


class SemanticCentroidJsonClassifier(TrainableClassifier[JsonInput]):
    """Classify JSON samples by nearest LLM-generated semantic centroid."""

    def __init__(
        self,
        *,
        llm_client: LLMClient,
        embedding_client: EmbeddingClient,
        clustering_model: str | None = None,
        embedding_model: str = "nomic-embed-text",
        max_samples_per_label: int = 100,
        max_centroids_per_label: int = 8,
        refinement_iterations: int = 0,
        max_refinement_samples_per_label: int = 20,
        embedding_batch_size: int = 32,
        distance: Literal["cosine"] = "cosine",
        # Scoring: how per-label scores are derived from individual centroid scores.
        # "max"  — label score = best matching centroid (default).
        # "mean" — label score = average over all its centroids; penalises labels
        #           whose centroids cluster redundantly around one sample.
        label_score_aggregation: Literal["max", "mean"] = "max",
        # Contrast: number of counter-examples from OTHER classes to include in the
        # centroid-generation prompt so the LLM writes discriminative descriptions.
        contrast_examples_per_other_label: int = 2,
        # Orthogonality: centroids with cosine similarity > this threshold to any
        # centroid from another label are pruned after embedding (1.0 = disabled).
        cross_label_similarity_threshold: float = 1.0,
        enrich: Callable[[str], str] | None = None,
        seed: int = 42,
    ) -> None:
        if distance != "cosine":
            raise ValueError("Only cosine distance is currently supported.")
        self.llm_client = llm_client
        logger.info(
            "[centroid] init  llm_model=%r  embedding_model=%r  "
            "max_centroids=%d  refinement_iterations=%d  "
            "aggregation=%r  contrast=%d  cross_sim_threshold=%.2f",
            clustering_model, embedding_model, max_centroids_per_label,
            refinement_iterations, label_score_aggregation,
            contrast_examples_per_other_label, cross_label_similarity_threshold,
        )
        self.embedding_client = embedding_client
        self.clustering_model = clustering_model
        self.embedding_model = embedding_model
        self.max_samples_per_label = max_samples_per_label
        self.max_centroids_per_label = max_centroids_per_label
        self.refinement_iterations = refinement_iterations
        self.max_refinement_samples_per_label = max_refinement_samples_per_label
        self.embedding_batch_size = embedding_batch_size
        self.distance = distance
        self.label_score_aggregation = label_score_aggregation
        self.contrast_examples_per_other_label = contrast_examples_per_other_label
        self.cross_label_similarity_threshold = cross_label_similarity_threshold
        self.enrich = enrich or _identity_text
        self.seed = seed
        self.centroids_: list[FittedSemanticCentroid] = []
        self.descriptions_: dict[str, list[SemanticCentroidDescription]] = {}
        self.refinement_history_: list[dict[str, object]] = []
        self._embedding_cache: dict[str, list[float]] = {}

    def _fit(self, inputs: list[JsonInput], targets: list[Label]) -> None:
        enriched = [self.enrich(_json_text(inp)) for inp in inputs]

        grouped: dict[str, list[str]] = defaultdict(list)
        for text, target in zip(enriched, targets, strict=True):
            grouped[target.id].append(text)

        logger.info(
            "[centroid] fit  %d samples  %d labels: %s",
            len(inputs), len(grouped), sorted(grouped),
        )

        rng = random.Random(self.seed)
        descriptions = self._build_initial_descriptions(grouped, rng)

        logger.info("[centroid] embedding %d centroids…", sum(len(v) for v in descriptions.values()))
        self._set_descriptions(descriptions)
        logger.info("[centroid] initial centroids embedded  total=%d", len(self.centroids_))

        if self.cross_label_similarity_threshold < 1.0:
            self._prune_cross_label_similar_centroids()

        self.refinement_history_ = []
        if self.refinement_iterations:
            self._run_refinement(enriched, targets, descriptions, rng)

        logger.info("[centroid] fit complete  centroids=%d", len(self.centroids_))

    def _build_initial_descriptions(
        self,
        grouped: dict[str, list[str]],
        rng: random.Random,
    ) -> dict[str, list[SemanticCentroidDescription]]:
        descriptions: dict[str, list[SemanticCentroidDescription]] = {}
        n_labels = len(grouped)
        logger.info(
            "[centroid] building initial descriptions for %d labels",
            n_labels,
        )
        # Pre-shuffle all label samples once
        shuffled: dict[str, list[str]] = {}
        for lid, samples in grouped.items():
            s = list(samples)
            rng.shuffle(s)
            shuffled[lid] = s

        for idx, label_id in enumerate(sorted(grouped), start=1):
            sampled = shuffled[label_id][: self.max_samples_per_label]

            # Collect contrast examples from other labels
            contrast: list[str] = []
            if self.contrast_examples_per_other_label > 0:
                for other_id, other_samples in shuffled.items():
                    if other_id != label_id:
                        contrast.extend(other_samples[: self.contrast_examples_per_other_label])
                rng.shuffle(contrast)

            logger.info(
                "[centroid] (%d/%d) generating centroids for label=%r  "
                "samples=%d  contrast_examples=%d",
                idx, n_labels, label_id, len(sampled), len(contrast),
            )
            descriptions[label_id] = self._generate_centroids(sampled, contrast_examples=contrast)
            logger.info(
                "[centroid] (%d/%d) label=%r  → %d centroids: %s",
                idx, n_labels, label_id, len(descriptions[label_id]),
                [c.name for c in descriptions[label_id]],
            )
            logger.info(
                "[centroid] initial descriptions progress %d/%d",
                idx,
                n_labels,
            )
        return descriptions

    def _run_refinement(
        self,
        enriched: list[str],
        targets: list[Label],
        descriptions: dict[str, list[SemanticCentroidDescription]],
        rng: random.Random,
    ) -> None:
        target_ids = [t.id for t in targets]
        for iteration in range(self.refinement_iterations):
            logger.info(
                "[centroid] refinement %d/%d — classifying %d training samples…",
                iteration + 1, self.refinement_iterations, len(enriched),
            )
            predictions = self._classify_from_enriched(enriched)
            predicted_ids = [p.label_id or "" for p in predictions]
            before_score = f1_score(target_ids, predicted_ids, average="macro")

            misses: dict[str, list[str]] = defaultdict(list)
            for text, tgt, pred in zip(enriched, targets, predictions, strict=True):
                if pred.label_id != tgt.id:
                    misses[tgt.id].append(text)

            miss_summary = {lid: len(s) for lid, s in sorted(misses.items())}
            logger.info(
                "[centroid] refinement %d  macro_f1_before=%.4f  misses=%s",
                iteration + 1, before_score, miss_summary,
            )
            history_entry: dict[str, object] = {
                "iteration": iteration + 1,
                "macro_f1_before": before_score,
                "misses": miss_summary,
                "accepted": False,
            }

            if not misses:
                logger.info("[centroid] refinement %d — no misses, stopping early", iteration + 1)
                history_entry["macro_f1_after"] = before_score
                self.refinement_history_.append(history_entry)
                break

            previous = {lid: list(cs) for lid, cs in descriptions.items()}
            changed = self._add_refinement_centroids(descriptions, misses, rng, iteration + 1)

            if not changed:
                logger.info("[centroid] refinement %d — no changes, stopping", iteration + 1)
                history_entry["macro_f1_after"] = before_score
                self.refinement_history_.append(history_entry)
                break

            logger.info("[centroid] refinement %d — re-embedding updated centroids…", iteration + 1)
            self._set_descriptions(descriptions)
            after_score = f1_score(target_ids, [p.label_id or "" for p in self._classify_from_enriched(enriched)], average="macro")
            history_entry["macro_f1_after"] = after_score

            if after_score + 1e-12 < before_score:
                logger.info(
                    "[centroid] refinement %d  macro_f1 degraded (%.4f → %.4f) — rolling back",
                    iteration + 1, before_score, after_score,
                )
                descriptions.clear()
                descriptions.update(previous)
                self._set_descriptions(descriptions)
                self.refinement_history_.append(history_entry)
                break

            logger.info(
                "[centroid] refinement %d  accepted  macro_f1: %.4f → %.4f",
                iteration + 1, before_score, after_score,
            )
            history_entry["accepted"] = True
            self.refinement_history_.append(history_entry)

    def _add_refinement_centroids(
        self,
        descriptions: dict[str, list[SemanticCentroidDescription]],
        misses: dict[str, list[str]],
        rng: random.Random,
        iteration: int,
    ) -> bool:
        changed = False
        for label_id, samples in sorted(misses.items()):
            remaining = self.max_centroids_per_label - len(descriptions.get(label_id, []))
            if remaining <= 0:
                logger.debug("[centroid] label=%r at centroid cap (%d), skipping", label_id, self.max_centroids_per_label)
                continue
            rng.shuffle(samples)
            sampled = samples[: self.max_refinement_samples_per_label]
            logger.info(
                "[centroid] refinement %d  label=%r  requesting up to %d centroids from %d missed samples",
                iteration, label_id, remaining, len(sampled),
            )
            additions = self._generate_refinement_centroids(
                missed_samples=sampled,
                existing_centroids=descriptions.get(label_id, []),
                max_new_centroids=remaining,
            )
            if additions:
                logger.info(
                    "[centroid] refinement %d  label=%r  added %d centroids: %s",
                    iteration, label_id, len(additions), [c.name for c in additions],
                )
                descriptions.setdefault(label_id, []).extend(additions[:remaining])
                changed = True
            else:
                logger.info("[centroid] refinement %d  label=%r  no new centroids", iteration, label_id)
        return changed

    def _classify(self, inputs: list[JsonInput]) -> list[ClassificationPrediction]:
        if not self.centroids_:
            msg = "SemanticCentroidJsonClassifier must be fitted before classify()."
            raise RuntimeError(msg)
        enriched = [self.enrich(_json_text(inp)) for inp in inputs]
        return self._classify_from_enriched(enriched)

    def _classify_from_enriched(self, enriched: list[str]) -> list[ClassificationPrediction]:
        """Core classification on already-enriched texts — no enrich call here."""
        embeddings = self._embed_texts(enriched)
        predictions: list[ClassificationPrediction] = []

        # Group centroid indices by label for aggregation
        label_centroid_idx: dict[str, list[int]] = defaultdict(list)
        for i, c in enumerate(self.centroids_):
            label_centroid_idx[c.label_id].append(i)

        for embedding in embeddings:
            centroid_scores = [
                _cosine_similarity(embedding, c.embedding)
                for c in self.centroids_
            ]

            # Per-label score: max or mean over all of a label's centroids
            label_scores: dict[str, float] = {}
            for label_id, indices in label_centroid_idx.items():
                scores = [centroid_scores[i] for i in indices]
                label_scores[label_id] = (
                    max(scores) if self.label_score_aggregation == "max"
                    else sum(scores) / len(scores)
                )

            best_label = max(label_scores, key=lambda lid: label_scores[lid])

            # Best individual centroid within the winning label
            best_idx = max(
                label_centroid_idx[best_label],
                key=lambda i: centroid_scores[i],
            )
            best_centroid = self.centroids_[best_idx]

            all_centroid_info = sorted(
                [
                    {"label_id": self.centroids_[i].label_id, "name": self.centroids_[i].name, "score": centroid_scores[i]}
                    for i in range(len(self.centroids_))
                ],
                key=lambda r: r["score"],
                reverse=True,
            )
            predictions.append(
                ClassificationPrediction(
                    label_id=best_centroid.label_id,
                    score=float(label_scores[best_label]),
                    metadata={
                        "centroid_name": best_centroid.name,
                        "centroid_description": best_centroid.description,
                        "centroid_examples": best_centroid.examples,
                        "label_scores": dict(sorted(label_scores.items(), key=lambda x: x[1], reverse=True)),
                        "centroid_scores": all_centroid_info,
                    },
                )
            )
        return predictions

    def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        missing = [text for text in texts if text not in self._embedding_cache]
        for start in range(0, len(missing), self.embedding_batch_size):
            batch = missing[start : start + self.embedding_batch_size]
            response = self.embedding_client.embed(batch, model=self.embedding_model)
            for text, embedding in zip(batch, response.embeddings, strict=True):
                self._embedding_cache[text] = embedding
        return [self._embedding_cache[text] for text in texts]

    def _set_descriptions(
        self,
        descriptions: dict[str, list[SemanticCentroidDescription]],
    ) -> None:
        centroid_texts: list[str] = []
        centroid_refs: list[tuple[str, SemanticCentroidDescription]] = []
        for label_id in sorted(descriptions):
            for centroid in descriptions[label_id][: self.max_centroids_per_label]:
                centroid_refs.append((label_id, centroid))
                centroid_texts.append(self.enrich(_centroid_text(centroid)))

        embeddings = self._embed_texts(centroid_texts)
        self.descriptions_ = {
            label_id: centroids[: self.max_centroids_per_label]
            for label_id, centroids in descriptions.items()
        }
        self.centroids_ = [
            FittedSemanticCentroid(
                label_id=label_id,
                name=centroid.name,
                description=centroid.description,
                examples=centroid.examples,
                embedding=embedding,
            )
            for (label_id, centroid), embedding in zip(
                centroid_refs, embeddings, strict=True
            )
        ]

    def _generate_centroids(
        self,
        samples: list[str],
        contrast_examples: list[str] | None = None,
    ) -> list[SemanticCentroidDescription]:
        response = structured_completion(
            self.llm_client,
            self._centroid_prompt(samples, contrast_examples=contrast_examples or []),
            SemanticCentroidSet,
            model=self.clustering_model,
            temperature=0.0,
        )
        return response.centroids[: self.max_centroids_per_label]

    def _generate_refinement_centroids(
        self,
        *,
        missed_samples: list[str],
        existing_centroids: list[SemanticCentroidDescription],
        max_new_centroids: int,
    ) -> list[SemanticCentroidDescription]:
        response = structured_completion(
            self.llm_client,
            self._refinement_prompt(
                missed_samples=missed_samples,
                existing_centroids=existing_centroids,
                max_new_centroids=max_new_centroids,
            ),
            SemanticCentroidSet,
            model=self.clustering_model,
            temperature=0.0,
        )
        existing_names = {
            centroid.name.strip().lower() for centroid in existing_centroids
        }
        return [
            centroid
            for centroid in response.centroids
            if centroid.name.strip().lower() not in existing_names
        ][:max_new_centroids]

    def _centroid_prompt(
        self,
        examples: list[str],
        contrast_examples: list[str] | None = None,
    ) -> list[LLMMessage]:
        rendered_examples = "\n\n".join(
            f"Example {i + 1}:\n{example}" for i, example in enumerate(examples)
        )
        contrast_block = ""
        if contrast_examples:
            rendered_contrast = "\n\n".join(
                f"Counter-example {i + 1}:\n{ex[:4000]}"
                for i, ex in enumerate(contrast_examples)
            )
            contrast_block = (
                "\n\nFor reference, the following examples belong to OTHER classes. "
                "Your centroids must NOT match them — use them to make your descriptions "
                "more discriminative:\n\n"
                f"{rendered_contrast}"
            )
        return [
            LLMMessage(
                role="system",
                content=(
                    "You group same-class samples into compact, discriminative "
                    "semantic centroid descriptions. Return only the requested JSON. "
                    "The domain can be anything: maintenance events, reviews, recipes, "
                    "game feedback, support tickets, or another text classification task."
                ),
            ),
            LLMMessage(
                role="user",
                content=(
                    "All examples below belong to the same internal target class. "
                    "You do not need to name or infer that class.\n"
                    f"Create at most {self.max_centroids_per_label} semantic sub-reasons "
                    "that explain recurring reasons why these samples belong together. "
                    "Keep descriptions short, specific, and useful for nearest-centroid "
                    "classification.\n\n"
                    "For each centroid, examples must be rewritten prototype snippets: "
                    "short paraphrases with the same semantic ideas and important words. "
                    "Do not copy full input samples verbatim. Do not write references like "
                    "'Example 2' or 'Sample 4'.\n\n"
                    "IMPORTANT: write all centroid names, descriptions, and example snippets "
                    "in the same language as the input examples below. "
                    "Do not translate.\n\n"
                    f"{rendered_examples}"
                    f"{contrast_block}"
                ),
            ),
        ]

    def _prune_cross_label_similar_centroids(self) -> None:
        """Remove centroids that are too similar to centroids from other labels.

        A centroid whose cosine similarity to any other-label centroid exceeds
        ``cross_label_similarity_threshold`` is not discriminative and is dropped.
        At least one centroid per label is always kept (the least cross-label-similar).
        Modifies ``self.centroids_`` and ``self.descriptions_`` in place.
        """
        threshold = self.cross_label_similarity_threshold
        by_label: dict[str, list[FittedSemanticCentroid]] = defaultdict(list)
        for c in self.centroids_:
            by_label[c.label_id].append(c)

        kept_centroids: list[FittedSemanticCentroid] = []
        kept_descriptions: dict[str, list[SemanticCentroidDescription]] = {}
        total_pruned = 0

        for label_id, own_centroids in sorted(by_label.items()):
            other_embeddings = [
                c.embedding
                for lid, cs in by_label.items()
                if lid != label_id
                for c in cs
            ]
            scored: list[tuple[FittedSemanticCentroid, float]] = []
            for c in own_centroids:
                max_cross = max(
                    (_cosine_similarity(c.embedding, o) for o in other_embeddings),
                    default=0.0,
                )
                scored.append((c, max_cross))

            kept = [(c, s) for c, s in scored if s < threshold]
            pruned = [(c, s) for c, s in scored if s >= threshold]

            if pruned:
                logger.info(
                    "[centroid] pruning %d/%d centroids for label=%r (cross_sim >= %.2f): %s",
                    len(pruned), len(scored), label_id, threshold,
                    [(c.name, round(s, 3)) for c, s in pruned],
                )
                total_pruned += len(pruned)

            # Always keep at least one — the one least similar to other labels
            if not kept:
                least_similar = min(scored, key=lambda x: x[1])
                logger.info(
                    "[centroid] keeping fallback centroid for label=%r: %r (cross_sim=%.3f)",
                    label_id, least_similar[0].name, least_similar[1],
                )
                kept = [least_similar]

            kept_centroids.extend(c for c, _ in kept)
            kept_descriptions[label_id] = [
                SemanticCentroidDescription(
                    name=c.name, description=c.description, examples=c.examples
                )
                for c, _ in kept
            ]

        self.centroids_ = kept_centroids
        self.descriptions_ = kept_descriptions
        logger.info(
            "[centroid] pruning complete  removed=%d  remaining=%d",
            total_pruned, len(self.centroids_),
        )

    def _refinement_prompt(
        self,
        *,
        missed_samples: list[str],
        existing_centroids: list[SemanticCentroidDescription],
        max_new_centroids: int,
    ) -> list[LLMMessage]:
        rendered_centroids = "\n".join(
            f"- {centroid.name}: {centroid.description}"
            for centroid in existing_centroids
        )
        rendered_misses = "\n\n".join(
            f"Missed sample {i + 1}:\n{sample}"
            for i, sample in enumerate(missed_samples)
        )
        return [
            LLMMessage(
                role="system",
                content=(
                    "You refine semantic centroids for a classifier. Return only "
                    "new centroid descriptions that explain missed same-class samples. "
                    "The domain is arbitrary; do not assume a specific business domain."
                ),
            ),
            LLMMessage(
                role="user",
                content=(
                    f"Existing centroids for this internal target class:\n"
                    f"{rendered_centroids or '- none'}\n\n"
                    "The current centroid classifier misclassified these samples, "
                    "but they all belong to this same internal target class. Create at most "
                    f"{max_new_centroids} additional centroids or improved example "
                    "groups that cover the missed samples without duplicating existing "
                    "centroids.\n\n"
                    "For each centroid, examples must be rewritten prototype snippets: "
                    "short paraphrases with the same semantic ideas and important words. "
                    "Do not copy full input samples verbatim. Do not write references like "
                    "'Example 2' or 'Sample 4'.\n\n"
                    "IMPORTANT: write all centroid names, descriptions, and example snippets "
                    "in the same language as the missed samples below. "
                    "Do not translate.\n\n"
                    f"{rendered_misses}"
                ),
            ),
        ]


__all__ = [
    "FittedSemanticCentroid",
    "SemanticCentroidDescription",
    "SemanticCentroidJsonClassifier",
    "SemanticCentroidSet",
]
