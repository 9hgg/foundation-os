# Set env vars before test modules import application code with BaseSettings instances.
import os
import uuid
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")
os.environ.setdefault("APP_SECRET", "test_app_secret")
os.environ.setdefault("SENDER_EMAIL", "sender@example.com")
os.environ.setdefault("EMAIL_TEMPLATES_DIR", "/tmp/templates")
os.environ.setdefault("DEFAULT_STORAGE_ID", "00000000-0000-0000-0000-000000000000")
os.environ.setdefault("PADDLE_API_KEY", "test_paddle_key")
os.environ.setdefault("PADDLE_SANDBOX", "True")


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")
    monkeypatch.setenv("APP_SECRET", "test_app_secret")
    monkeypatch.setenv("SENDER_EMAIL", "sender@example.com")
    monkeypatch.setenv("EMAIL_TEMPLATES_DIR", "/tmp/templates")
    monkeypatch.setenv("DEFAULT_STORAGE_ID", "00000000-0000-0000-0000-000000000000")
    monkeypatch.setenv("PADDLE_API_KEY", "test_paddle_key")
    monkeypatch.setenv("PADDLE_SANDBOX", "True")




@pytest.fixture
def mock_file_storage():
    from libs.files.models import StorageSettings

    with patch("libs.files.api.get_file_storage") as mock:
        storage_mock = MagicMock()
        storage_mock.storage_settings = MagicMock(spec=StorageSettings)
        storage_mock.storage_settings.id = uuid.uuid4()
        storage_mock.get_upload_url.return_value = "http://upload-url"
        storage_mock.get_download_url.return_value = ("http://download-url", 3600)
        storage_mock.exists_in_storage.return_value = False
        storage_mock.get_original_alternative.return_value = "original"
        storage_mock.get_size.return_value = 1024
        storage_mock.upload.return_value = True
        storage_mock.storage_type = "local"
        storage_mock.config.path = "/tmp/storage"
        mock.return_value = storage_mock
        yield mock


@pytest.fixture
def mock_file_cls():
    from libs.files.models import File

    # Patch methods on the File class, not the class itself
    with (
        patch("libs.files.models.File.by_id") as mock_by_id,
        patch("libs.files.models.File.create") as mock_create,
        patch("libs.files.models.File.patch") as mock_patch,
    ):
        mock_by_id.return_value = None

        file_instance = File(
            id=uuid.uuid4(),
            storage_id=uuid.uuid4(),
            storage_folder_path="path/to/file",
            original_filename="test.jpg",
            public_filename="test.jpg",
            extension_client=".jpg",
            mime_client="image/jpeg",
            size_client=1024,
            in_storage=False,
        )
        mock_create.return_value = file_instance
        mock_patch.return_value = file_instance

        # Return a container with the mocks
        mocks = MagicMock()
        mocks.by_id = mock_by_id
        mocks.create = mock_create
        mocks.patch = mock_patch
        yield mocks


@pytest.fixture
def mock_folder_cls():
    from libs.folders.models import Folder

    with (
        patch("libs.folders.models.Folder.get_first_by") as mock_get_first_by,
        patch("libs.folders.models.Folder.create") as mock_create,
    ):
        mock_get_first_by.return_value = None
        folder_instance = Folder(id=uuid.uuid4(), name="folder")
        mock_create.return_value = folder_instance

        mocks = MagicMock()
        mocks.get_first_by = mock_get_first_by
        mocks.create = mock_create
        yield mocks


@pytest.fixture
def mock_tasks_manager():
    with patch("libs.files.api.TasksManager") as mock:
        mock.create_task.return_value = MagicMock(id=uuid.uuid4())
        yield mock


@pytest.fixture
def mock_context_db():
    with patch("libs.files.api.context_db") as mock:
        db_mock = MagicMock()
        mock.return_value.__enter__.return_value = db_mock
        yield mock


@pytest.fixture
def mock_create_default_acls():
    with patch("libs.files.api.create_default_acls") as mock:
        yield mock


@pytest.fixture
def mock_add_to_folder():
    with patch("libs.files.api.add_to_folder") as mock:
        yield mock


@pytest.fixture
def mock_user():
    from libs.users.models import User

    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "joris@example.com"
    return user


@pytest.fixture
def mock_session():
    from libs.sessions.models import AppSession

    session = MagicMock(spec=AppSession)
    session.id = uuid.uuid4()
    return session


@pytest.fixture
def mock_translator():
    translator = MagicMock()
    translator.translate.side_effect = lambda x: x
    return translator


@pytest.fixture
def mock_sync_launch_tasks_processing():
    with patch("libs.files.api.sync_launch_tasks_processing") as mock:
        yield mock
