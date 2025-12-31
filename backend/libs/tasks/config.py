from pydantic_settings import BaseSettings, SettingsConfigDict


class TasksSettings(BaseSettings):
    PROCESSOR_ID: str = "local-processor"
    PROCESSOR_KIND: str = "local"

    model_config = SettingsConfigDict(case_sensitive=True)


TASKS_SETTINGS = TasksSettings()
