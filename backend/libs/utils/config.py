import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class TokensSettings(BaseSettings):
    APP_SECRET: str
    ACCESS_TOKEN_EXPIRE_MINUTES: float = 60 * 24 * 8
    encoding_algorithm: str = "HS256"

    model_config = SettingsConfigDict(case_sensitive=True)


TOKENS_SETTINGS = TokensSettings()


class FilesUtilsSettings(BaseSettings):

    # we are in the backend/libs/utils/config.py file
    # we want the 'backend/storage' folder (relative to the backend root folder)
    STORAGE_FOLDER: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "storage",
    )

    model_config = SettingsConfigDict(case_sensitive=True)


FILES_UTILS_SETTINGS = FilesUtilsSettings()
