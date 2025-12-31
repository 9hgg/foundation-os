from pydantic_settings import BaseSettings, SettingsConfigDict


class InteractionsSettings(BaseSettings):
    APP_SECRET: str

    model_config = SettingsConfigDict(case_sensitive=True)


INTERACTIONS_SETTINGS = InteractionsSettings()
