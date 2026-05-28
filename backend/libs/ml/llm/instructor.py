"""Convenience helpers for structured, schema-constrained queries."""

from __future__ import annotations

import logging
from typing import TypeVar

from pydantic import BaseModel

from libs.ml.tracing import TRACE

from .client import LLMClient, LLMMessage
from .structured import structured_completion

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger(__name__)


def instructor_query(
    client: LLMClient,
    query: str,
    schema: type[T],
    *,
    model: str | None = None,
    retries: int = 2,
) -> T:
    """Run a single user query and coerce the answer into ``schema``."""

    logger.info("instructor_query schema=%s model=%s", schema.__name__, model)
    TRACE.kv(
        "INSTRUCTOR QUERY",
        [
            ("schema", schema.__name__),
            ("model", model),
            ("retries", retries),
        ],
        style="magenta",
    )
    result = structured_completion(
        client,
        [LLMMessage(role="user", content=query)],
        schema,
        model=model,
        retries=retries,
    )
    logger.debug("output:\n%s", result.model_dump_json(indent=2))
    return result
