import hashlib
import inspect

from libs.i18n.translators._generic import Translator, dummy_translator
from libs.logger import print_error, print_warning

try:
    import argostranslate.package as argos_package
    import argostranslate.translate as argos_translate
except Exception:
    print_warning(
        "Failed to import Argos Translate. "
        "Install optional i18n dependencies to enable automatic translation."
    )
    argos_package = None
    argos_translate = None


def get_argos_translator():

    if argos_package is None or argos_translate is None:
        print_warning(
            "Argos translator is not available. "
            "Install optional i18n dependencies to enable automatic translation."
        )
        return dummy_translator

    _available_packages_cache: list | None = None

    def _normalize_language_code(language: str | None) -> str:
        code = language or "en"
        if "-" in code:
            return code.split("-")[0]
        return code

    def _can_translate_now(input_language: str, target_language: str) -> bool:
        try:
            installed_languages = argos_translate.get_installed_languages()
            source = next(
                (language for language in installed_languages if language.code == input_language),
                None,
            )
            target = next(
                (language for language in installed_languages if language.code == target_language),
                None,
            )
            if source is None or target is None:
                return False
            return source.get_translation(target) is not None
        except Exception:
            return False

    def _ensure_argos_language_translator(input_language: str, target_language: str) -> bool:
        nonlocal _available_packages_cache

        if input_language == target_language:
            return True
        if _can_translate_now(input_language, target_language):
            return True

        if _available_packages_cache is None:
            try:
                argos_package.update_package_index()
                _available_packages_cache = argos_package.get_available_packages()
            except Exception as exc:
                print_warning(
                    f"(_ensure_argos_language_translator) Argos package index update failed for {input_language}->{target_language}: {exc}. "
                )
                return False

        package_to_install = next(
            (
                package
                for package in (_available_packages_cache or [])
                if package.from_code == input_language and package.to_code == target_language
            ),
            None,
        )
        if package_to_install is None:
            print_warning(
                f"(_ensure_argos_language_translator) Argos package {input_language} -> {target_language} not available in argos index."
            )
            return False

        try:
            argos_package.install_from_path(package_to_install.download())
        except Exception as exc:
            print_warning(
                f"(_ensure_argos_language_translator) Argos package install failed for {input_language}->{target_language}: {exc}. "
            )
            return False
        return _can_translate_now(input_language, target_language)

    def argos_translate_text(
        text: str, target_language: str, input_language: str | None = "en"
    ) -> str | None:
        source_language = _normalize_language_code(input_language)
        target_language = _normalize_language_code(target_language)

        if source_language == target_language:
            return text

        def _translate_or_none(source: str, target: str, content: str) -> str | None:
            try:
                translated: str = argos_translate.translate(content, source, target)
                return translated
            except Exception:
                return None

        # 1) Direct pair first.
        if _ensure_argos_language_translator(source_language, target_language):
            direct_translation = _translate_or_none(source_language, target_language, text)
            if direct_translation:
                return direct_translation

        # 2) Relay strategy ("relation de chasles"): source -> en -> target.
        relay_language = "en"
        if source_language != relay_language and target_language != relay_language:
            source_to_relay_ok = _ensure_argos_language_translator(source_language, relay_language)
            relay_to_target_ok = _ensure_argos_language_translator(relay_language, target_language)

            if source_to_relay_ok and relay_to_target_ok:
                relay_text = _translate_or_none(source_language, relay_language, text)
                if relay_text:
                    final_text = _translate_or_none(relay_language, target_language, relay_text)
                    if final_text:
                        return final_text

        print_warning(
            f"(argos_translate_text) Argos translator not available for {source_language} -> {target_language} (direct or relay via en)."
        )
        return None

    try:
        # Generate a version hash based on the source code of the translate function
        version_hash = hashlib.sha256(
            (inspect.getsource(argos_translate_text)).encode("utf-8")
        ).hexdigest()

        argos_translator = Translator(
            "argos", "v2-" + version_hash, argos_translate_text
        )
    except Exception as e:
        print_error(f"(argos_translate_text) Failed to initialize Argos translator: {e}")
        return dummy_translator
    return argos_translator
