from pydantic_settings import BaseSettings, SettingsConfigDict


class LoggerSettings(BaseSettings):
    COLORIZE_LOG: bool = True

    # Optional rotating file sink, in addition to stdout — set to a path on a
    # persistent volume to keep a local log history that survives machine
    # restarts and outlives whatever window `flyctl logs` happens to buffer.
    LOG_FILE_PATH: str | None = None
    LOG_FILE_RETENTION: str = "7 days"

    model_config = SettingsConfigDict(case_sensitive=True)


LOGGER_SETTINGS = LoggerSettings()
