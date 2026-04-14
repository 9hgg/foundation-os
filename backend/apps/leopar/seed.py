from apps.leopar.configs import *  # noqa: I001
from libs.files.seed import seed_file_settings
from apps.leopar.mails.seed import seed_mail_settings

# Seed files configuration
seed_file_settings()

# Seed mails configuration
seed_mail_settings()
