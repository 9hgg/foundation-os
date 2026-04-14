from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from libs.files.models import File
from libs.files.processors._generic import GenericProcessor, NoLocalPathError, NoStorageAvailableError, NoStorageFolderPathError
from libs.files.storage import GenericStorage


class DemoProcessor(GenericProcessor):
    def generate_alternatives(self, *, force: bool = False):
        return []

    def generate_extra_data(self, *, force: bool = False):
        return None


@pytest.fixture
def mock_file():
    file_db = MagicMock(spec=File)
    file_db.storage_id = None
    file_db.storage_folder_path = "files/1"
    file_db.extension = ".txt"
    file_db.extension_client = ".txt"
    return file_db


def test_get_storage_returns_none_without_storage_id(mock_file):
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    processor.storage = None
    assert processor.get_storage() is None


def test_get_storage_loads_and_caches_storage(mock_file):
    mock_file.storage_id = "storage-id"
    storage = MagicMock(spec=GenericStorage)
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    processor.storage = None

    with patch("libs.files.processors._generic.get_file_storage", return_value=storage) as mock_get_storage:
        assert processor.get_storage() is storage
        assert processor.get_storage() is storage

    mock_get_storage.assert_called_once_with("storage-id", _db=None)


def test_download_file_returns_existing_local_path_when_already_downloaded(mock_file):
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    processor.file_downloaded = True
    processor.local_path = "/tmp/already.txt"
    assert processor.download_file() == "/tmp/already.txt"


def test_download_file_downloads_and_marks_local_file(mock_file, tmp_path):
    storage = MagicMock(spec=GenericStorage)
    storage.get_temporary_local_path.return_value = str(tmp_path / "download.txt")
    storage.get_original_alternative.return_value = "original"
    storage.download.return_value = str(tmp_path / "download.txt")

    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    processor.file_downloaded = False
    processor.local_path = None
    processor.storage = storage

    assert processor.download_file() == str(tmp_path / "download.txt")
    assert processor.file_downloaded is True
    assert processor.local_path == str(tmp_path / "download.txt")


def test_download_file_returns_none_without_folder_path(mock_file):
    storage = MagicMock(spec=GenericStorage)
    processor = object.__new__(DemoProcessor)
    mock_file.storage_folder_path = None
    processor.file_db = mock_file
    processor.file_downloaded = False
    processor.local_path = None
    processor.storage = storage
    assert processor.download_file() is None


def test_download_file_returns_none_without_original_alternative(mock_file, tmp_path):
    storage = MagicMock(spec=GenericStorage)
    storage.get_temporary_local_path.return_value = str(tmp_path / "download.txt")
    storage.get_original_alternative.return_value = None
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    processor.file_downloaded = False
    processor.local_path = None
    processor.storage = storage
    assert processor.download_file() is None


def test_download_file_returns_none_when_download_fails(mock_file, tmp_path):
    storage = MagicMock(spec=GenericStorage)
    storage.get_temporary_local_path.return_value = str(tmp_path / "download.txt")
    storage.get_original_alternative.return_value = "original"
    storage.download.return_value = None
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    processor.file_downloaded = False
    processor.local_path = None
    processor.storage = storage
    assert processor.download_file() is None


def test_clear_local_file_deletes_downloaded_file(tmp_path, mock_file):
    path = tmp_path / "download.txt"
    path.write_text("hello")
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    processor.local_path = str(path)
    processor.file_downloaded = True
    processor.clear_local_file()
    assert not path.exists()
    assert processor.local_path is None
    assert processor.file_downloaded is False


def test_get_storage_details_raises_when_local_path_missing(mock_file):
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    with patch.object(DemoProcessor, "download_file", return_value=None):
        with pytest.raises(NoLocalPathError):
            processor.get_storage_details()


def test_get_storage_details_raises_when_storage_missing(mock_file):
    processor = object.__new__(DemoProcessor)
    processor.file_db = mock_file
    with (
        patch.object(DemoProcessor, "download_file", return_value="/tmp/file.txt"),
        patch.object(DemoProcessor, "get_storage", return_value=None),
    ):
        with pytest.raises(NoStorageAvailableError):
            processor.get_storage_details()


def test_get_storage_details_raises_when_storage_folder_path_missing(mock_file):
    processor = object.__new__(DemoProcessor)
    mock_file.storage_folder_path = None
    storage = MagicMock(spec=GenericStorage)
    processor.file_db = mock_file
    with (
        patch.object(DemoProcessor, "download_file", return_value="/tmp/file.txt"),
        patch.object(DemoProcessor, "get_storage", return_value=storage),
    ):
        with pytest.raises(NoStorageFolderPathError):
            processor.get_storage_details()
