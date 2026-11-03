import contextlib
import errno
import hashlib
import os
import tempfile
import urllib.request
import uuid

import structlog

from libs.db import context_db
from libs.files.models import File
from libs.files.storage import get_file_storage
from libs.files.storage._generic import GenericStorage

logger = structlog.get_logger(__name__)

############################################################
#                                                          #
#                         BASICS                           #
#                                                          #
############################################################


def mkdir_p(path):
    """
    Create a directory if it does not exist
    Args:
        path (str): path to the directory
    """
    try:
        os.makedirs(path)
    except OSError as exc:  # Python >2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise


def delete_local_file(path: str, handle: int | None = None):
    """
    Delete local file
    """
    try:
        if handle is not None:
            os.close(handle)
        os.remove(path)
        return True  # noqa: TRY300
    except Exception:
        return False


def download_locally(url: str, filename: str):
    """
    Download an url to a local file
    """
    tmp_local_filename = None
    try:
        mkstemp_handle, tmp_local_filename = tempfile.mkstemp()
        urllib.request.urlretrieve(url, tmp_local_filename)  # noqa: S310
        os.close(mkstemp_handle)
        return tmp_local_filename  # noqa: TRY300
    except Exception as exc:
        logger.warning("local_download_failed", error_type=type(exc).__name__)
        try:
            if tmp_local_filename:
                os.remove(tmp_local_filename)
        except Exception as cleanup_exc:
            logger.warning("local_download_cleanup_failed", error_type=type(cleanup_exc).__name__)
        tmp_local_filename = None

    return tmp_local_filename


def _sha256_of_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _persist_hash_metadata(file_id: uuid.UUID, digest: str) -> None:
    """Persist the computed digest while holding a row lock."""
    with context_db() as db:
        current_file = (
            db.query(File)
            .filter(File.id == file_id)
            .with_for_update()
            .first()
        )
        if current_file is None:
            logger.warning("file_hash_file_not_found_during_persist", file_id=str(file_id))
            return

        File.patch(
            obj_id=file_id,
            update_dict={"hash": digest},
            _db=db,
        )


def compute_and_persist_file_hash(file_db: File, *, force: bool = False) -> str | None:
    """Compute and persist the original file's SHA-256 digest.

    Hashing deliberately lives outside the processor pipeline: files without a
    recognized media kind (for example JSON sidecars) still need to take part
    in content-based duplicate detection.
    """
    if file_db.hash is not None and not force:
        return file_db.hash
    if file_db.storage_folder_path is None or file_db.storage_id is None:
        logger.warning("file_hash_storage_metadata_missing", file_id=str(file_db.id))
        return None

    storage = get_file_storage(file_db.storage_id)
    original_alternative = storage.get_original_alternative(
        storage_folder_path=file_db.storage_folder_path
    )
    if original_alternative is None:
        logger.warning("file_hash_original_missing", file_id=str(file_db.id))
        return None

    suffix = file_db.extension or file_db.extension_client or ""
    temporary_path = GenericStorage.get_temporary_local_path(suffix=suffix)
    try:
        downloaded_path = storage.download(
            storage_folder_path=file_db.storage_folder_path,
            alternative=original_alternative,
            local_path=temporary_path,
            force=True,
        )
        if downloaded_path is None:
            logger.warning("file_hash_download_failed", file_id=str(file_db.id))
            return None

        digest = _sha256_of_file(downloaded_path)
        _persist_hash_metadata(file_db.id, digest)
        return digest
    finally:
        # Only delete the path we allocated. A storage implementation returning
        # another path may be pointing at its stored original.
        with contextlib.suppress(FileNotFoundError):
            os.remove(temporary_path)
