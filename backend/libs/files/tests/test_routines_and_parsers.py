import json
import runpy
import uuid
from unittest.mock import MagicMock, call, patch

import pytest

from libs.files.processors.magic_bytes.codec_to_extension import recommend_extension
from libs.files.processors.magic_bytes.ffprobe_parser import analyze_ffprobe_output
from libs.files.processors.magic_bytes.parser import get_possible_types
from libs.files.processors.text import TextProcessor


def test_text_processor_kind():
    assert TextProcessor.__kind__ == "text"


def test_recommend_extension_prefers_audio_only_container():
    assert recommend_extension(video_codec=None, audio_codec="mp3") in {"mp3", "webm", "mp4", "mkv", "mov", "avi"}


def test_recommend_extension_prefers_video_only_container():
    assert recommend_extension(video_codec="h.264", audio_codec=None) in {"mp4", "mkv", "mov", "flv", "avi", "ts", "3gp"}


def test_recommend_extension_finds_common_container():
    assert recommend_extension(video_codec="h.264", audio_codec="aac") in {"mp4", "mkv", "mov", "flv", "3gp"}


def test_recommend_extension_returns_none_when_no_codec():
    assert recommend_extension(video_codec=None, audio_codec=None) is None


def test_recommend_extension_returns_none_when_no_common_container():
    assert recommend_extension(video_codec="wmv", audio_codec="opus") is None


def test_get_possible_types_requires_exactly_one_input():
    with pytest.raises(ValueError, match="both None"):
        get_possible_types()

    with pytest.raises(ValueError, match="both not None"):
        get_possible_types(path="x", first_bytes=b"y")


def test_get_possible_types_reads_from_bytes_for_known_signature():
    matches = get_possible_types(first_bytes=b"\xFF\xD8\xFF\xE0" + b"\x00" * 124)
    assert any(file_type.type == "image" for file_type in matches)


def test_get_possible_types_reads_from_file(tmp_path):
    file_path = tmp_path / "sample.jpg"
    file_path.write_bytes(b"\xFF\xD8\xFF\xE0" + b"\x00" * 124)
    matches = get_possible_types(path=str(file_path))
    assert any(file_type.type == "image" for file_type in matches)


def test_analyze_ffprobe_output_detects_video_and_audio():
    payload = {
        "streams": [
            {"codec_type": "audio", "codec_name": "aac"},
            {"codec_type": "video", "codec_name": "h264", "disposition": {"attached_pic": 0}},
        ]
    }
    result = analyze_ffprobe_output(json.dumps(payload).encode())
    assert result == {
        "kind_from_ffmpeg": "video",
        "has_video": True,
        "video_codec": "h264",
        "has_audio": True,
        "audio_codec": "aac",
    }


def test_analyze_ffprobe_output_ignores_attached_pictures():
    payload = {
        "streams": [
            {"codec_type": "audio", "codec_name": "mp3"},
            {"codec_type": "video", "codec_name": "png", "disposition": {"attached_pic": 1}},
        ]
    }
    result = analyze_ffprobe_output(json.dumps(payload).encode())
    assert result["kind_from_ffmpeg"] == "audio"
    assert result["has_video"] is False
    assert result["audio_codec"] == "mp3"


def test_analyze_ffprobe_output_returns_none_on_invalid_json():
    assert analyze_ffprobe_output(b"not-json") is None


def test_routine_fill_files_details_runs_task_for_each_file():
    file_ids = [(uuid.uuid4(),), (uuid.uuid4(),)]
    fake_db = MagicMock()
    fake_db.query.return_value.where.return_value.all.return_value = file_ids

    with (
        patch("libs.db.context_db") as mock_context_db,
        patch("libs.files.tasks.fill_file_details") as mock_fill_file_details,
        patch("signal.signal"),
    ):
        mock_context_db.return_value.__enter__.return_value = fake_db
        runpy.run_module("libs.files.routines.routine_fill_files_details", run_name="__main__")

    mock_fill_file_details.assert_any_call(None, file_ids[0][0])
    mock_fill_file_details.assert_any_call(None, file_ids[1][0])
    assert mock_fill_file_details.call_count == 2


def test_routine_fill_files_details_exits_gracefully_when_shutdown():
    file_ids = [(uuid.uuid4(),), (uuid.uuid4(),)]
    fake_db = MagicMock()
    fake_db.query.return_value.where.return_value.all.return_value = file_ids
    registered_handler = None

    def capture_signal(_sig, handler):
        nonlocal registered_handler
        registered_handler = handler

    def stop_after_first(*args, **kwargs):
        assert registered_handler is not None
        registered_handler(None, None)

    with (
        patch("libs.db.context_db") as mock_context_db,
        patch("libs.files.tasks.fill_file_details", side_effect=stop_after_first) as mock_fill_file_details,
        patch("signal.signal", side_effect=capture_signal),
        patch("builtins.exit", side_effect=SystemExit) as mock_exit,
    ):
        mock_context_db.return_value.__enter__.return_value = fake_db
        with pytest.raises(SystemExit):
            runpy.run_module("libs.files.routines.routine_fill_files_details", run_name="__main__")

    mock_fill_file_details.assert_called_once_with(None, file_ids[0][0])
    mock_exit.assert_called_once_with(0)


def test_routine_generate_files_alternatives_runs_task_for_each_file():
    file_ids = [(uuid.uuid4(),), (uuid.uuid4(),)]
    fake_db = MagicMock()
    fake_db.query.return_value.all.return_value = file_ids

    with (
        patch("libs.db.context_db") as mock_context_db,
        patch("libs.files.tasks.generate_file_alternatives") as mock_generate_file_alternatives,
        patch("signal.signal"),
    ):
        mock_context_db.return_value.__enter__.return_value = fake_db
        runpy.run_module("libs.files.routines.routine_generate_files_alternatives", run_name="__main__")

    mock_generate_file_alternatives.assert_any_call(None, file_ids[0][0])
    mock_generate_file_alternatives.assert_any_call(None, file_ids[1][0])
    assert mock_generate_file_alternatives.call_count == 2


def test_routine_generate_files_alternatives_exits_gracefully_when_shutdown():
    file_ids = [(uuid.uuid4(),), (uuid.uuid4(),)]
    fake_db = MagicMock()
    fake_db.query.return_value.all.return_value = file_ids
    registered_handler = None

    def capture_signal(_sig, handler):
        nonlocal registered_handler
        registered_handler = handler

    def stop_after_first(*args, **kwargs):
        assert registered_handler is not None
        registered_handler(None, None)

    with (
        patch("libs.db.context_db") as mock_context_db,
        patch("libs.files.tasks.generate_file_alternatives", side_effect=stop_after_first) as mock_generate_file_alternatives,
        patch("signal.signal", side_effect=capture_signal),
        patch("builtins.exit", side_effect=SystemExit) as mock_exit,
    ):
        mock_context_db.return_value.__enter__.return_value = fake_db
        with pytest.raises(SystemExit):
            runpy.run_module("libs.files.routines.routine_generate_files_alternatives", run_name="__main__")

    mock_generate_file_alternatives.assert_called_once_with(None, file_ids[0][0])
    mock_exit.assert_called_once_with(0)


def test_file_hash_backfill_is_preview_only_by_default():
    from libs.files.routines.routine_backfill_file_hashes import backfill_file_hashes

    missing_id = uuid.uuid4()
    existing_id = uuid.uuid4()
    with (
        patch(
            "libs.files.routines.routine_backfill_file_hashes._fetch_file_batch",
            side_effect=[
                [(missing_id, None), (existing_id, "already-hashed")],
                [],
            ],
        ) as mock_fetch_batch,
        patch("libs.files.routines.routine_backfill_file_hashes.fill_file_hash") as mock_fill_file_hash,
    ):
        assert backfill_file_hashes() == (1, 0)

    mock_fill_file_hash.assert_not_called()
    assert mock_fetch_batch.call_args_list == [
        call(after_id=None, batch_size=500),
        call(after_id=existing_id, batch_size=500),
    ]


def test_file_hash_backfill_fetches_bounded_pages_in_short_db_contexts():
    from libs.files.routines.routine_backfill_file_hashes import _fetch_file_batch

    after_id = uuid.uuid4()
    expected_rows = [(uuid.uuid4(), {})]
    context_manager = MagicMock()
    db = context_manager.__enter__.return_value
    base_query = db.query.return_value
    in_storage_query = base_query.filter.return_value
    cursor_query = in_storage_query.filter.return_value
    ordered_query = cursor_query.order_by.return_value
    limited_query = ordered_query.limit.return_value
    limited_query.all.return_value = expected_rows

    with patch(
        "libs.files.routines.routine_backfill_file_hashes.context_db",
        return_value=context_manager,
    ):
        assert _fetch_file_batch(after_id=after_id, batch_size=25) == expected_rows

    base_query.filter.assert_called_once()
    in_storage_query.filter.assert_called_once()
    ordered_query.limit.assert_called_once_with(25)
    limited_query.all.assert_called_once_with()
    context_manager.__exit__.assert_called_once()


def test_file_hash_backfill_processes_only_missing_hashes_when_applied():
    from libs.files.routines.routine_backfill_file_hashes import backfill_file_hashes

    missing_id = uuid.uuid4()
    existing_id = uuid.uuid4()
    with (
        patch(
            "libs.files.routines.routine_backfill_file_hashes._fetch_file_batch",
            side_effect=[
                [(missing_id, None), (existing_id, "already-hashed")],
                [],
            ],
        ),
        patch(
            "libs.files.routines.routine_backfill_file_hashes.fill_file_hash",
            return_value="new-hash",
        ) as mock_fill_file_hash,
    ):
        assert backfill_file_hashes(apply=True) == (1, 1)

    mock_fill_file_hash.assert_called_once_with(missing_id)


def test_file_hash_backfill_continues_after_unreadable_file():
    from libs.files.routines.routine_backfill_file_hashes import backfill_file_hashes

    unreadable_id = uuid.uuid4()
    readable_id = uuid.uuid4()
    with (
        patch(
            "libs.files.routines.routine_backfill_file_hashes._fetch_file_batch",
            side_effect=[[(unreadable_id, None), (readable_id, None)], []],
        ),
        patch(
            "libs.files.routines.routine_backfill_file_hashes.fill_file_hash",
            side_effect=[OSError("storage object missing"), "new-hash"],
        ) as mock_fill_file_hash,
        patch("libs.files.routines.routine_backfill_file_hashes.logger") as mock_logger,
    ):
        assert backfill_file_hashes(apply=True) == (2, 1)

    assert mock_fill_file_hash.call_args_list == [
        call(unreadable_id),
        call(readable_id),
    ]
    mock_logger.exception.assert_called_once_with(
        "file_hash_backfill_file_failed",
        file_id=str(unreadable_id),
    )
