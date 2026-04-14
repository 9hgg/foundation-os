from pydantic_settings import BaseSettings, SettingsConfigDict

from libs.mails.models import MailSettings
from libs.mails.providers.smtp._generic import SMTPConfig
from libs.utils.id import deterministic_uuid

LEOPAR_MAILPIT_MAIL_SETTINGS_ID = deterministic_uuid("local-default-mailpit-provider")


class LeoparMailpitSettings(BaseSettings):
    MAILPIT_SMTP_HOST: str = "localhost"
    MAILPIT_SMTP_PORT: int = 1025
    MAILPIT_SMTP_STARTTLS: bool = False

    model_config = SettingsConfigDict(case_sensitive=True)


# This will allow to change Mailpit settings via env variables
LEOPAR_MAILPIT_SETTINGS = LeoparMailpitSettings()

# Mailpit is of SMTP kind
LEOPAR_MAILPIT_CONFIG = SMTPConfig(
    host=LEOPAR_MAILPIT_SETTINGS.MAILPIT_SMTP_HOST,
    port=LEOPAR_MAILPIT_SETTINGS.MAILPIT_SMTP_PORT,
    starttls=LEOPAR_MAILPIT_SETTINGS.MAILPIT_SMTP_STARTTLS,
)


# Define the MailSettings resource to seed the database.
# If you want to use this config in your app, set the MAIL_SETTINGS_ID env var
# to MAILPIT_MAIL_SETTINGS_ID value.
LEOPAR_MAILPIT_MAIL_SETTINGS = MailSettings(
    id=LEOPAR_MAILPIT_MAIL_SETTINGS_ID,
    name="LOCAL_MAILPIT",
    kind="smtp",
    config=LEOPAR_MAILPIT_CONFIG.model_dump(),
)
