from pydantic_settings import BaseSettings, SettingsConfigDict


class EndpointsSettings(BaseSettings):
    ADMIN_EMAILS: list[str] = []

    model_config = SettingsConfigDict(case_sensitive=True)


ENDPOINTS_SETTINGS = EndpointsSettings()
