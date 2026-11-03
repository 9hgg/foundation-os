import datetime
import uuid
from unittest.mock import MagicMock, patch

import pytest

from libs.files.methods.admin import NegativeFileAgeError, delete_files_not_in_storage


@patch("libs.files.methods.admin.context_db")
def test_delete_files_not_in_storage_deletes_each_file_and_cleans_up(
    mock_context_db,
):
    file_id_a, file_id_b = uuid.uuid4(), uuid.uuid4()
    mock_session = MagicMock()
    candidate_query = MagicMock()
    candidate_query.filter.return_value = candidate_query
    candidate_query.all.return_value = [(file_id_a,), (file_id_b,)]
    mock_session.query.side_effect = [candidate_query, MagicMock(), MagicMock(), MagicMock()]
    mock_context_db.return_value.__enter__.return_value = mock_session

    deleted_count = delete_files_not_in_storage(
        older_than=datetime.timedelta(hours=1),
        now=datetime.datetime(2026, 8, 2, tzinfo=datetime.UTC),
    )

    assert deleted_count == 2
    assert mock_session.query.call_count == 4
    assert mock_session.commit.call_count == 1


@patch("libs.files.methods.admin.context_db")
def test_delete_files_not_in_storage_returns_zero_for_none_found(mock_context_db):
    mock_session = MagicMock()
    candidate_query = MagicMock()
    candidate_query.filter.return_value = candidate_query
    candidate_query.all.return_value = []
    mock_session.query.return_value = candidate_query
    mock_context_db.return_value.__enter__.return_value = mock_session

    assert delete_files_not_in_storage() == 0
    mock_session.commit.assert_not_called()


@patch("libs.files.methods.admin.context_db")
def test_delete_files_not_in_storage_dry_run_does_not_delete(mock_context_db):
    mock_session = MagicMock()
    candidate_query = MagicMock()
    candidate_query.filter.return_value = candidate_query
    candidate_query.all.return_value = [(uuid.uuid4(),)]
    mock_session.query.return_value = candidate_query
    mock_context_db.return_value.__enter__.return_value = mock_session

    assert delete_files_not_in_storage(dry_run=True) == 1
    assert mock_session.query.call_count == 1
    mock_session.commit.assert_not_called()


def test_delete_files_not_in_storage_rejects_negative_age():
    with pytest.raises(NegativeFileAgeError):
        delete_files_not_in_storage(older_than=datetime.timedelta(seconds=-1))
