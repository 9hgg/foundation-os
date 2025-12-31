from pydantic_settings import BaseSettings


class I18nSettings(BaseSettings):
    TRANSLATORS: list[str] = ["dummy"]


I18N_SETTINGS = I18nSettings()
