from pydantic_settings import BaseSettings, SettingsConfigDict


class TeamsSettings(BaseSettings):
    APP_NAME: str | None = None
    FRONTEND_URL: str  # REQUIRED: where an invitation link points
    SENDER_EMAIL: str  # REQUIRED: who an invitation comes from

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file_encoding="utf-8",
    )


TEAM_SETTINGS = TeamsSettings()


if __name__ == "__main__":
    print(TEAM_SETTINGS.model_dump_json(indent=2))
