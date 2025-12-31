from typing import ClassVar

from libs.logger.customLogger import print
from libs.utils.types import BaseModelWithConfig

from ._generic import Translator


class AlreadyEnlistedTranslatorError(Exception):
    """Exception raised when trying to enlist a translator that is already registered."""

    def __init__(self, translator_name: str):
        super().__init__(f"Translator '{translator_name}' is already enlisted.")
        self.translator_name = translator_name


class TranslatorNotFoundError(Exception):
    """Exception raised when a requested translator is not found."""

    def __init__(self, translator_name: str):
        super().__init__(f"Translator '{translator_name}' not found.")
        self.translator_name = translator_name


class EnlistedTranslator(BaseModelWithConfig):
    config_name: str
    translator: Translator


class TranslatorsManager:
    """Translators manager"""

    translators: ClassVar[dict[str, EnlistedTranslator]] = {}

    @classmethod
    def enlist_translator(
        #
        cls,
        translator_name: str = "default",
    ):
        """Enlist a translator"""

        def decorator(fn: Translator, translator_name=translator_name):
            if translator_name is None:
                translator_name = fn.__name__
            if translator_name in cls.translators:
                return
            translator_class = EnlistedTranslator(config_name=translator_name, translator=fn)
            cls.translators[translator_name] = translator_class
            print(f"Translator {translator_name} enlisted")
            return fn

        return decorator

    @classmethod
    def get_translator(cls, config_name: str = "default") -> Translator:
        """Get a translator by name"""
        if config_name not in cls.translators:
            raise TranslatorNotFoundError(config_name)
        return cls.translators[config_name].translator
