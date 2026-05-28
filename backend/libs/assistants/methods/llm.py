"""Sync LLM client for the assistants lib, built on the ml.llm.LLMClient protocol."""

from libs.logger.customLogger import print_color
from libs.ml.llm import LLMClient, OllamaLLMClient, OpenAILLMClient

from ..config import ASSISTANTS_SETTINGS

__all__ = ["OllamaLLMClient", "OpenAILLMClient", "get_llm_client"]


def get_llm_client() -> LLMClient:
    """Create an ``LLMClient`` from the current assistant configuration."""
    client = OpenAILLMClient(
        model="gpt-4.1-mini",
        timeout_seconds=ASSISTANTS_SETTINGS.ASSISTANT_LLM_TIMEOUT,
    )
    print_color("magenta", f"[assistant] LLM: {client.model} @ {client.base_url}")
    return client
