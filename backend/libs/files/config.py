from uuid import UUID

from pydantic_settings import BaseSettings, SettingsConfigDict


class FilesSettings(BaseSettings):
    WHISPER_PATH: str | None = None
    DEFAULT_STORAGE_ID: UUID

    model_config = SettingsConfigDict(case_sensitive=True)


FILES_SETTINGS = FilesSettings()
