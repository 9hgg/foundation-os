from collections.abc import Mapping, Sequence
from datetime import date, datetime
from typing import Any

import numpy as np
from scipy.sparse import csr_matrix, hstack

from libs.ml.methods.sklearn._base import _to_text

_MISSING_CATEGORY_VALUE = "__missing__"


class StructuredJsonVectorizer:
    """Vectorize JSON dictionaries using per-field typed transformations."""

    expects_json_dict = True

    def __init__(
        self,
        *,
        max_categorical_cardinality: int = 24,
        max_categorical_ratio: float = 0.35,
        max_categorical_avg_length: int = 32,
        text_max_features_per_field: int = 256,
    ) -> None:
        self.max_categorical_cardinality = max_categorical_cardinality
        self.max_categorical_ratio = max_categorical_ratio
        self.max_categorical_avg_length = max_categorical_avg_length
        self.text_max_features_per_field = text_max_features_per_field
        self.field_types_: dict[str, str] = {}
        self.numeric_fields_: list[str] = []
        self.categorical_fields_: list[str] = []
        self.text_fields_: list[str] = []
        self._categorical_vectorizer: Any | None = None
        self._text_vectorizers: dict[str, Any] = {}

    def fit(self, records: list[dict[str, Any]]) -> "StructuredJsonVectorizer":
        from sklearn.feature_extraction import DictVectorizer
        from sklearn.feature_extraction.text import TfidfVectorizer

        flattened = [self._flatten_json_record(record) for record in records]
        all_fields = sorted({key for row in flattened for key in row})

        self.field_types_ = {}
        for field_name in all_fields:
            self.field_types_[field_name] = self._infer_field_type(
                [row.get(field_name) for row in flattened]
            )

        self.numeric_fields_ = sorted(
            [
                field_name
                for field_name, field_type in self.field_types_.items()
                if field_type in {"numerical", "boolean", "datetime"}
            ]
        )
        self.categorical_fields_ = sorted(
            [
                field_name
                for field_name, field_type in self.field_types_.items()
                if field_type == "categorical"
            ]
        )
        self.text_fields_ = sorted(
            [
                field_name
                for field_name, field_type in self.field_types_.items()
                if field_type == "text"
            ]
        )

        self._categorical_vectorizer = DictVectorizer(sparse=True)
        self._categorical_vectorizer.fit(self._categorical_rows(flattened))

        self._text_vectorizers = {}
        for field_name in self.text_fields_:
            corpus = [
                self._normalize_text_value(row.get(field_name))
                for row in flattened
            ]
            if not any(text for text in corpus):
                continue
            vectorizer = TfidfVectorizer(max_features=self.text_max_features_per_field)
            vectorizer.fit(corpus)
            self._text_vectorizers[field_name] = vectorizer

        return self

    def transform(self, records: list[dict[str, Any]]) -> csr_matrix:
        if self._categorical_vectorizer is None:
            raise RuntimeError("StructuredJsonVectorizer must be fitted before transform().")

        flattened = [self._flatten_json_record(record) for record in records]
        matrix_blocks: list[csr_matrix] = []

        if self.numeric_fields_:
            numeric_rows: list[list[float]] = []
            for row in flattened:
                numeric_rows.append(
                    [
                        self._encode_numeric_value(field_name, row.get(field_name))
                        for field_name in self.numeric_fields_
                    ]
                )
            matrix_blocks.append(csr_matrix(np.asarray(numeric_rows, dtype=float)))

        categorical_features = self._categorical_vectorizer.transform(
            self._categorical_rows(flattened)
        )
        if categorical_features.shape[1] > 0:
            matrix_blocks.append(categorical_features.tocsr())

        for field_name in self.text_fields_:
            vectorizer = self._text_vectorizers.get(field_name)
            if vectorizer is None:
                continue
            corpus = [self._normalize_text_value(row.get(field_name)) for row in flattened]
            matrix_blocks.append(vectorizer.transform(corpus).tocsr())

        if not matrix_blocks:
            return csr_matrix((len(records), 1), dtype=float)
        return hstack(matrix_blocks, format="csr")

    def fit_transform(self, records: list[dict[str, Any]], y: Any = None) -> csr_matrix:
        return self.fit(records).transform(records)

    def _categorical_rows(self, rows: list[dict[str, Any]]) -> list[dict[str, str]]:
        categorical_rows: list[dict[str, str]] = []
        for row in rows:
            categorical_row: dict[str, str] = {}
            for field_name in self.categorical_fields_:
                value = row.get(field_name)
                categorical_row[field_name] = (
                    _MISSING_CATEGORY_VALUE if value is None else _to_text(value)
                )
            categorical_rows.append(categorical_row)
        return categorical_rows

    def _encode_numeric_value(self, field_name: str, value: Any) -> float:
        field_type = self.field_types_.get(field_name, "numerical")

        if field_type == "boolean":
            if isinstance(value, bool):
                return 1.0 if value else 0.0
            if isinstance(value, str):
                normalized = value.strip().lower()
                return 1.0 if normalized in {"1", "true", "yes", "y"} else 0.0
            return 1.0 if value else 0.0

        if field_type == "datetime":
            dt_value = self._parse_datetime(value)
            return dt_value.timestamp() if dt_value is not None else 0.0

        if isinstance(value, bool):
            return 1.0 if value else 0.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            with_context = value.replace(",", ".").strip()
            try:
                return float(with_context)
            except ValueError:
                return 0.0
        return 0.0

    def _normalize_text_value(self, value: Any) -> str:
        if value is None:
            return ""
        return _to_text(value)

    def _infer_field_type(self, raw_values: list[Any]) -> str:
        values = [value for value in raw_values if value is not None]
        if not values:
            return "categorical"

        if all(isinstance(value, bool) for value in values):
            return "boolean"

        if all(
            isinstance(value, (int, float)) and not isinstance(value, bool)
            for value in values
        ):
            return "numerical"

        if all(self._parse_datetime(value) is not None for value in values):
            return "datetime"

        if all(isinstance(value, str) for value in values):
            unique_count = len(set(values))
            sample_count = len(values)
            avg_length = sum(len(value) for value in values) / max(1, sample_count)
            unique_ratio = unique_count / max(1, sample_count)
            if (
                unique_count <= self.max_categorical_cardinality
                and avg_length <= self.max_categorical_avg_length
                and (
                    unique_count <= 2
                    or unique_ratio <= self.max_categorical_ratio
                )
            ):
                return "categorical"
            return "text"

        if any(isinstance(value, str) for value in values):
            return "text"

        return "categorical"

    def _parse_datetime(self, value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        if not isinstance(value, str):
            return None

        normalized = value.strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"

        for parser in (
            datetime.fromisoformat,
            lambda item: datetime.strptime(item, "%Y-%m-%d"),
            lambda item: datetime.strptime(item, "%Y/%m/%d"),
            lambda item: datetime.strptime(item, "%d/%m/%Y"),
            lambda item: datetime.strptime(item, "%Y-%m-%d %H:%M:%S"),
        ):
            try:
                return parser(normalized)
            except ValueError:
                continue
        return None

    def _flatten_json_record(self, data: dict[str, Any]) -> dict[str, Any]:
        flattened: dict[str, Any] = {}
        self._flatten(value=data, output=flattened, prefix="")
        return flattened

    def _flatten(self, *, value: Any, output: dict[str, Any], prefix: str) -> None:
        if isinstance(value, Mapping):
            for key, item in value.items():
                key_as_str = _to_text(key)
                next_prefix = f"{prefix}.{key_as_str}" if prefix else key_as_str
                self._flatten(value=item, output=output, prefix=next_prefix)
            return

        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            if not value:
                output[prefix] = None
                return
            for index, item in enumerate(value):
                next_prefix = f"{prefix}[{index}]"
                self._flatten(value=item, output=output, prefix=next_prefix)
            return

        output[prefix] = value
