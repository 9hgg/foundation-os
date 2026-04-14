from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class PdfsSettings(BaseSettings):
    """Settings for PDF rendering."""

    DEFAULT_ENGINE: Literal["playwright"] = "playwright"
    PLAYWRIGHT_ENABLED: bool = True
    MAX_PAYLOAD_KB: int = 1024

    model_config = SettingsConfigDict(case_sensitive=True)


PDFS_SETTINGS = PdfsSettings()
