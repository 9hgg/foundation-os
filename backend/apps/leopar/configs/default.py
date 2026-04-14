import os
from pathlib import Path
from uuid import UUID

from pydantic_settings import BaseSettings, SettingsConfigDict


class GlobalAppSettings(BaseSettings):
    # could be production or development for debugging purposes
    DOCKER_IMAGE: str | None = None
    # ex: apps.default.app:asgi_app or apps.default.worker:asgi_app for debugging purposes
    DOCKER_APP_TARGET: str | None = None

    APP_NAME: str
    SESSION_SECRET: str
    APP_SECRET: str

    CURRENT_ENV: str

    ADMIN_EMAILS: list[str]
    SENTRY_DSN: str | None = None

    STORAGE_FOLDER: str = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")

    DEFAULT_STORAGE_ID: UUID

    EMAIL_TEMPLATES_DIR: Path = Path(__file__).parent.parent / "mails" / "templates"
    MAIL_SETTINGS_ID: UUID = UUID("00000000-0000-0000-0000-000000000000")  # Placeholder, replace with actual ID

    model_config = SettingsConfigDict(case_sensitive=True)


GLOBAL_APP_SETTINGS = GlobalAppSettings()
print(f"📋🎬 Leopar default settings loaded: {GLOBAL_APP_SETTINGS.APP_NAME}")
