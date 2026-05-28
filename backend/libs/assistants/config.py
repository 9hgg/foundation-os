from pydantic_settings import BaseSettings, SettingsConfigDict


class AssistantsSettings(BaseSettings):
    """Configuration for the Assistants library."""

    # Name displayed when the assistant generates a message
    ASSISTANT_NAME: str = "The Assistant"

    # LLM model to use (Ollama model name)
    ASSISTANT_MODEL: str = "gemma4:e2b"

    # Ollama chat API base URL
    ASSISTANT_OLLAMA_BASE_URL: str = "http://localhost:11434/api/chat"

    # LLM request timeout in seconds
    ASSISTANT_LLM_TIMEOUT: float = 120.0

    # Max planning steps per task run
    ASSISTANT_MAX_ITERATIONS: int = 3

    # Max total MCP tool calls allowed per task run
    ASSISTANT_MAX_TOOL_CALLS: int = 8

    # Max number of planning attempts per task run, including replans after failure
    ASSISTANT_MAX_PLAN_ATTEMPTS: int = 2

    # Number of recent conversation messages (human + assistant, no thinking)
    # included in the judge context window to evaluate the agent's conclusion.
    MAX_NUMBER_OF_MESSAGES_FOR_JUDGE: int = 50

    # MCP server URL used by the assistant to call tools (optional)
    # If empty the assistant will work without MCP tools
    ASSISTANT_MCP_SERVER_URL: str = ""

    # Absolute path to the Angular app.routes.config.ts file used to inject
    # navigable routes into the system prompt.  Leave empty to skip.
    ASSISTANT_FRONTEND_ROUTE_CONFIG_PATH: str = ""

    # Maximum number of characters from one artifact value to expose in prompts before cutoff.
    ASSISTANT_ARTIFACT_PREVIEW_MAX_CHARS: int = 2000

    model_config = SettingsConfigDict(case_sensitive=True)


ASSISTANTS_SETTINGS = AssistantsSettings()
