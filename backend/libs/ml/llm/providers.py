"""Concrete synchronous LLM transport clients implementing the LLMClient protocol."""

import http.client
import json
import logging
import os
import ssl
from dataclasses import dataclass
from urllib import error, parse

from .client import (
    EmbeddingClient,
    EmbeddingResponse,
    LLMClient,
    LLMConfigurationError,
    LLMEmptyResponseError,
    LLMMessage,
    LLMResponse,
    LLMTokenUsage,
    estimate_messages_token_count,
    estimate_token_count,
    record_llm_token_usage,
)

logger = logging.getLogger(__name__)


def _normalize_ollama_usage(
    raw_payload: dict, messages: list[LLMMessage], content: str
) -> LLMTokenUsage:
    prompt_tokens = int(
        raw_payload.get("prompt_eval_count") or estimate_messages_token_count(messages)
    )
    completion_tokens = int(
        raw_payload.get("eval_count") or estimate_token_count(content)
    )
    return LLMTokenUsage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=prompt_tokens + completion_tokens,
    )


def _normalize_openai_usage(
    raw_payload: dict, messages: list[LLMMessage], content: str
) -> LLMTokenUsage:
    usage = raw_payload.get("usage") or {}
    prompt_tokens = int(
        usage.get("prompt_tokens") or estimate_messages_token_count(messages)
    )
    completion_tokens = int(
        usage.get("completion_tokens") or estimate_token_count(content)
    )
    total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
    return LLMTokenUsage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
    )


@dataclass
class OllamaLLMClient(LLMClient):
    """Synchronous Ollama chat client implementing the ``LLMClient`` protocol."""

    model: str = "gemma4:e2b"
    base_url: str = "http://localhost:11434/api/chat"
    timeout_seconds: float = 120.0

    def complete(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        chosen_model = model if model is not None else self.model
        parsed_url = parse.urlparse(self.base_url)
        connection_cls = (
            http.client.HTTPSConnection
            if parsed_url.scheme == "https"
            else http.client.HTTPConnection
        )
        connection = connection_cls(
            parsed_url.hostname or "localhost",
            parsed_url.port or 11434,
            timeout=self.timeout_seconds,
        )
        payload = {
            "model": chosen_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            "options": {"temperature": temperature},
        }
        logger.info(
            "OLLAMA CHAT REQUEST model=%r messages=%d url=%s",
            chosen_model,
            len(messages),
            self.base_url,
        )
        try:
            connection.request(
                "POST",
                parsed_url.path or "/api/chat",
                body=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )
            response = connection.getresponse()
            raw_payload = json.loads(response.read().decode())
        except (OSError, error.HTTPError, json.JSONDecodeError) as exc:
            raise LLMEmptyResponseError(f"Ollama request failed: {exc}") from exc
        finally:
            connection.close()

        content = (raw_payload.get("message") or {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise LLMEmptyResponseError(
                f"Ollama returned empty content for model {chosen_model!r}"
            )

        normalized = content.strip()
        usage = _normalize_ollama_usage(raw_payload, list(messages), normalized)
        logger.info(
            "OLLAMA CHAT RESPONSE model=%r chars=%d prompt_tokens=%d completion_tokens=%d",
            chosen_model,
            len(normalized),
            usage.prompt_tokens,
            usage.completion_tokens,
        )
        record_llm_token_usage(usage)
        return LLMResponse(
            text=normalized, model=chosen_model, raw=raw_payload, usage=usage
        )

    def check(self) -> None:
        """Check that the client is properly configured and can connect to the provider.

        Raises LLMConfigurationError if configuration is invalid or connectivity fails.
        """
        try:
            self.complete(
                messages=[LLMMessage(role="system", content="Hello, world!")],
                model=self.model,
                temperature=0.0,
            )
        except Exception as exc:
            raise LLMConfigurationError(f"Ollama client check failed: {exc}") from exc


@dataclass
class OllamaEmbeddingClient(EmbeddingClient):
    """Synchronous Ollama embedding client using the ``/api/embed`` endpoint."""

    model: str = "nomic-embed-text"
    base_url: str = "http://localhost:11434/api/embed"
    timeout_seconds: float = 120.0

    def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
    ) -> EmbeddingResponse:
        chosen_model = model if model is not None else self.model
        parsed_url = parse.urlparse(self.base_url)
        connection_cls = (
            http.client.HTTPSConnection
            if parsed_url.scheme == "https"
            else http.client.HTTPConnection
        )
        connection = connection_cls(
            parsed_url.hostname or "localhost",
            parsed_url.port or 11434,
            timeout=self.timeout_seconds,
        )
        payload = {"model": chosen_model, "input": list(texts)}
        logger.info(
            "OLLAMA EMBED REQUEST model=%r texts=%d url=%s",
            chosen_model,
            len(texts),
            self.base_url,
        )
        try:
            connection.request(
                "POST",
                parsed_url.path or "/api/embed",
                body=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )
            response = connection.getresponse()
            raw_payload = json.loads(response.read().decode())
        except (OSError, error.HTTPError, json.JSONDecodeError) as exc:
            raise LLMEmptyResponseError(
                f"Ollama embedding request failed: {exc}"
            ) from exc
        finally:
            connection.close()

        raw_embeddings = raw_payload.get("embeddings") or raw_payload.get("embedding")
        if (
            raw_embeddings
            and raw_embeddings
            and isinstance(raw_embeddings[0], (int, float))
        ):
            raw_embeddings = [raw_embeddings]
        if not isinstance(raw_embeddings, list) or len(raw_embeddings) != len(texts):
            raise LLMEmptyResponseError(
                f"Ollama returned invalid embeddings for model {chosen_model!r}"
            )

        embeddings = [[float(value) for value in row] for row in raw_embeddings]
        dimensions = len(embeddings[0]) if embeddings else 0
        logger.info(
            "OLLAMA EMBED RESPONSE model=%r texts=%d dimensions=%d",
            chosen_model,
            len(embeddings),
            dimensions,
        )
        return EmbeddingResponse(
            embeddings=embeddings, model=chosen_model, raw=raw_payload
        )


@dataclass
class OpenAILLMClient(LLMClient):
    """Synchronous OpenAI-compatible chat client implementing the ``LLMClient`` protocol."""

    model: str = "gpt-5.4-nano"
    base_url: str = "https://api.openai.com/v1/chat/completions"
    api_key_env: str = "OPENAI_API_KEY"
    api_key: str = ""
    timeout_seconds: float = 120.0

    def complete(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        chosen_model = model if model is not None else self.model
        api_key = self.api_key or os.getenv(self.api_key_env, "").strip()
        if not api_key:
            raise LLMConfigurationError(
                f"OpenAI API key is missing. Set environment variable {self.api_key_env!r}."
            )

        parsed_url = parse.urlparse(self.base_url)
        connection = http.client.HTTPSConnection(
            parsed_url.hostname or "api.openai.com",
            parsed_url.port or 443,
            timeout=self.timeout_seconds,
        )
        payload = {
            "model": chosen_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
        }
        try:
            connection.request(
                "POST",
                parsed_url.path or "/v1/chat/completions",
                body=json.dumps(payload).encode(),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            response = connection.getresponse()
            raw_payload = json.loads(response.read().decode())
        except (OSError, error.HTTPError, json.JSONDecodeError) as exc:
            raise LLMEmptyResponseError(f"OpenAI request failed: {exc}") from exc
        finally:
            connection.close()

        choices = raw_payload.get("choices") or []
        content = (choices[0].get("message", {}) if choices else {}).get("content", "")
        if isinstance(content, list):
            content = "".join(
                p.get("text", "")
                for p in content
                if isinstance(p, dict) and p.get("type") == "text"
            )
        if not isinstance(content, str) or not content.strip():
            raise LLMEmptyResponseError(
                f"OpenAI returned empty content for model {chosen_model!r}"
            )

        normalized = content.strip()
        usage = _normalize_openai_usage(raw_payload, list(messages), normalized)
        record_llm_token_usage(usage)
        return LLMResponse(
            text=normalized, model=chosen_model, raw=raw_payload, usage=usage
        )

    def check(self) -> None:
        """Check that the client is properly configured and can connect to the provider.

        Raises LLMConfigurationError if configuration is invalid or connectivity fails.
        """
        try:
            self.complete(
                messages=[LLMMessage(role="system", content="Hello, world!")],
                model=self.model,
                temperature=0.0,
            )
        except Exception as exc:
            raise LLMConfigurationError(f"OpenAI client check failed: {exc}") from exc


POSSIBLE_EDF_IAG_MODELS = {
    "C2-Cloud-Gemini-2.5-Pro",
    "C2-Cloud-Gemini-2.5-Flash",
    "C2-Cloud-Codestral-2501",
    "C2-Cloud-Gemini-Embedding-001",
    "C1-Cloud-Mistral-Large",
    "C1-Cloud-Gemini-2.0-Flash",
}


@dataclass
class EDFIAGLLMClient(LLMClient):
    """Synchronous client for the EDF IAG OpenAI-compatible endpoint."""

    model: str = "C2-Cloud-Gemini-2.5-Pro"
    base_url: str = "https://llm.iag.edf.fr/v1/"
    api_key: str | None = None
    api_key_env: str = "EDF_IAG_API_KEY"
    timeout_seconds: float = 120.0
    verify_ssl: bool = True
    ca_bundle_path: str | None = None

    def complete(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        chosen_model = model if model is not None else self.model

        # check against available list
        if chosen_model not in POSSIBLE_EDF_IAG_MODELS:
            raise LLMEmptyResponseError(
                f"Model {chosen_model!r} is not in the list of possible EDF IAG models from code base: {POSSIBLE_EDF_IAG_MODELS}"
            )

        api_key = (self.api_key or os.getenv(self.api_key_env, "")).strip()
        if not api_key:
            raise LLMEmptyResponseError(
                f"EDF IAG API key is missing (env var {self.api_key_env!r})"
            )

        parsed_url = parse.urlparse(self.base_url)
        request_path = (parsed_url.path or "/v1").rstrip("/") or "/v1"
        if not request_path.endswith("/chat/completions"):
            request_path = f"{request_path}/chat/completions"

        connection_cls = (
            http.client.HTTPSConnection
            if parsed_url.scheme == "https"
            else http.client.HTTPConnection
        )
        connection_kwargs: dict[str, object] = {"timeout": self.timeout_seconds}
        if connection_cls is http.client.HTTPSConnection:
            if self.verify_ssl:
                connection_kwargs["context"] = ssl.create_default_context(
                    cafile=self.ca_bundle_path
                )
            else:
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                connection_kwargs["context"] = context

        connection = connection_cls(
            parsed_url.hostname or "llm.iag.edf.fr",
            parsed_url.port or (443 if parsed_url.scheme == "https" else 80),
            **connection_kwargs,
        )
        payload = {
            "model": chosen_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
        }
        try:
            connection.request(
                "POST",
                request_path,
                body=json.dumps(payload).encode(),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            response = connection.getresponse()
            raw_payload = json.loads(response.read().decode())
        except (OSError, error.HTTPError, json.JSONDecodeError) as exc:
            raise LLMEmptyResponseError(f"EDF IAG request failed: {exc}") from exc
        finally:
            connection.close()

        choices = raw_payload.get("choices") or []
        content = (choices[0].get("message", {}) if choices else {}).get("content", "")
        if isinstance(content, list):
            content = "".join(
                p.get("text", "")
                for p in content
                if isinstance(p, dict) and p.get("type") == "text"
            )
        if not isinstance(content, str) or not content.strip():
            raise LLMEmptyResponseError(
                f"EDF IAG returned empty content for model {chosen_model!r}"
            )

        normalized = content.strip()
        usage = _normalize_openai_usage(raw_payload, list(messages), normalized)
        record_llm_token_usage(usage)
        return LLMResponse(
            text=normalized, model=chosen_model, raw=raw_payload, usage=usage
        )

    def check(self) -> None:
        """Check that the client is properly configured and can connect to the provider.

        Raises LLMConfigurationError if configuration is invalid or connectivity fails.
        """
        try:
            self.complete(
                messages=[LLMMessage(role="system", content="Hello, world!")],
                model=self.model,
                temperature=0.0,
            )
        except Exception as exc:
            raise LLMConfigurationError(f"EDF IAG client check failed: {exc}") from exc
