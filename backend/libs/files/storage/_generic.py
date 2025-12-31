import os
import tempfile
import typing

from libs.logger import print
from libs.utils.types import PYDANTIC_BASE_CONFIG_DICT, BaseModelWithConfig

from ..models import StorageSettings

cwd = os.getcwd()


class GenericStorage(BaseModelWithConfig):
    """
    A file storage is a storage where a file is stored.
    It can be a local storage, a GCP bucket, an S3 bucket, ...
    """

    storage_type: str
    storage_settings: StorageSettings
    config: typing.Any  # the config of the storage

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # self.__config__.extra = Extra.allow

    model_config: typing.ClassVar[dict] = {
        **PYDANTIC_BASE_CONFIG_DICT,
        "extra": "allow",
    }

    def exists_in_storage(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
    ) -> bool:
        """
        Check if a file exists in the storage
        """
        raise NotImplementedError

    def download(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        local_path: str | None = None,
        force: bool = False,
    ) -> str | None:
        """
        Download a file from the storage to a local file
        """
        raise NotImplementedError

    def upload(
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
        Upload a local file to the storage
        """
        raise NotImplementedError

    def delete_in_storage(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        handle: int | None = None,
    ) -> bool:
        """
        Delete a file from the storage
        """
        raise NotImplementedError

    def get_download_url(
        self,
        *,
        file_id: str,
        storage_folder_path: str,
        alternative: str = "original",
        download: bool = False,
    ) -> tuple[str, float] | None:
        """
        Get the url of a file in the storage
        TODO: To think about, public ? private ? peremption ?
        """
        raise NotImplementedError

    def get_upload_url(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        content_type: str | None = None,
        origin: str | None = None,
    ) -> str | None:
        """
        Get the url to upload a file in the storage
        """
        raise NotImplementedError

    def get_size(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
    ) -> int:
        """
        Get the size of a file in the storage
        """
        raise NotImplementedError

    def get_first_bytes(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        size: int = 128,
    ) -> bytes | None:
        """
        Get the first bytes of a file in the storage
        """
        raise NotImplementedError

    def get_original_alternative(
        self,
        *,
        storage_folder_path: str,
    ) -> str | None:
        """
        Get either "original" (default) or
          "original-stream" (if original is not available in storage) or None
        """
        if self.exists_in_storage(storage_folder_path=storage_folder_path):
            return "original"
        if self.exists_in_storage(storage_folder_path=storage_folder_path, alternative="original-stream"):
            return "original-stream"
        # if self.exists_in_storage(storage_folder_path=storage_folder_path+"/original-chunked", alternative="original-stream"):
        #     can't be used as it must be merged before
        #     return "original-chunked"
        return None

    def get_bytes_range(
        self,
        *,
        storage_folder_path: str,
        alternative: str = "original",
        start: int = 0,
        end: int = 0,
        blob: typing.Any = None,
    ):
        """
        Get the bytes range of a file in the storage
        """
        raise NotImplementedError

    def get_files_in_folder(
        self,
        *,
        storage_folder_path: str,
    ) -> list[str]:
        """
        Get a list of files in a folder in the storage
        """
        raise NotImplementedError

    @staticmethod
    def get_temporary_local_path(prefix: str | None = None, suffix: str | None = None) -> str:
        """
        Get a temporary local path
        """
        (
            tmp_local_filename_original_handle,
            tmp_local_filename_original,
        ) = tempfile.mkstemp(prefix=prefix, suffix=suffix)
        os.close(tmp_local_filename_original_handle)  # Close the file descriptor (useful for Windows compatibility)
        return tmp_local_filename_original

    @staticmethod
    def delete_locally(local_path: str):
        """
        Clear a local path
        """
        try:
            print("delete_locally", local_path)
            os.remove(local_path)
        except Exception as e:
            print("delete_locally: error while deleting file", e)

    @staticmethod
    def exists_locally(local_path: str) -> bool:
        """
        Check if a local file exists
        """
        return os.path.exists(local_path)
