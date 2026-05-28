"""Sentence-transformer based text vectorizer."""

from __future__ import annotations

import numpy as np


class SentenceTransformerVectorizer:
    """Feature extractor using sentence-transformer embeddings (lazy-loaded).

    Produces dense ``numpy`` arrays compatible with any sklearn estimator.
    The underlying model is pre-trained, so ``fit()`` is a no-op beyond
    loading the model into memory; only ``transform()`` matters at
    inference time.
    """

    expects_json_dict = False

    def __init__(
        self,
        model_name: str = "paraphrase-multilingual-MiniLM-L12-v2",
        *,
        batch_size: int = 32,
        normalize_embeddings: bool = True,
        device: str | None = None,
    ) -> None:
        self.model_name = model_name
        self.batch_size = batch_size
        self.normalize_embeddings = normalize_embeddings
        self.device = device
        self._model = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        if self._model is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers is required for SentenceTransformerVectorizer. "
                "Install it with: pip install sentence-transformers"
            ) from exc
        kwargs: dict = {}
        if self.device is not None:
            kwargs["device"] = self.device
        self._model = SentenceTransformer(self.model_name, **kwargs)

    # ------------------------------------------------------------------
    # Public sklearn-compatible API
    # ------------------------------------------------------------------

    def fit(self, texts, y=None) -> "SentenceTransformerVectorizer":
        """No-op for pre-trained models; loads the model into memory."""
        self._load_model()
        return self

    def transform(self, texts) -> np.ndarray:
        """Encode *texts* into a dense embedding matrix."""
        self._load_model()
        embeddings = self._model.encode(
            list(texts),
            batch_size=self.batch_size,
            normalize_embeddings=self.normalize_embeddings,
            show_progress_bar=False,
        )
        return np.array(embeddings)

    def fit_transform(self, texts, y=None) -> np.ndarray:
        """Fit (no-op) then transform."""
        self.fit(texts, y)
        return self.transform(texts)
