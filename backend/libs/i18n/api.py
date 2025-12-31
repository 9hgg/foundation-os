import hashlib

from fastapi import Body

from libs.endpoints import create_crud_endpoints
from libs.endpoints.config import ENDPOINTS_SETTINGS
from libs.i18n.deps import Translator__dep
from libs.resource.resource import context_db
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import BaseModelWithConfig, EndpointError, EndpointOutput

from . import models


class SentenceToTranslate(BaseModelWithConfig):
    # value from the template
    input_sentence: str
    # key-value dict
    kv: dict[str, str] | None = None
    # replace placeholders before translation
    rpbt: bool = False
    # may be used to define different traduction
    # of the same sentence based on the context
    translation_context: str | None = None

    # sentenceToTranslate is a conversion from the input sentence depending on rpbt
    sentence_to_translate: str
    langCode: str = "en"


class SentenceTranslated(SentenceToTranslate):
    # the original sentence translated
    raw_translated_sentence: str


def _get_smart_translation(
    db,
    input_sentence: str,
    lang_code: str,
    translation_context: str | None = None,
) -> str | None:
    if translation_context:
        hash_string = hashlib.sha256((input_sentence + "{{" + translation_context + "}}").encode()).hexdigest()
    else:
        hash_string = hashlib.sha256(input_sentence.encode()).hexdigest()

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
                return t.translated_content
        # 2. Most recent
        return existing_translations[0].translated_content

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

        # check email is verified
        if not current_user_db or not current_user_db.email_verified:
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized to delete translations (email not verified)",
                    code="unauthorized",
                )
            )

        if not current_user_db or current_user_db.email not in ENDPOINTS_SETTINGS.ADMIN_EMAILS:
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized to delete translations (email not in admin list)",
                    code="unauthorized",
                )
            )

        models.Translation.delete(obj_id=translation_id)

        return EndpointOutput(result={"success": True})

    @crud_translation_router.post("/manual")
    async def create_manual_translation(
        translation_to_create: models.Translation,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, _, _ = classic_deps

        # check email is verified
        if not current_user_db or not current_user_db.email_verified:
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized to create manual translations (email not verified)",
                    code="unauthorized",
                )
            )

        if not current_user_db or current_user_db.email not in ENDPOINTS_SETTINGS.ADMIN_EMAILS:
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized to create manual translations (email not in admin list)",
                    code="unauthorized",
                )
            )

        translation_db = models.Translation.create(obj=translation_to_create)

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
                    sentence_to_translate.langCode,
                    sentence_to_translate.translation_context,
                )

                if found_translation:
                    translated_sentence = found_translation
                else:
                    # Fallback to translator
                    translated_sentence = translator.translate(
                        sentence_to_translate.input_sentence,
                        kv=sentence_to_translate.kv,
                        lang=sentence_to_translate.langCode,
                        rpbt=sentence_to_translate.rpbt,
                        translation_context=sentence_to_translate.translation_context,
                    )

                translated_sentences.append(
                    SentenceTranslated(
                        input_sentence=sentence_to_translate.input_sentence,
                        kv=sentence_to_translate.kv,
                        rpbt=sentence_to_translate.rpbt,
                        sentence_to_translate=sentence_to_translate.sentence_to_translate,
                        langCode=sentence_to_translate.langCode,
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
                langCode="en",
                raw_translated_sentence=translated_sentence,
            )
        )

    return crud_translation_router
