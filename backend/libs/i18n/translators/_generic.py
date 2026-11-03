import hashlib
import html
import typing

import structlog
from sqlalchemy import and_

from libs.db import context_db

from ..models import Translation

_logger = structlog.get_logger(__name__)


class Translator:
    def __init__(
        #
        self,
        name: str,
        version: str,
        translate_content: typing.Callable[[str, str, str | None], str | None],
        string_hasher=lambda x: hashlib.sha256(x.encode("utf-8")).hexdigest(),
    ):
        self.name = name
        self.version = version
        self.string_hasher = string_hasher
        self.translate_content = translate_content

        _logger.debug(
            "translator_initialized",
            translator=self.name,
            version=self.version,
        )

    def _get_existing_translation(
        #
        self,
        hash_string: str,
        language_target: str,
    ) -> str | None:
        with context_db() as db:
            existing_translation_db: Translation | None = (
                Translation.query(db)
                .filter(
                    # filter based on hash
                    and_(
                        Translation.hash == hash_string,
                        Translation.language_target == language_target,
                        Translation.translator == self.name,
                        Translation.version == self.version,
                    )
                )
                .first()
            )
        if existing_translation_db is not None and existing_translation_db.translated_content is not None:
            return existing_translation_db.translated_content
        else:
            return None

    def _compute_hash(self, source_content: str) -> str:
        return self.string_hasher(source_content)

    def _save_translation(
        self,
        hash_string: str,
        source_content: str,
        language_source: str,
        language_target: str,
        translated_content: str,
        translation_context: str | None = None,
    ) -> Translation:
        # print(
        #     "saving translation",
        #     hash_string,
        #     source_content,
        #     language_target,
        #     translated_content,
        # )
        # create a new translation
        new_translation_db = Translation(
            hash=hash_string,
            source_content=source_content,
            language_source=language_source,
            language_target=language_target,
            translated_content=translated_content,
            translation_context=translation_context,
            translator=self.name,
            version=self.version,
        )
        return Translation.create(obj=new_translation_db)  # type: ignore[arg-type]

    def get_translation(
        self,
        source_content: str,
        language_target: str,
        translation_context: str | None = None,
        input_language: str | None = "en",
        *,
        skip_existing_lookup: bool = False,
    ) -> str:
        if isinstance(source_content, bytes):
            source_content = source_content.decode("utf-8")

        # Nothing to translate when the target language matches the source
        # language. Besides being wasteful, providers such as GCP reject a
        # request whose source and target languages are equal (400
        # "Target language can't be equal to source language."). Compare on the
        # base language so region variants (e.g. "en-US") are handled too.
        source_language = (input_language or "en").split("-")[0].lower()
        target_language = (language_target or "").split("-")[0].lower()
        if not target_language or source_language == target_language:
            return source_content

        hash_payload = source_content
        if translation_context is not None:
            hash_payload += "{{" + translation_context + "}}"
        if input_language:
            hash_payload += "{{src:" + input_language + "}}"
        hash_string = self._compute_hash(hash_payload)

        # check if the translation already exists
        existing_translation = None
        if not skip_existing_lookup:
            existing_translation = self._get_existing_translation(hash_string, language_target)
        if existing_translation is not None:
            return existing_translation

        # translate the content
        try:
            translated_content: str | None = self.translate_content(source_content, language_target, input_language)
        except Exception:
            _logger.exception(
                "translation_failed",
                source_content=source_content,
                language_target=language_target,
                translator=self.name,
                version=self.version,
            )
            return source_content
        if translated_content is None:
            # print_warning(
            #     "Translation function returned None",
            #     payload={
            #         "source_content": source_content,
            #         "language_target": language_target,
            #         "translator": self.name,
            #         "version": self.version,
            #         "translation_context": translation_context,
            #     },
            # )
            return source_content
        translated_content = html.unescape(translated_content)

        if translated_content:
            # save the translation
            self._save_translation(
                hash_string,
                source_content,
                input_language,
                language_target,
                translated_content,
                translation_context=translation_context,
            )

            return translated_content
        else:
            _logger.warning(
                "translation_returned_empty_result",
                source_content=source_content,
                language_target=language_target,
                translator=self.name,
                version=self.version,
                translation_context=translation_context,
            )
            return source_content


dummy_translator = Translator(
    "dummy",
    "v0",
    lambda text, target_language, input_language=None: None,
)
