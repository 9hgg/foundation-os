from ..models import MailSettings
from ._generic import GenericMailProvider
from .smtp._generic import GenericSMTPProvider

MAIL_PROVIDER_KIND_MAPPING: dict[str, type[GenericMailProvider]] = {
    "smtp": GenericSMTPProvider,
}


def get_mail_provider(mail_settings: MailSettings):
    provider_class = MAIL_PROVIDER_KIND_MAPPING.get(mail_settings.kind)
    if provider_class is None:
        raise Exception(f"Unknown mail provider kind: {mail_settings.kind}")

    return provider_class(mail_settings=mail_settings)
