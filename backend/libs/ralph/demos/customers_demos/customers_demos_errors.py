from libs.ml.llm.client import LLMEmptyResponseError


class DemoOllamaError(RuntimeError):
    """Raised when the demo cannot reach the Ollama server."""


class DemoOllamaUnavailableError(DemoOllamaError):
    """Raised when the local Ollama endpoint cannot be reached."""

    def __init__(self) -> None:
        super().__init__(
            "Could not reach Ollama at http://localhost:11434. "
            "Start it with `ollama serve` and ensure `gemma4:e2b` is available."
        )


class DemoOllamaEmptyResponseError(DemoOllamaError, LLMEmptyResponseError):
    """Raised when Ollama returns an empty chat response."""

    def __init__(self) -> None:
        super().__init__("Ollama returned an empty response for the demo request.")


class DemoOpenAIError(RuntimeError):
    """Raised when the demo cannot reach the OpenAI API."""


class DemoOpenAIUnavailableError(DemoOpenAIError):
    """Raised when the OpenAI chat completions endpoint cannot be reached."""

    def __init__(self) -> None:
        super().__init__(
            "Could not reach the OpenAI chat completions API. "
            "Set OPEN_API_KEY_EXTRACT_TEST and ensure network access is available."
        )


class DemoOpenAIEmptyResponseError(DemoOpenAIError, LLMEmptyResponseError):
    """Raised when OpenAI returns an empty chat response."""

    def __init__(self) -> None:
        super().__init__("OpenAI returned an empty response for the demo request.")
