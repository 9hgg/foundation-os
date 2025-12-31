from pydantic_settings import BaseSettings, SettingsConfigDict


class CacheSettings(BaseSettings):
    REDIS_URL: str | None = None

    model_config = SettingsConfigDict(case_sensitive=True)


CACHE_SETTINGS = CacheSettings()
