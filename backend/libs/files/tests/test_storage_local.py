import os
import shutil
import tempfile
import pytest
from libs.files.storage.local import LocalStorage, LocalStorageConfig
from libs.files.models import StorageSettings


import uuid


@pytest.fixture
def local_storage():
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()

    # Create storage settings
    storage_settings = StorageSettings(
        id=uuid.uuid4(), name="Test Storage", kind="local", config={"path": temp_dir}, active=True
    )

    storage = LocalStorage(storage_settings=storage_settings)

    yield storage

    # Cleanup
    shutil.rmtree(temp_dir)


def test_local_storage_init(local_storage):
    assert os.path.exists(local_storage.config.path)
    assert local_storage.storage_type == "local"


def test_upload_and_exists(local_storage):
    # Create a dummy file
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"test content")
        local_path = f.name

    try:
        storage_folder_path = "folder1"
        alternative = "original"

        # Upload
        result = local_storage.upload(
            local_path=local_path, storage_folder_path=storage_folder_path, alternative=alternative
        )
        assert result is True

        # Check exists
        assert local_storage.exists_in_storage(storage_folder_path=storage_folder_path, alternative=alternative) is True

        # Check content
        uploaded_path = os.path.join(local_storage.config.path, storage_folder_path, alternative)
        with open(uploaded_path, "rb") as f:
            assert f.read() == b"test content"

    finally:
        os.remove(local_path)


def test_get_size(local_storage):
    # Create a dummy file
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"12345")
        local_path = f.name

    try:
        storage_folder_path = "folder_size"
        alternative = "original"

        local_storage.upload(local_path=local_path, storage_folder_path=storage_folder_path, alternative=alternative)

        size = local_storage.get_size(storage_folder_path=storage_folder_path, alternative=alternative)
        assert size == 5

        # Non-existent file
        assert local_storage.get_size(storage_folder_path="non_existent", alternative="original") == 0

    finally:
        os.remove(local_path)


def test_download(local_storage):
    # Create a dummy file
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"download me")
        local_path = f.name

    try:
        storage_folder_path = "folder_download"
        alternative = "original"

        local_storage.upload(local_path=local_path, storage_folder_path=storage_folder_path, alternative=alternative)

        # Download to new location
        download_path = os.path.join(tempfile.gettempdir(), "downloaded_file")
        if os.path.exists(download_path):
            os.remove(download_path)

        result_path = local_storage.download(
            storage_folder_path=storage_folder_path, alternative=alternative, local_path=download_path
        )

        assert result_path == download_path
        assert os.path.exists(download_path)
        with open(download_path, "rb") as f:
            assert f.read() == b"download me"

        # Cleanup download
        os.remove(download_path)

        # Download non-existent
        assert local_storage.download(storage_folder_path="non_existent") is None

    finally:
        os.remove(local_path)


def test_get_upload_url(local_storage):
    url = local_storage.get_upload_url(storage_folder_path="folder", alternative="alt", origin="http://localhost")
    assert url == "http://localhost/api/files/storage/upload/folder/alt"


def test_get_download_url(local_storage):
    # Create file first
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"content")
        local_path = f.name

    try:
        local_storage.upload(local_path=local_path, storage_folder_path="folder_url", alternative="original")

        url, ttl = local_storage.get_download_url(
            file_id="123", storage_folder_path="folder_url", alternative="original"
        )
        assert "/api/files/storage/read-from-local/123/original" in url
        assert ttl == 86400

        # Non-existent
        assert local_storage.get_download_url(file_id="123", storage_folder_path="non_existent") is None

    finally:
        os.remove(local_path)


def test_get_first_bytes(local_storage):
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"1234567890")
        local_path = f.name

    try:
        local_storage.upload(local_path=local_path, storage_folder_path="folder_bytes", alternative="original")

        bytes_read = local_storage.get_first_bytes(storage_folder_path="folder_bytes", size=5)
        assert bytes_read == b"12345"

    finally:
        os.remove(local_path)


def test_get_bytes_range(local_storage):
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"1234567890")
        local_path = f.name

    try:
        local_storage.upload(local_path=local_path, storage_folder_path="folder_range", alternative="original")

        blob, data, end_reached = local_storage.get_bytes_range(storage_folder_path="folder_range", start=2, end=5)
        assert data == b"345"
        assert end_reached is False

        blob, data, end_reached = local_storage.get_bytes_range(storage_folder_path="folder_range", start=8, end=12)
        assert data == b"90"
        assert end_reached is True

    finally:
        os.remove(local_path)


def test_get_files_in_folder(local_storage):
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"content")
        local_path = f.name

    try:
        local_storage.upload(local_path=local_path, storage_folder_path="folder_list", alternative="file1")
        local_storage.upload(local_path=local_path, storage_folder_path="folder_list", alternative="file2")

        files = local_storage.get_files_in_folder(storage_folder_path="folder_list")
        assert len(files) == 2
        assert "file1" in files
        assert "file2" in files

    finally:
        os.remove(local_path)
