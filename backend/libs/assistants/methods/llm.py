"""Sync LLM client for the assistants lib, built on the ml.llm.LLMClient protocol."""

import structlog

from libs.ml.llm import LLMClient, OllamaLLMClient, OpenAILLMClient

from ..config import ASSISTANTS_SETTINGS

__all__ = ["OllamaLLMClient", "OpenAILLMClient", "get_llm_client"]

logger = structlog.get_logger(__name__)


def get_llm_client() -> LLMClient:
    """Create an ``LLMClient`` from the current assistant configuration."""
    client = OpenAILLMClient(
        model="gpt-4.1-mini",
        timeout_seconds=ASSISTANTS_SETTINGS.ASSISTANT_LLM_TIMEOUT,
    )
    logger.info("assistant_llm_client_created", model=client.model, base_url=client.base_url)
    return client
