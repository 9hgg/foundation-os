import hashlib
import inspect

import argostranslate.package
import argostranslate.translate
from libs.i18n.translators._generic import Translator, dummy_translator
from libs.logger import print_error


def get_argos_translator():

    def argos_translate_text(text: str, target_language: str) -> str:
        # Argos uses ISO 639-1 usually.
        # 'en' to target_language.

        if "-" in target_language:
            target_language = target_language.split("-")[0]
        return argostranslate.translate.translate(text, "en", target_language)

    try:
        # Generate a version hash based on the source code of the translate function
        version_hash = hashlib.sha256((inspect.getsource(argos_translate_text)).encode("utf-8")).hexdigest()

        argos_translator = Translator("argos", "v1-" + version_hash, argos_translate_text)
        return argos_translator
    except Exception as e:
        print_error(f"Failed to initialize Argos translator: {e}")
        return dummy_translator
