from pydantic_settings import BaseSettings, SettingsConfigDict


class MCPSettings(BaseSettings):
    """
    Configuration for MCP (Model Context Protocol) client.

    MCP_SERVER_LIST is a JSON list of server definitions, each with at minimum a 'url' key.
    Example value:
        '[{"name": "Curiosity", "url": "http://localhost:8023/sse"}]'
    """

    MCP_SERVER_LIST: list[dict] = []

    model_config = SettingsConfigDict(case_sensitive=True)


MCP_SETTINGS = MCPSettings()
