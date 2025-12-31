import contextlib
import os

from sqlalchemy.orm import Session

from libs.files.storage import GenericStorage
from libs.logger import print, print_warning

from ..models import ExtraDetailsFile, File, FileAlternative
from ..storage import get_file_storage


class NoStorageAvailableError(Exception):
    def __init__(self):
        super().__init__("No storage available")


class NoStorageFolderPathError(Exception):
    def __init__(self):
        super().__init__("No storage folder path available")


class NoLocalPathError(Exception):
    def __init__(self):
        super().__init__("No local path available")


class GenericProcessor:
    __kind__ = "generic"

    file_db: File
    file_downloaded: bool = False

    local_path: str | None = None
    storage: GenericStorage | None = None
    storage_folder_path: str | None = None

    def __init__(self, *, file_db: File):
        self.file_db: File = file_db
        (
            self.storage,
            self.local_path,
            self.storage_folder_path,
        ) = self.get_storage_details()

    def generate_alternatives(self, *, force: bool = False) -> list[FileAlternative]:
        """
        Generate the alternative files
        """
        raise NotImplementedError

    def generate_extra_data(self, *, force: bool = False) -> ExtraDetailsFile | None:
        """
        Should generate a partial file extra data
        (like has_audio, has_video, duration)
        """
        raise NotImplementedError

    def get_storage(self, _db: Session | None = None) -> GenericStorage | None:
        if self.storage is not None:
            return self.storage

        if self.file_db.storage_id is None:
            print_warning("File has no storage")
            return None

        self.storage = get_file_storage(self.file_db.storage_id, _db=_db)

        return self.storage

    def download_file(self) -> str | None:
        if self.file_downloaded:
            return self.local_path

        storage = self.get_storage()
        if storage is None:
            return None

        if self.file_db.storage_folder_path is None:
            print_warning("File has no storage folder path")
            return None

        extension = self.file_db.extension

        if extension is None:
            extension = self.file_db.extension_client

        if extension is None:
            extension = ""

        download_path = storage.get_temporary_local_path(suffix=extension)

        alternative = storage.get_original_alternative(storage_folder_path=self.file_db.storage_folder_path)

        if alternative is None:
            print_warning("File has no original alternative")
            return None

        local_path = storage.download(
            storage_folder_path=self.file_db.storage_folder_path,
            alternative=alternative,
            local_path=download_path,
            force=True,
        )

        if local_path is None:
            print_warning("Error while downloading file")
            return None

        print("Downloaded file to:", local_path)
        self.file_downloaded = True
        self.local_path = local_path

        return local_path

    def clear_local_file(self):
        if self.local_path is not None:
            with contextlib.suppress(FileNotFoundError):
                os.remove(self.local_path)
            self.local_path = None
        self.file_downloaded = False

    def get_storage_details(self) -> tuple[GenericStorage, str, str]:
        # TODO: refactor processing tasks (and generate alternative and generate extra)
        # to only call this function once.
        local_path = self.download_file()
        if local_path is None:
            raise NoLocalPathError()
        storage = self.get_storage()
        if storage is None:
            raise NoStorageAvailableError()
        storage_folder_path = self.file_db.storage_folder_path
        if storage_folder_path is None:
            raise NoStorageFolderPathError()
        return storage, local_path, storage_folder_path
