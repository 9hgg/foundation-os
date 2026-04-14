import errno
import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from libs.files import constants
from libs.files.methods.basic import delete_local_file, download_locally, mkdir_p
from libs.files.methods.images import generate_square_centered_image
from libs.files.models import StorageSettings
from libs.files.seed import seed_file_settings
from libs.files.storage.local import LocalStorage
from libs.files.storage.methods import CACHED_STORAGE, get_file_storage, get_storage


def test_constants_expose_local_storage_defaults():
    assert constants.LOCAL_STORAGE_SETTINGS_ID == uuid.UUID("fe180252-e274-0be4-ebdf-54c5c5726245")
    assert constants.LOCAL_STORAGE_SETTINGS.kind == "local"
    assert constants.LOCAL_STORAGE_CONFIG.path.endswith("/storage")
    assert constants.LOCAL_STORAGE_SETTINGS.config["path"] == constants.LOCAL_STORAGE_CONFIG.path
    assert isinstance(constants.LOCAL_STORAGE, LocalStorage)


def test_mkdir_p_creates_nested_directory():
    with tempfile.TemporaryDirectory() as tmp_dir:
        nested_dir = Path(tmp_dir) / "a" / "b"
        mkdir_p(str(nested_dir))
        assert nested_dir.is_dir()


def test_mkdir_p_is_idempotent_for_existing_directory():
    with tempfile.TemporaryDirectory() as tmp_dir:
        existing_dir = Path(tmp_dir) / "existing"
        existing_dir.mkdir()
        mkdir_p(str(existing_dir))
        assert existing_dir.is_dir()


def test_mkdir_p_reraises_non_existing_oserror():
    with patch("libs.files.methods.basic.os.makedirs", side_effect=OSError(errno.EACCES, "forbidden")):
        with pytest.raises(OSError):
            mkdir_p("/tmp/forbidden")


def test_delete_local_file_deletes_file_and_closes_handle():
    handle, path = tempfile.mkstemp()
    assert delete_local_file(path, handle=handle) is True
    assert not Path(path).exists()


def test_delete_local_file_returns_false_on_failure():
    assert delete_local_file("/tmp/does-not-exist.txt") is False


def test_download_locally_returns_downloaded_path():
    def fake_urlretrieve(url, destination):
        Path(destination).write_text("downloaded")
        return destination, None

    with patch("libs.files.methods.basic.urllib.request.urlretrieve", side_effect=fake_urlretrieve):
        downloaded_path = download_locally("https://example.com/file.txt", "file.txt")

    assert downloaded_path is not None
    assert Path(downloaded_path).read_text() == "downloaded"
    Path(downloaded_path).unlink()


def test_download_locally_cleans_up_tmp_file_on_error():
    created_path = None
    original_mkstemp = tempfile.mkstemp

    def fake_mkstemp():
        nonlocal created_path
        handle, created_path = original_mkstemp()
        return handle, created_path

    with (
        patch("libs.files.methods.basic.tempfile.mkstemp", side_effect=fake_mkstemp),
        patch("libs.files.methods.basic.urllib.request.urlretrieve", side_effect=RuntimeError("boom")),
    ):
        downloaded_path = download_locally("https://example.com/file.txt", "file.txt")

    assert downloaded_path is None
    assert created_path is not None
    assert not Path(created_path).exists()


def test_generate_square_centered_image_returns_none_when_image_missing():
    with patch("libs.files.methods.images.cv2.imread", return_value=None):
        assert generate_square_centered_image("missing.jpg", "out.jpg") is None


def test_generate_square_centered_image_upscales_small_image():
    image = np.zeros((900, 1200, 3), dtype=np.uint8)

    with (
        patch("libs.files.methods.images.cv2.imread", return_value=image),
        patch("libs.files.methods.images.cv2.resize", side_effect=lambda img, size: np.zeros((size[1], size[0], 3), dtype=np.uint8)) as mock_resize,
        patch("libs.files.methods.images.cv2.imencode", return_value=(True, b"x" * 400_000)),
        patch("libs.files.methods.images.cv2.imwrite") as mock_imwrite,
    ):
        generate_square_centered_image("input.jpg", "output.jpg")

    mock_resize.assert_called_once()
    assert mock_resize.call_args.args[1] == (1400, 1400)
    assert mock_imwrite.call_args.args[0] == "output.jpg"
    assert mock_imwrite.call_args.args[2][1] == 100


def test_generate_square_centered_image_compresses_until_under_limit():
    image = np.zeros((1600, 1600, 3), dtype=np.uint8)

    with (
        patch("libs.files.methods.images.cv2.imread", return_value=image),
        patch("libs.files.methods.images.cv2.imencode", side_effect=[(True, b"x" * 600_000), (True, b"x" * 400_000)]),
        patch("libs.files.methods.images.cv2.imwrite") as mock_imwrite,
    ):
        generate_square_centered_image("input.jpg", "output.jpg")

    assert mock_imwrite.call_args.args[0] == "output.jpg"
    assert mock_imwrite.call_args.args[2][1] == 95


def test_get_storage_returns_local_storage():
    storage_settings = StorageSettings(id=uuid.uuid4(), name="local", kind="local", config={"path": "/tmp/storage"})
    storage = get_storage(storage_settings)
    assert isinstance(storage, LocalStorage)


def test_get_storage_raises_for_unknown_kind():
    storage_settings = StorageSettings(id=uuid.uuid4(), name="unknown", kind="nope", config={})
    with pytest.raises(Exception, match="Storage 'nope' not found"):
        get_storage(storage_settings)


def test_get_file_storage_uses_cache_before_db_lookup():
    storage_id = uuid.uuid4()
    cached_storage = MagicMock()
    CACHED_STORAGE[storage_id] = cached_storage

    try:
        with patch("libs.files.storage.methods.StorageSettings.by_id") as mock_by_id:
            assert get_file_storage(storage_id) is cached_storage
            mock_by_id.assert_not_called()
    finally:
        CACHED_STORAGE.clear()


def test_get_file_storage_loads_and_caches_storage():
    storage_id = uuid.uuid4()
    storage_settings = StorageSettings(id=storage_id, name="local", kind="local", config={"path": "/tmp/storage"})

    try:
        with patch("libs.files.storage.methods.StorageSettings.by_id", return_value=storage_settings):
            storage = get_file_storage(storage_id)
            assert isinstance(storage, LocalStorage)
            assert CACHED_STORAGE[storage_id] is storage
    finally:
        CACHED_STORAGE.clear()


def test_get_file_storage_raises_when_storage_is_missing():
    with patch("libs.files.storage.methods.StorageSettings.by_id", return_value=None):
        with pytest.raises(Exception, match="Storage not found"):
            get_file_storage(uuid.uuid4())


def test_seed_file_settings_creates_default_storage_when_missing():
    fake_db = MagicMock()

    with (
        patch("libs.files.seed.context_db") as mock_context_db,
        patch("libs.files.seed.StorageSettings.in_db", return_value=False),
        patch("libs.files.seed.StorageSettings.create") as mock_create,
    ):
        mock_context_db.return_value.__enter__.return_value = fake_db
        seed_file_settings()

    mock_create.assert_called_once_with(obj=constants.LOCAL_STORAGE_SETTINGS, _db=fake_db)


def test_seed_file_settings_skips_creation_when_already_seeded():
    fake_db = MagicMock()

    with (
        patch("libs.files.seed.context_db") as mock_context_db,
        patch("libs.files.seed.StorageSettings.in_db", return_value=True),
        patch("libs.files.seed.StorageSettings.create") as mock_create,
    ):
        mock_context_db.return_value.__enter__.return_value = fake_db
        seed_file_settings()

    mock_create.assert_not_called()
