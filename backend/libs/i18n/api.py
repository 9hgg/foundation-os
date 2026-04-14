import hashlib

import cachetools

from fastapi import Body

from libs.endpoints import create_crud_endpoints
from libs.i18n.deps import Translator__dep
from libs.resource.resource import context_db
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import BaseModelWithConfig, EndpointError, EndpointOutput

from . import models


SMART_TRANSLATION_CACHE: cachetools.TTLCache = cachetools.TTLCache(
    maxsize=2048, ttl=120
)


class SentenceToTranslate(BaseModelWithConfig):
    # value from the template
    input_sentence: str
    # source language (language of input_sentence)
    input_language: str = "en"
    # target language
    lang_code: str
    # key-value dict
    kv: dict[str, str] | None = None
    # replace placeholders before translation
    rpbt: bool = False
    # may be used to define different traduction
    # of the same sentence based on the context
    translation_context: str | None = None

    # sentenceToTranslate is a conversion from the input sentence depending on rpbt
    sentence_to_translate: str


class SentenceTranslated(SentenceToTranslate):
    # the original sentence translated
    raw_translated_sentence: str


def _build_smart_translation_cache_key(
    input_sentence: str,
    lang_code: str,
    translation_context: str | None = None,
    input_language: str | None = None,
) -> str:
    hash_payload = input_sentence
    if translation_context:
        hash_payload += "{{" + translation_context + "}}"
    if input_language:
        hash_payload += "{{src:" + input_language + "}}"
    hash_string = hashlib.sha256(hash_payload.encode()).hexdigest()
    return f"{hash_string}:{lang_code}"


def _get_smart_translation(
    db,
    input_sentence: str,
    lang_code: str,
    translation_context: str | None = None,
    input_language: str | None = None,
) -> str | None:
    cache_key = _build_smart_translation_cache_key(
        input_sentence=input_sentence,
        lang_code=lang_code,
        translation_context=translation_context,
        input_language=input_language,
    )
    if cache_key in SMART_TRANSLATION_CACHE:
        return SMART_TRANSLATION_CACHE[cache_key]

    hash_string = cache_key.split(":", 1)[0]

    existing_translations = (
        models.Translation.query(db)
        .filter(
            models.Translation.hash == hash_string,
            models.Translation.language_target == lang_code,
        )
        .order_by(models.Translation.time_updated.desc())
        .all()
    )

    if existing_translations:
        # 1. Look for manual
        for t in existing_translations:
            if t.translator == "manual":
                SMART_TRANSLATION_CACHE[cache_key] = t.translated_content
                return t.translated_content
        # 2. Most recent
        SMART_TRANSLATION_CACHE[cache_key] = existing_translations[0].translated_content
        return existing_translations[0].translated_content

    SMART_TRANSLATION_CACHE[cache_key] = None
    return None


def create_crud_translation_router(prefix: str = "/api/translations"):
    crud_translation_router = create_crud_endpoints(
        models.Translation,
        prefix=prefix,
        tags=["translations"],
        include_bypass=True,
    )

    @crud_translation_router.post("/manual/{translation_id}/delete")
    async def delete_manual_translation(
        translation_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, _, _ = classic_deps

        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized to delete translations",
                    code="unauthorized",
                )
            )

        models.Translation.delete(obj_id=translation_id)
        SMART_TRANSLATION_CACHE.clear()

        return EndpointOutput(result={"success": True})

    @crud_translation_router.post("/manual")
    async def create_manual_translation(
        translation_to_create: models.Translation,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, _, _ = classic_deps

        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized to create manual translations",
                    code="unauthorized",
                )
            )

        translation_db = models.Translation.create(obj=translation_to_create)
        SMART_TRANSLATION_CACHE.clear()

        return EndpointOutput(result=translation_db)

    @crud_translation_router.post("/translate/multiple")
    async def translate_multiple_elements(
        translator: Translator__dep,
        sentences_to_translate: list[SentenceToTranslate] = Body(...),
    ):
        translated_sentences: list[SentenceTranslated] = []

        with context_db() as db:
            for sentence_to_translate in sentences_to_translate:
                # we don't rely on the front placeholder replacement
                # instead of using sentence_to_translate.sentenceToTranslate
                # we use sentence_to_translate.input_sentence and do
                #  our own replacement if required (rpbt)

                # Logic to check existing translation independently of the translator
                found_translation = _get_smart_translation(
                    db,
                    sentence_to_translate.input_sentence,
                    sentence_to_translate.lang_code,
                    sentence_to_translate.translation_context,
                    sentence_to_translate.input_language,
                )

                if found_translation:
                    translated_sentence = found_translation
                else:
                    # Fallback to translator
                    translated_sentence = translator.translate(
                        sentence_to_translate.input_sentence,
                        kv=sentence_to_translate.kv,
                        lang=sentence_to_translate.lang_code,
                        input_language=sentence_to_translate.input_language,
                        rpbt=sentence_to_translate.rpbt,
                        translation_context=sentence_to_translate.translation_context,
                    )

                translated_sentences.append(
                    SentenceTranslated(
                        input_sentence=sentence_to_translate.input_sentence,
                        kv=sentence_to_translate.kv,
                        rpbt=sentence_to_translate.rpbt,
                        sentence_to_translate=sentence_to_translate.sentence_to_translate,
                        input_language=sentence_to_translate.input_language,
                        lang_code=sentence_to_translate.lang_code,
                        translation_context=sentence_to_translate.translation_context,
                        # the added value: the translated sentence
                        raw_translated_sentence=translated_sentence,
                    )
                )

        return EndpointOutput(result=translated_sentences)

    @crud_translation_router.get("/translate/test")
    async def translate_test(
        translator: Translator__dep,
    ):
        test_sentence = "Hello, world!"
        translated_sentence = translator.translate(test_sentence, lang="fr")
        return EndpointOutput(
            result=SentenceTranslated(
                input_sentence=test_sentence,
                sentence_to_translate=test_sentence,
                input_language="en",
                lang_code="fr",
                raw_translated_sentence=translated_sentence,
            )
        )

    return crud_translation_router
