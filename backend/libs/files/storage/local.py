import os
import shutil
import typing
from textwrap import dedent
from urllib.parse import quote

import structlog
from pydantic import BaseModel, TypeAdapter

from ..models import StorageSettings
from ._generic import GenericStorage

logger = structlog.get_logger(__name__)


class LocalStorageConfig(BaseModel):
    path: str


class LocalStorage(GenericStorage):
    """
    A local storage is a storage where a file is stored locally.
    """

    storage_type: str = "local"

    config: LocalStorageConfig  # override the config "Any type" of the parent class

    def __init__(self, *, storage_settings: StorageSettings, **kwargs):
        """Should create a Local Storage using the config"""

        sc = TypeAdapter(LocalStorageConfig).validate_python(storage_settings.config)

        super().__init__(
            storage_settings=storage_settings,
            config=sc,
            type="local",
            **kwargs,
        )

    def get_upload_url(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        content_type: str | None = None,
        origin: str | None = None,
    ) -> str | None:
        """
        Get the URL where to upload a file

        Local : return the server URL with the storage folder path and alternative
        """
        return f"{origin}/api/files/storage/upload/{storage_folder_path}/{alternative}"

    def exists_in_storage(self, *, storage_folder_path: str, alternative: str = "original") -> bool:
        """
        Check if a file exists in the storage
        """
        if not storage_folder_path or not alternative:
            return False

        # check if the file exists in the local storage
        return os.path.exists(self.config.path + "/" + storage_folder_path + "/" + alternative)

    def get_size(self, *, storage_folder_path: str, alternative: str = "original") -> int:
        """
        Get the size of a file in the storage
        """

        # check that the file exists
        if not self.exists_in_storage(storage_folder_path=storage_folder_path, alternative=alternative):
            logger.warning("storage_file_missing", operation="get_size")
            return 0

        size = 0

        try:
            # generate the storage path
            storage_path = self.config.path + "/" + storage_folder_path + "/" + alternative
            # get the size of the file in the local storage
            size = os.path.getsize(storage_path)
        except Exception as e:
            logger.exception("storage_get_size_failed", operation="get_size", error_type=type(e).__name__)
            return 0

        return size

    def upload(  # noqa: C901
        self,
        *,
        local_path: str,
        storage_folder_path: str,
        alternative: str = "original",
        content_type: str | None = None,
        force: bool = False,
        content_range: str | None = None,
    ) -> bool:
        """
        Upload a file to the storage
        """

        # check that the local file exists
        if not os.path.exists(local_path):
            logger.warning("storage_local_file_missing", operation="upload")
            return False

        if content_type:
            logger.debug("storage_content_type_received", operation="upload", content_type=content_type)
            logger.warning("storage_content_type_ignored", operation="upload")

        if content_range:
            logger.debug("storage_content_range_received", operation="upload")

            try:
                # Parse Content-Range header (format: "bytes start-end/total" or "bytes start-end")
                if not content_range.startswith("bytes "):
                    logger.warning("storage_content_range_invalid", operation="upload", reason="format")
                    return False

                range_part = content_range.split(" ")[1]
                if "/" in range_part:
                    range_part = range_part.split("/")[0]

                start_str, end_str = range_part.split("-")

                if not start_str.isdigit() or not end_str.isdigit():
                    logger.warning("storage_content_range_invalid", operation="upload", reason="values")
                    return False

                start = int(start_str)
                end = int(end_str)  # end is typically inclusive in HTTP ranges

                logger.debug("storage_content_range_parsed", operation="upload", start=start, end=end)

                # Create directory if it doesn't exist
                target_dir = os.path.join(self.config.path, storage_folder_path)
                os.makedirs(target_dir, exist_ok=True)

                target_path = os.path.join(target_dir, alternative)

                # Read the chunk from source file
                with open(local_path, "rb") as f:
                    # For chunked uploads, local_path contains only the chunk data
                    # We should read from the beginning of the file, not seek to start position
                    chunk = f.read()
                    logger.debug("storage_chunk_read", operation="upload", byte_count=len(chunk))

                    if len(chunk) == 0:
                        logger.warning("storage_chunk_empty", operation="upload")
                        return False

                # Write the chunk to the target file at the correct position
                if not os.path.exists(target_path):
                    # For new files, we need to determine the total file size from Content-Range
                    # Extract total size from "bytes start-end/total" format
                    total_size = None
                    if "/" in content_range:
                        total_part = content_range.split("/")[1]
                        if total_part.isdigit():
                            total_size = int(total_part)
                            logger.debug("storage_total_size_detected", operation="upload", total_size=total_size)

                    if total_size:
                        # Create file with correct size (pre-allocate)
                        logger.debug("storage_file_preallocated", operation="upload", total_size=total_size)
                        with open(target_path, "wb") as f_out:
                            f_out.seek(total_size - 1)
                            f_out.write(b"\0")  # Write a null byte at the end
                            f_out.flush()
                            os.fsync(f_out.fileno())
                    else:
                        # No total size available, create empty file and let it grow
                        logger.debug("storage_file_created", operation="upload", reason="missing_total_size")
                        with open(target_path, "wb") as f_out:
                            pass  # Just create the file

                # Now write the chunk at the correct position
                with open(target_path, "r+b") as f_out:
                    f_out.seek(start)
                    f_out.write(chunk)
                    f_out.flush()
                    os.fsync(f_out.fileno())
                    logger.debug("storage_chunk_written", operation="upload", byte_count=len(chunk), start=start)

                    # Check and log current file size
                    current_size = f_out.tell()
                    f_out.seek(0, 2)  # Seek to end
                    actual_size = f_out.tell()
                    logger.debug("storage_file_size_checked", operation="upload", position=current_size, actual_size=actual_size)

            except (ValueError, IndexError, OSError) as e:
                logger.exception("storage_content_range_failed", operation="upload", error_type=type(e).__name__)
                return False
            else:
                logger.info("storage_chunk_upload_complete", operation="upload", start=start, end=end)
                return True

        # check that the storage file does not exist
        if self.exists_in_storage(storage_folder_path=storage_folder_path, alternative=alternative):
            if force:
                logger.warning(
                    dedent(
                        "LocalStorage.upload: storage file already exists,\
                          but force is set to True, so we will overwrite it"
                    )
                )
            else:
                logger.warning("storage_file_exists", operation="upload")
                return False

        # create the folder if necessary
        os.makedirs(self.config.path + "/" + storage_folder_path, exist_ok=True)

        # copy the file to the local storage
        shutil.copyfile(
            local_path,
            self.config.path + "/" + storage_folder_path + "/" + alternative,
        )

        return True

    def download(  #
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        local_path: str | None = None,
        force: bool = False,
    ) -> str | None:
        """
        Download a file from the storage
        """

        # check that the file exists in the local storage
        if not self.exists_in_storage(storage_folder_path=storage_folder_path, alternative=alternative):
            logger.warning("storage_file_missing", operation="download")
            return None

        # check that the local file does not exist
        if local_path:
            if self.exists_locally(local_path):
                if force:
                    logger.warning(
                        dedent(
                            "LocalStorage.download: local file already exists,\
                              but force is set to True, so we will overwrite it: "
                            + local_path,
                        )
                    )
                else:
                    logger.warning("storage_local_file_exists", operation="download")
                    return local_path
        else:
            local_path = self.get_temporary_local_path()

        # copy the file to the local storage
        shutil.copyfile(self.config.path + "/" + storage_folder_path + "/" + alternative, local_path)

        return local_path

    def get_download_url(
        self,
        *,
        file_id: str,
        storage_folder_path: str,
        alternative: str = "original",
        download: bool = False,
        filename: str | None = None,
    ) -> tuple[str, float] | None:
        """
        Read the local file and return a base64 string
        """

        # check that the file exists in the local storage
        if not self.exists_in_storage(storage_folder_path=storage_folder_path, alternative=alternative):
            logger.warning("storage_file_missing", operation="get_download_url")
            return None

        if download:
            # read-from-local reads `filename` off the query string, so carry the caller's name
            # across the redirect or the browser falls back to the stored name.
            name_query = ("&filename=" + quote(filename)) if filename else ""
            return (
                ("/api/files/storage/read-from-local/" + file_id + "/" + alternative + "?download=true" + name_query),
                60 * 60 * 24,  # 24 hours
            )

        return (
            ("/api/files/storage/read-from-local/" + file_id + "/" + alternative + "?download=false"),
            60 * 60 * 24,  # 24 hours
        )

    def get_first_bytes(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        size: int = 128,
    ) -> bytes:
        """
        Get the first bytes of a file in the storage
        """

        # get the first bytes of the file in the local storage
        with open(self.config.path + "/" + storage_folder_path + "/" + alternative, "rb") as f:
            return f.read(size)

    def get_bytes_range(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        start: int = 0,
        end: int = 0,
        blob: typing.Any = None,
    ) -> tuple[typing.Any | None, bytes | None, bool | None]:
        """
        Get the bytes range of a file in the storage
        """

        blob = None  # stays at None for this local storage
        bytes_range = None
        end_reached = None

        # check that the file exists in the local storage
        if not self.exists_in_storage(storage_folder_path=storage_folder_path, alternative=alternative):
            logger.warning("storage_file_missing", operation="get_bytes_range")
            return blob, bytes_range, end_reached

        # get the bytes range of the file in the local storage
        with open(self.config.path + "/" + storage_folder_path + "/" + alternative, "rb") as f:
            f.seek(start)
            bytes_range = f.read(end - start)
            end_reached = f.tell() < end
            if end_reached:
                logger.debug("storage_bytes_range_end_reached", position=f.tell(), end=end)
            return blob, bytes_range, end_reached

    def get_files_in_folder(
        self,
        *,
        storage_folder_path: str,
    ) -> list[str]:
        """
        Get a list of files in a folder in the storage
        """
        try:
            return os.listdir(self.config.path + "/" + storage_folder_path)
        except FileNotFoundError:
            return []
