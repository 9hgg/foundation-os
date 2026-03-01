from typing_extensions import Protocol

from libs.resource import Resource


class Translation(Resource, table=True):
    __tablename__ = "translations"
    __kind__ = "translation"
    __title__ = "Translation"
    __description__ = "A Translation is a translation of a content from a language to another."
    __private__ = True

    # hash is the hash of the source content + the target language + the translator
    hash: str
    source_content: str = ""
    # source language is not always known
    language_source: str | None = None
    # target language is always known
    language_target: str
    # if the translation is not found, this will be None
    translated_content: str | None
    # name of the translator (google, deepl, chatgpt, argos, etc.)
    translator: str | None
    version: str | None

    translation_context: str | None


class TranslateFn(Protocol):
    def __call__(
        self,
        sentence: str,
        *,
        kv: dict[str, str] | None = None,
        lang: str | None = "en",
        input_language: str | None = "en",
        rpbt: bool = False,
        translation_context: str | None = None,
    ) -> str: ...


class SimpleTranslator:
    # translate: Callable[[str, dict[str, str] | None, str | None], str]
    translate: TranslateFn
    title: str

    def __init__(self, translate: TranslateFn, title: str):
        self.translate = translate
        self.title = title
