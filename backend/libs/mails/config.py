from pathlib import Path
from uuid import UUID

from pydantic_settings import BaseSettings, SettingsConfigDict


class MailsSettings(BaseSettings):
    # Email templates directory - MUST be set per app (spoken, curiosity, etc.)
    EMAIL_TEMPLATES_DIR: Path  # REQUIRED: no default, must be provided via environment
    # Default placeholder; override via env to a real MailSettings id
    MAIL_SETTINGS_ID: UUID = UUID("00000000-0000-0000-0000-000000000000")

    model_config = SettingsConfigDict(case_sensitive=True)


MAILS_SETTINGS = MailsSettings()
