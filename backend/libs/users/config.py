from pydantic_settings import BaseSettings, SettingsConfigDict


class UsersSettings(BaseSettings):
    APP_SECRET: str
    APP_NAME: str | None = None
    APP_ROOT_DOMAIN: str | None = None
    FRONTEND_URL: str # REQUIRED FOR SENDING EMAILS
    BACKEND_URL: str | None = None
    ADMIN_EMAILS: list[str] = []
    SENDER_EMAIL: str  # REQUIRED: Must be set via environment variable
    PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: int = 120  # Default: 2 hours
    EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES: int = 120  # Default: 2 hours (same as password reset)
    CHANGE_EMAIL_TOKEN_EXPIRY_MINUTES: int = 120  # Default: 2 hours

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file_encoding="utf-8",
    )


USER_SETTINGS = UsersSettings()


if __name__ == "__main__":
    print(USER_SETTINGS.model_dump_json(indent=2))
