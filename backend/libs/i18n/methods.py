import contextlib
import re

import fastapi
import structlog
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

from libs.i18n.config import I18N_SETTINGS
from libs.i18n.translators.translator_manager import TranslatorNotFoundError, TranslatorsManager
from libs.resource.resource import context_db

from .models import SimpleTranslator, Translation

logger = structlog.get_logger(__name__)

# this key can be used to force the language in
#  the GET parameters or in the POST payload
HTTP_KEY_LANG = "_lang"  # could be set in a config


def get_translator_from_config():
    # Iterate over the configured translators in order
    translator_to_use = None
    translator_title = None
    for translator_name in I18N_SETTINGS.TRANSLATORS:
        # skip "manual"
        if translator_name == "manual":
            continue
        try:
            translator_to_use = TranslatorsManager.get_translator(translator_name)
            translator_title = translator_name
            break
        except TranslatorNotFoundError:
            logger.warning("translator_not_found", translator_name=translator_name)
            continue

    # Fallback if no configured translator is found
    if translator_to_use is None:
        # Try default if it exists, otherwise dummy?
        # Assuming at least one should be there.
        try:
            translator_to_use = TranslatorsManager.get_translator("default")
            translator_title = "default"
        except Exception:
            logger.warning("default_translator_not_found")
            return None, None  # No translator available

    return translator_to_use, translator_title


def translate(
    sentence: str,
    *,
    kv: dict | None = None,
    lang: str | None = "en",
    input_language: str | None = "en",
    replace_placeholders_before_translation: bool = False,
    translation_context: str | None = None,
    skip_existing_lookup: bool = False,
) -> str:
    """Translate a sentence using the app's translation table

    pydantic type of translate: (sentence: str, app: App, kv: dict | None = None,
    lang: str | None = "en") -> str

    Args:
        sentence (str): The sentence to translate
        app (typing.Optional[apps.models.App], optional): The app of the request
         context. Defaults to None.
        kv (dict | None, optional): A dict of values coming from the caller
        (an action typically). Defaults to None.
        lang (str | None, optional): The language to use for translation.
        Defaults to "en".

    Returns:
        res(str): The translated sentence
    """

    # Iterate over the configured translators in order
    translator_to_use, _ = get_translator_from_config()
    if translator_to_use is None:
        return sentence

    if lang is None:
        lang = "en"

    # print_color("red",
    #     f"Translating sentence: {sentence} with lang: {lang} and kv: {kv}"
    # )

    translated_sentence: str = sentence
    if replace_placeholders_before_translation:
        # replace §prefixed values with values from the kv dict if available
        if kv is not None:
            for k, v in kv.items():
                sentence = sentence.replace("§" + k, v)

        translated_sentence = translator_to_use.get_translation(
            sentence,
            lang,
            translation_context,
            input_language=input_language,
            skip_existing_lookup=skip_existing_lookup,
        )

    else:
        # translate as it is then replace §prefixed values with
        #  values from the kv dict if available

        if kv is not None:
            for k in kv:
                sentence = sentence.replace("§" + k, '<span class="notranslate">§' + k + "</span>")

        translated_sentence = translator_to_use.get_translation(
            sentence,
            lang,
            translation_context,
            input_language=input_language,
            skip_existing_lookup=skip_existing_lookup,
        )
        if kv is not None:
            for k, v in kv.items():
                translated_sentence = _replace_placeholder(translated_sentence, k, v)

    return translated_sentence


def _replace_placeholder(sentence: str, key: str, value: str) -> str:
    """Replace a §key placeholder with its value, tolerating MT mangling.

    Even though placeholders are wrapped in a ``notranslate`` span before
    translation, some machine translators still rewrite the token — in
    particular they turn underscores in the key into whitespace (or drop them),
    so ``§user_email`` comes back as ``§user email``. A plain
    ``str.replace("§user_email", value)`` then misses it and the raw
    placeholder leaks to the user. We match the underscores as optional
    whitespace to substitute reliably.
    """
    placeholder_pattern = "§" + re.escape(key).replace("_", r"[_\s]*")
    return re.sub(placeholder_pattern, lambda _match: value, sentence)


def get_translator(
    request: fastapi.Request,
    # post_payload: dict = fastapi.Body({}),
) -> SimpleTranslator:
    headers = Headers(scope=request.scope)
    """
    Return a translator function that can be used to translate sentences
    It uses the request to know which language to use
    The resulted translator function can be used like this:
    translator.translate("Hello world") or translator.translate("Hello $name", {"name": "John"})

    """

    accept_language_header = headers.get("accept-language", "")
    accepted_languages = parse_accept_language_header(accept_language_header)
    lang_in_GET_params = request.query_params.get(HTTP_KEY_LANG, None)
    # lang_in_POST_params = post_payload.get(HTTP_KEY_LANG, None)
    lang_in_POST_params = None

    default_lang = (
        lang_in_POST_params
        if lang_in_POST_params is not None
        else (lang_in_GET_params if lang_in_GET_params is not None else accepted_languages[0][0])
    )
    if not default_lang:
        default_lang = "en"

    _, translator_title = get_translator_from_config()

    new_translator = SimpleTranslator(
        translate=lambda sentence,
        kv=None,
        lang=default_lang,
        input_language="en",
        rpbt=False,
        translation_context=None,
        skip_existing_lookup=False: translate(
            sentence,
            kv=kv,
            lang=lang,
            input_language=input_language,
            replace_placeholders_before_translation=rpbt,
            translation_context=translation_context,
            skip_existing_lookup=skip_existing_lookup,
        ),
        title=translator_title,
    )

    return new_translator


def parse_accept_language_header(language_connect_header: str):
    languages = []
    for lang in language_connect_header.split(","):
        parts = lang.strip().split(";")
        language = parts[0].strip()
        quality = 1.0
        if len(parts) > 1 and parts[1].strip().startswith("q="):
            with contextlib.suppress(ValueError):
                quality = float(parts[1].strip()[2:])
        languages.append((language, quality))
    return languages


def delete_translations_by_translator(translator_name: str, _db: Session | None = None) -> int:
    """Delete all translations verified by a specific translator"""
    with context_db(_db) as db:
        query = db.query(Translation).filter(Translation.translator == translator_name)
        deleted_count = query.delete()
        db.commit()
        logger.info("translations_deleted", translator_name=translator_name, deleted_count=deleted_count)
        return deleted_count
