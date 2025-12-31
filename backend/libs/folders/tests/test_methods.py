import pytest
import uuid
from unittest.mock import MagicMock, patch
from libs.folders.methods import add_to_folder, remove_from_folder, get_folder_children, share_folder_with
from libs.folders.models import Folder, FolderToResource
from libs.acl.models import Who


@pytest.fixture
def mock_db():
    with patch("libs.folders.methods.context_db") as mock_ctx:
        db = MagicMock()
        mock_ctx.return_value.__enter__.return_value = db
        yield db


def test_add_to_folder(mock_db):
    folder_id = uuid.uuid4()
    resource = MagicMock()
    resource.id = uuid.uuid4()
    resource.__kind__ = "test_kind"

    # Case 1: Already in folder
    mock_db.query.return_value.filter.return_value.first.return_value = True
    add_to_folder(folder_id=folder_id, resource=resource)
    mock_db.add.assert_not_called()

    # Case 2: Not in folder
    mock_db.query.return_value.filter.return_value.first.return_value = None
    add_to_folder(folder_id=folder_id, resource=resource)
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


def test_remove_from_folder(mock_db):
    folder_id = uuid.uuid4()
    resource = MagicMock()
    resource.id = uuid.uuid4()
    resource.__kind__ = "test_kind"

    # Case 1: Exists
    relation = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = relation
    remove_from_folder(folder_id=folder_id, resource=resource)
    mock_db.delete.assert_called_once_with(relation)
    mock_db.commit.assert_called_once()

    # Case 2: Does not exist
    mock_db.reset_mock()
    mock_db.query.return_value.filter.return_value.first.return_value = None
    remove_from_folder(folder_id=folder_id, resource=resource)
    mock_db.delete.assert_not_called()


def test_get_folder_children(mock_db):
    folder_id = uuid.uuid4()
    children = [MagicMock(), MagicMock()]
    mock_db.query.return_value.filter.return_value.all.return_value = children

    result = get_folder_children(folder_id=folder_id)
    assert result == children


@patch("libs.folders.methods.create_default_acls_by_id")
def test_share_folder_with(mock_create_acls):
    folder_id = uuid.uuid4()
    who_id = uuid.uuid4()

    share_folder_with(folder_id=folder_id, who=Who.user, who_id=who_id)

    mock_create_acls.assert_called_once_with(
        resource_id=folder_id,
        resource_kind=Folder.__kind__,
        who=Who.user,
        who_id=who_id,
        create_read_acl=True,
        create_write_acl=True,
        create_delete_acl=True,
    )
