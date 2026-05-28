from pydantic_settings import BaseSettings, SettingsConfigDict


class TasksSettings(BaseSettings):
    PROCESSOR_ID: str = "local-processor"
    PROCESSOR_KIND: str = "local"
    HEARTBEAT_INTERVAL_SECONDS: int = 10
    HEARTBEAT_STALE_AFTER_SECONDS: int = 45

    model_config = SettingsConfigDict(case_sensitive=True)


TASKS_SETTINGS = TasksSettings()
