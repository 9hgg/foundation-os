import json
import math
import pickle
import re
from collections.abc import Sequence

import pytest

from libs.ml.llm import EmbeddingResponse, LLMMessage, LLMResponse
from libs.ml.methods.semantic_centroid import (
    SemanticCentroidDescription,
    SemanticCentroidJsonClassifier,
)
from libs.ml.models import JsonInput, Label


class _FakeCentroidLLMClient:
    def __init__(self) -> None:
        self._initial_calls = 0

    def complete(
        self,
        messages: Sequence[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        prompt = "\n".join(message.content for message in messages)
        if "misclassified these samples" in prompt:
            centroids = [
                {
                    "name": "rare A",
                    "description": "A examples that express the rare concept.",
                    "examples": ["rare"],
                }
            ]
        elif self._initial_calls == 0:
            self._initial_calls += 1
            centroids = [
                {
                    "name": "common A",
                    "description": "A examples that express the alpha concept.",
                    "examples": ["alpha"],
                }
            ]
        else:
            self._initial_calls += 1
            centroids = [
                {
                    "name": "common B",
                    "description": "B examples that express beta and rare concepts.",
                    "examples": ["beta rare"],
                }
            ]
        return LLMResponse(
            text=json.dumps({"centroids": centroids}),
            model="fake",
        )


class _ConceptEmbeddingClient:
    _CONCEPTS = ["alpha", "beta", "rare"]

    def embed(
        self,
        texts: Sequence[str],
        *,
        model: str | None = None,
    ) -> EmbeddingResponse:
        return EmbeddingResponse(
            embeddings=[self._embed_one(text) for text in texts],
            model=model or "fake-embedding",
        )

    def _embed_one(self, text: str) -> list[float]:
        tokens = set(re.findall(r"[a-z]+", text.lower()))
        vector = [1.0 if concept in tokens else 0.0 for concept in self._CONCEPTS]
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector


class _RecordingEmbeddingClient:
    def __init__(self) -> None:
        self.texts: list[str] = []

    def embed(
        self,
        texts: Sequence[str],
        *,
        model: str | None = None,
    ) -> EmbeddingResponse:
        self.texts.extend(texts)
        return EmbeddingResponse(
            embeddings=[[1.0] for _text in texts],
            model=model or "recording-embedding",
        )


class _LengthCheckingEmbeddingClient:
    def __init__(self, max_chars: int) -> None:
        self.max_chars = max_chars

    def embed(
        self,
        texts: Sequence[str],
        *,
        model: str | None = None,
    ) -> EmbeddingResponse:
        too_long = [len(text) for text in texts if len(text) > self.max_chars]
        if too_long:
            raise AssertionError(f"embedding text too long: {too_long}")
        return EmbeddingResponse(
            embeddings=[[1.0] for _text in texts],
            model=model or "length-checking-embedding",
        )


class _LongThenShortCentroidLLMClient:
    def __init__(self) -> None:
        self.length_feedback_count = 0

    def complete(
        self,
        messages: Sequence[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        prompt = "\n".join(message.content for message in messages)
        if "too long for the embedding model" in prompt:
            self.length_feedback_count += 1
            description = "short centroid"
            examples = ["short"]
        else:
            description = "x" * 300
            examples = ["y" * 300]
        return LLMResponse(
            text=json.dumps(
                {
                    "centroids": [
                        {
                            "name": "length test",
                            "description": description,
                            "examples": examples,
                        }
                    ]
                }
            ),
            model="fake",
        )


def _inputs() -> list[JsonInput]:
    return [
        JsonInput(json_value=json.dumps({"text": "rare"})),
        JsonInput(json_value=json.dumps({"text": "beta"})),
    ]


def _targets() -> list[Label]:
    return [Label(id="A", name="A"), Label(id="B", name="B")]


def test_semantic_centroid_refinement_adds_centroid_for_training_miss() -> None:
    classifier = SemanticCentroidJsonClassifier(
        llm_client=_FakeCentroidLLMClient(),
        embedding_client=_ConceptEmbeddingClient(),
        max_centroids_per_label=2,
        refinement_iterations=1,
    )

    classifier.fit(_inputs(), _targets())

    assert classifier.refinement_history_[0]["accepted"] is True
    assert any(centroid.name == "rare A" for centroid in classifier.centroids_)
    assert [prediction.label_id for prediction in classifier.classify(_inputs())] == ["A", "B"]


def test_semantic_centroid_without_refinement_keeps_initial_centroids() -> None:
    classifier = SemanticCentroidJsonClassifier(
        llm_client=_FakeCentroidLLMClient(),
        embedding_client=_ConceptEmbeddingClient(),
        max_centroids_per_label=2,
        refinement_iterations=0,
    )

    classifier.fit(_inputs(), _targets())

    assert not any(centroid.name == "rare A" for centroid in classifier.centroids_)
    assert [prediction.label_id for prediction in classifier.classify(_inputs())] == ["B", "B"]


def test_semantic_centroid_classifier_is_picklable_after_fit() -> None:
    classifier = SemanticCentroidJsonClassifier(
        llm_client=_FakeCentroidLLMClient(),
        embedding_client=_ConceptEmbeddingClient(),
        max_centroids_per_label=2,
        refinement_iterations=0,
    )

    classifier.fit(_inputs(), _targets())

    raw_classifier = pickle.dumps(classifier)
    restored_classifier = pickle.loads(raw_classifier)

    assert [prediction.label_id for prediction in restored_classifier.classify(_inputs())] == ["B", "B"]


def test_semantic_centroid_examples_must_be_rewritten_prototypes() -> None:
    with pytest.raises(ValueError, match="rewritten semantic prototypes"):
        SemanticCentroidDescription(
            name="bad centroid",
            description="This centroid only refers back to numbered inputs.",
            examples=["Example 2"],
        )


def test_semantic_centroid_cleans_and_truncates_candidate_embeddings() -> None:
    embedding_client = _RecordingEmbeddingClient()
    classifier = SemanticCentroidJsonClassifier(
        llm_client=_FakeCentroidLLMClient(),
        embedding_client=embedding_client,
        max_embedding_chars=20,
    )

    classifier._embed_candidate_texts(["abc////déf!!! " * 10])

    assert len(embedding_client.texts) == 1
    assert len(embedding_client.texts[0]) <= 20
    assert not re.search(r"[^\w\s]", embedding_client.texts[0], flags=re.UNICODE)


def test_semantic_centroid_regenerates_centroids_that_are_too_long() -> None:
    llm_client = _LongThenShortCentroidLLMClient()
    classifier = SemanticCentroidJsonClassifier(
        llm_client=llm_client,
        embedding_client=_LengthCheckingEmbeddingClient(max_chars=80),
        max_embedding_chars=80,
        max_samples_per_label=1,
        max_centroids_per_label=1,
    )

    classifier.fit(_inputs(), _targets())

    assert llm_client.length_feedback_count >= 1
    assert all(len(centroid.description) < 80 for centroid in classifier.centroids_)
