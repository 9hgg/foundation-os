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

        try:
            return argostranslate.translate.translate(text, "en", target_language)
        except AttributeError:
            # This error occurs when the language model is not installed
            # 'NoneType' object has no attribute 'get_translation'
            print(f"Argos model for en -> {target_language} not found. Installing...")
            argostranslate.package.update_package_index()
            available_packages = argostranslate.package.get_available_packages()
            package_to_install = next(
                filter(
                    lambda x: x.from_code == "en" and x.to_code == target_language,
                    available_packages,
                ),
                None,
            )
            if package_to_install:
                argostranslate.package.install_from_path(package_to_install.download())
                return argostranslate.translate.translate(text, "en", target_language)
            else:
                print_error(f"Argos package en -> {target_language} not found.")
                raise Exception(f"Argos package en -> {target_language} not found.")



    try:
        # Generate a version hash based on the source code of the translate function
        version_hash = hashlib.sha256((inspect.getsource(argos_translate_text)).encode("utf-8")).hexdigest()

        argos_translator = Translator("argos", "v1-" + version_hash, argos_translate_text)
        return argos_translator
    except Exception as e:
        print_error(f"Failed to initialize Argos translator: {e}")
        return dummy_translator
