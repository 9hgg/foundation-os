from pydantic_settings import BaseSettings, SettingsConfigDict


class LoggerSettings(BaseSettings):
    COLORIZE_LOG: bool = True

    model_config = SettingsConfigDict(case_sensitive=True)


LOGGER_SETTINGS = LoggerSettings()
