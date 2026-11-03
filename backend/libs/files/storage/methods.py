import datetime
import os
import re
import unicodedata
import uuid

import structlog
from sqlalchemy.orm import Session

from ..models import ExtraDetailsFile, File, FileAlternative, StorageSettings
from ._generic import GenericStorage
from .local import LocalStorage
from .storage_manager import StoragesManager

logger = structlog.get_logger(__name__)

# always register the LocalStorage class
StoragesManager.register_storage("local")(LocalStorage)


def get_storage(storage_settings: StorageSettings):
    storage_class = StoragesManager.get_storage(storage_settings.kind)
    if storage_class is None:
        raise Exception(f"Unknown storage kind: {storage_settings.kind}")  # noqa: TRY002, TRY003

    return storage_class(storage_settings=storage_settings)


CACHED_STORAGE: dict[uuid.UUID, GenericStorage] = {}


def get_file_storage(
    storage_id: uuid.UUID, _db: Session | None = None
) -> GenericStorage:
    """
    Get the storage of a file.
    Use the storage_id of the file to get the storage_settings.
    Use the storage_settings to get the storage.
    """

    if storage_id in CACHED_STORAGE:
        # print("Using cached storage")
        return CACHED_STORAGE[storage_id]

    storage_settings = StorageSettings.by_id(storage_id, _db=_db)
    if storage_settings is None:
        raise Exception("Storage not found")  # noqa: TRY002, TRY003
    app_storage = get_storage(storage_settings)
    CACHED_STORAGE[storage_id] = app_storage
    return app_storage


def describe_alternative(file_db, alternative_suffix: str, alternative_format) -> tuple[str, str]:
    if alternative_suffix == "original":
        return (
            file_db.mime or file_db.mime_client or "application/octet-stream",
            file_db.extension or file_db.extension_client or "",
        )
    if alternative_format is None:
        return "application/octet-stream", ""
    return alternative_format.mime or "application/octet-stream", alternative_format.extension or ""


def named_with_extension(file_name: str, extension: str) -> str:
    if not extension:
        return file_name
    suffix = extension if extension.startswith(".") else f".{extension}"
    if file_name.lower().endswith(suffix.lower()):
        return file_name
    return f"{file_name}{suffix}"


def sanitized_download_name(raw_filename: str, max_length: int = 120) -> str | None:
    """A caller-supplied download name, safe for a content-disposition and still named.

    Truncating the whole string dropped the extension of a long question. macOS sends
    decomposed accents, which NFC puts back together.
    """
    cleaned = unicodedata.normalize("NFC", re.sub(r'[\r\n"\\]', "", raw_filename)).strip()
    if not cleaned:
        return None
    if len(cleaned) <= max_length:
        return cleaned

    stem, extension = os.path.splitext(cleaned)
    if not extension or len(extension) >= max_length:
        return cleaned[:max_length]
    return stem[: max_length - len(extension)] + extension


def resolve_alternative(
    file_db: File, storage_db: GenericStorage, alternative_suffix: str
) -> tuple[ExtraDetailsFile, FileAlternative | None, bool]:
    """The alternative's record and whether it had to be built from what storage holds.

    Nothing is written here: the caller knows whether a url is about to go with it.
    """
    extra = file_db.extra_
    alternative_format = next(
        (alt for alt in extra.alternative_formats if alt.storage_suffix == alternative_suffix),
        None,
    )
    if alternative_format is not None:
        return extra, alternative_format, False

    if not storage_db.exists_in_storage(
        storage_folder_path=file_db.storage_folder_path,
        alternative=alternative_suffix,
    ):
        logger.debug("presigned_url_alternative_not_in_storage", alternative_suffix=alternative_suffix, file_id=str(file_db.id))
        return extra, None, False

    mime, extension = describe_alternative(file_db, alternative_suffix, None)
    alternative_format = FileAlternative(
        storage_suffix=alternative_suffix,
        mime=mime,
        kind=(file_db.kind or "unknown") if alternative_suffix == "original" else "unknown",
        extension=extension,
        size=storage_db.get_size(storage_folder_path=file_db.storage_folder_path, alternative=alternative_suffix) or None,
    )
    extra.alternative_formats.append(alternative_format)
    logger.info("presigned_url_alternative_format_created", alternative_suffix=alternative_suffix, file_id=str(file_db.id))
    return extra, alternative_format, True


def save_alternative(file_db: File, extra: ExtraDetailsFile) -> None:
    file_db.patch(obj_id=file_db.id, update_dict={"extra": extra.model_dump()})


def sign_alternative_url(
    storage_db: GenericStorage,
    file_db: File,
    alternative_suffix: str,
    *,
    download: bool,
    filename: str | None,
) -> tuple[str, float] | None:
    details = storage_db.get_download_url(
        file_id=str(file_db.id),
        storage_folder_path=file_db.storage_folder_path,
        alternative=alternative_suffix,
        download=download,
        filename=filename,
    )
    if details is None:
        return None
    url, expiration_seconds = details
    return url, (datetime.datetime.now() + datetime.timedelta(seconds=expiration_seconds - 60)).timestamp()


def get_onetime_presigned_url(
    file_id: str, alternative_suffix: str, *, download: bool, filename: str | None
) -> tuple[str, float] | None:
    """A url signed for one filename or disposition. Never cached: it serves only that one."""
    file_db = File.by_id(file_id)
    if file_db is None or file_db.storage_id is None or not file_db.storage_folder_path:
        return None
    storage_db = get_file_storage(file_db.storage_id)

    extra, alternative_format, created = resolve_alternative(file_db, storage_db, alternative_suffix)
    if alternative_format is None:
        return None
    if created:
        save_alternative(file_db, extra)
    return sign_alternative_url(storage_db, file_db, alternative_suffix, download=download, filename=filename)


def get_and_cache_presigned_url(file_id: str, alternative_suffix: str = "original") -> tuple[str, float] | None:
    """The plain url for viewing, kept on the alternative and reused until it nears expiry."""
    file_db = File.by_id(file_id)
    if file_db is None or file_db.storage_id is None or not file_db.storage_folder_path:
        return None
    storage_db = get_file_storage(file_db.storage_id)

    extra, alternative_format, _created = resolve_alternative(file_db, storage_db, alternative_suffix)
    if alternative_format is None:
        return None

    if (
        alternative_format.presigned_url
        and alternative_format.presigned_url_expiration
        and "attachment" not in alternative_format.presigned_url
        and alternative_format.presigned_url_expiration > datetime.datetime.now().timestamp() + 60
    ):
        return alternative_format.presigned_url, alternative_format.presigned_url_expiration

    signed = sign_alternative_url(storage_db, file_db, alternative_suffix, download=False, filename=None)
    if signed is None:
        logger.warning("presigned_url_generation_failed", alternative_suffix=alternative_suffix, file_id=file_id)
        return None
    url, expiration = signed
    alternative_format.presigned_url = url
    alternative_format.presigned_url_expiration = expiration
    save_alternative(file_db, extra)
    return url, expiration
