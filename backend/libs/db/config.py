from pydantic_settings import BaseSettings, SettingsConfigDict


class DBSettings(BaseSettings):
    SQLALCHEMY_DATABASE_URI: str

    model_config = SettingsConfigDict(case_sensitive=True)


DB_SETTINGS = DBSettings()
