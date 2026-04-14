from apps.leopar.mails.mailpit import LEOPAR_MAILPIT_MAIL_SETTINGS
from libs.db import context_db
from libs.logger import print_color
from libs.mails.models import MailSettings

MAIL_SETTINGS_TO_SEED = (LEOPAR_MAILPIT_MAIL_SETTINGS,)


def seed_mail_settings():
    # Create the default email provider for the KITCHEN app
    print_color("cyan", "[mails.seed] seeding mails")

    with context_db() as db:
        for mail_settings in MAIL_SETTINGS_TO_SEED:
            # check if the mail settings already exists
            if MailSettings.by_id(mail_settings.id, _db=db):
                print_color(
                    "yellow",
                    "[mails.seed] mail provider already exists, skipping",
                    mail_settings.name,
                    mail_settings.id,
                )
                continue
            MailSettings.upsert(obj=mail_settings, _db=db)
            print_color(
                "cyan",
                "[mails.seed] upserted mail provider",
                mail_settings.name,
                mail_settings.id,
            )

    print_color("cyan", "[mails.seed] done seeding mails")


if __name__ == "__main__":
    seed_mail_settings()
