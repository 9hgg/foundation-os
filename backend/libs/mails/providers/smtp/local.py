from ...models import MailSettings
from ._generic import GenericSMTPProvider, SMTPConfig

DEFAULT_LOCAL_CONFIG = SMTPConfig(
    host="localhost",
    port=2525,
    # username="no-username",
    # password="no-password",
    starttls=False,
)

DEFAULT_LOCAL_MAIL_PROVIDER = MailSettings(
    name="DEFAULT_LOCAL",
    kind="smtp",
    config=DEFAULT_LOCAL_CONFIG.model_dump(),
)


DEFAULT_LOCAL_SMTP = GenericSMTPProvider(
    mail_settings=DEFAULT_LOCAL_MAIL_PROVIDER,
    # dry_run=True,
)
