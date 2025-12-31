import hashlib
import html
import sys
import traceback
import typing

from sqlalchemy import and_

from libs.db import context_db
from libs.logger import print_error, print_warning

from ..models import Translation


# remove print
def print(*args, **kwargs):

    return None


class Translator:
    def __init__(
        #
        self,
        name: str,
        version: str,
        translate_content: typing.Callable[[str, str], str],
        string_hasher=lambda x: hashlib.sha256(x.encode("utf-8")).hexdigest(),
    ):
        self.name = name
        self.version = version
        self.string_hasher = string_hasher
        self.translate_content = translate_content

        print(f"[Translator] {self.name} {self.version} initialized.")

    def _get_existing_translation(
        #
        self,
        hash_string: str,
        language_target: str,
    ) -> str | None:
        print("get_existing_translation", hash_string, language_target)

        with context_db() as db:
            existing_translation_db: typing.Optional[Translation] = (
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
        if (
            existing_translation_db is not None
            and existing_translation_db.translated_content is not None
        ):
            print("We found an existing translation", existing_translation_db)
            return existing_translation_db.translated_content
        else:
            print("No existing translation found")
            return None

    def _compute_hash(self, source_content: str) -> str:
        print("compute_hash", source_content)
        return self.string_hasher(source_content)

    def _save_translation(
        self,
        hash_string: str,
        source_content: str,
        language_target: str,
        translated_content: str,
        translation_context: str | None = None,
    ) -> Translation:
        print(
            "saving translation",
            hash_string,
            source_content,
            language_target,
            translated_content,
        )
        # create a new translation
        new_translation_db = Translation(
            hash=hash_string,
            source_content=source_content,
            language_target=language_target,
            translated_content=translated_content,
            translation_context=translation_context,
            translator=self.name,
            version=self.version,
        )
        return Translation.create(obj=new_translation_db)  # type: ignore

    def get_translation(
        self,
        source_content: str,
        language_target: str,
        translation_context: str | None = None,
    ) -> str:
        print(
            "getting translation", source_content, language_target, translation_context
        )
        if isinstance(source_content, bytes):
            source_content = source_content.decode("utf-8")

        if translation_context is not None:
            hash_string = self._compute_hash(
                source_content + "{{" + translation_context + "}}"
            )
        else:
            hash_string = self._compute_hash(source_content)

        # check if the translation already exists
        existing_translation = self._get_existing_translation(
            hash_string, language_target
        )
        if existing_translation is not None:
            print("Using existing translation", existing_translation)
            return existing_translation
        else:
            print("Generating new translation")

        # translate the content
        try:
            translated_content = self.translate_content(source_content, language_target)
            translated_content = html.unescape(translated_content)
        except Exception:
            # stack
            traceback.print_exc(file=sys.stdout)

            print_error(
                "Translation not working",
                payload={
                    "source_content": source_content,
                    "language_target": language_target,
                    "translator": self.name,
                    "version": self.version,
                },
            )
            return source_content

        if translated_content:
            print("Translation successful", translated_content)
            # save the translation
            self._save_translation(
                hash_string,
                source_content,
                language_target,
                translated_content,
                translation_context=translation_context,
            )

            return translated_content
        else:
            print_warning(
                "Translation not working",
                payload={
                    "source_content": source_content,
                    "language_target": language_target,
                    "translator": self.name,
                    "version": self.version,
                    "translation_context": translation_context,
                },
            )
            return source_content


dummy_translator = Translator(
    "dummy",
    "v0",
    lambda text, target_language: text,
)
