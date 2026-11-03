import structlog

from apps.leopar.mails.mailpit import LEOPAR_MAILPIT_MAIL_SETTINGS
from libs.db import context_db
from libs.mails.models import MailSettings

MAIL_SETTINGS_TO_SEED = (LEOPAR_MAILPIT_MAIL_SETTINGS,)

logger = structlog.get_logger(__name__)


def seed_mail_settings():
    logger.info("mail_seed_started")

    with context_db() as db:
        for mail_settings in MAIL_SETTINGS_TO_SEED:
            # check if the mail settings already exists
            if MailSettings.by_id(mail_settings.id, _db=db):
                logger.info(
                    "mail_provider_already_exists",
                    name=mail_settings.name,
                    mail_settings_id=mail_settings.id,
                )
                continue
            MailSettings.upsert(obj=mail_settings, _db=db)
            logger.info(
                "mail_provider_upserted",
                name=mail_settings.name,
                mail_settings_id=mail_settings.id,
            )

    logger.info("mail_seed_done")


if __name__ == "__main__":
    seed_mail_settings()
