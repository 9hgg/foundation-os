from pydantic_settings import BaseSettings, SettingsConfigDict


class SMTPProviderSettings(BaseSettings):
    # Optional by default in app settings
    CIPHER_MAIL_SMTP: str | None = None

    model_config = SettingsConfigDict(case_sensitive=True)


SMTP_PROVIDER_SETTINGS = SMTPProviderSettings()
