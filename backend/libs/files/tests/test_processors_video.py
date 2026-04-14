import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from libs.files.models import ExtraDetailsFile, File, FileAlternative
from libs.files.processors._generic import NoStorageAvailableError
from libs.files.processors.video import VideoProcessor
from libs.files.storage import GenericStorage


@pytest.fixture
def mock_storage():
    storage = MagicMock(spec=GenericStorage)
    storage.exists_in_storage.return_value = False
    storage.upload.return_value = True
    return storage


@pytest.fixture
def mock_file():
    file_db = MagicMock(spec=File)
    file_db.extra_ = ExtraDetailsFile()
    return file_db


@pytest.fixture
def sample_video_path(tmp_path):
    path = tmp_path / "sample.mp4"
    path.write_bytes(b"video")
    return str(path)


def _tmp_file_factory(tmp_path, suffix, content=b"data"):
    path = tmp_path / f"generated{suffix}"
    path.write_bytes(content)
    return str(path)


def test_generate_alternatives_collects_all_outputs(mock_storage, mock_file, sample_video_path, tmp_path):
    with (
        patch.object(VideoProcessor, "get_storage_details", return_value=(mock_storage, sample_video_path, "videos/1")),
        patch("libs.files.processors.video.GenericStorage.get_temporary_local_path", side_effect=lambda suffix: _tmp_file_factory(tmp_path, suffix)),
        patch("libs.files.processors.video.ffmpeg.input") as mock_input,
        patch("libs.files.processors.video.ffmpegio.transcode"),
        patch("libs.files.processors.video.FILES_SETTINGS", new=SimpleNamespace(WHISPER_PATH="/models")),
        patch("builtins.__import__") as mock_import,
    ):
        mock_input.return_value.output.return_value.run.return_value = None

        fake_segments = [
            SimpleNamespace(
                text="hello",
                start=0.0,
                end=1.0,
                avg_logprob=-0.1,
                words=[SimpleNamespace(start=0.0, end=0.5, word="hello", probability=0.9)],
            )
        ]
        fake_model = MagicMock()
        fake_model.transcribe.return_value = (fake_segments, MagicMock())

        real_import = __import__

        def import_side_effect(name, *args, **kwargs):
            if name == "faster_whisper":
                return SimpleNamespace(WhisperModel=MagicMock(return_value=fake_model))
            return real_import(name, *args, **kwargs)

        mock_import.side_effect = import_side_effect

        processor = VideoProcessor(file_db=mock_file)
        alternatives = processor.generate_alternatives(force=True)

    assert [alt.storage_suffix for alt in alternatives] == [
        "thumbnail",
        "default",
        "whisper_transcript_json",
        "whisper_transcript_srt",
    ]
    assert mock_storage.upload.call_count == 4


def test_generate_alternatives_skips_existing_files_when_not_forced(mock_storage, mock_file, sample_video_path):
    mock_storage.exists_in_storage.return_value = True

    with patch.object(VideoProcessor, "get_storage_details", return_value=(mock_storage, sample_video_path, "videos/1")):
        processor = VideoProcessor(file_db=mock_file)
        alternatives = processor.generate_alternatives(force=False)

    assert alternatives == []


def test_generate_alternatives_returns_empty_when_generation_fails(mock_storage, mock_file, sample_video_path, tmp_path):
    with (
        patch.object(VideoProcessor, "get_storage_details", return_value=(mock_storage, sample_video_path, "videos/1")),
        patch("libs.files.processors.video.GenericStorage.get_temporary_local_path", side_effect=lambda suffix: _tmp_file_factory(tmp_path, suffix)),
        patch("libs.files.processors.video.ffmpeg.input", side_effect=RuntimeError("thumbnail failed")),
        patch("libs.files.processors.video.ffmpegio.transcode", side_effect=RuntimeError("default failed")),
        patch("libs.files.processors.video.FILES_SETTINGS", new=SimpleNamespace(WHISPER_PATH="/models")),
        patch("builtins.__import__", side_effect=ImportError("no whisper")),
    ):
        processor = VideoProcessor(file_db=mock_file)
        alternatives = processor.generate_alternatives(force=True)

    assert alternatives == []


def test_generate_extra_data_uses_ffprobe_values(mock_storage, mock_file, sample_video_path):
    with (
        patch.object(VideoProcessor, "get_storage_details", return_value=(mock_storage, sample_video_path, "videos/1")),
        patch(
            "libs.files.processors.video.analyze_local_file_with_ffprobe",
            return_value={
                "duration": 12.3,
                "has_audio": True,
                "has_video": True,
                "video_codec": "h264",
                "audio_codec": "aac",
                "channels": 2,
                "height": 720,
                "width": 1280,
                "sample_rate": 44100,
            },
        ),
    ):
        processor = VideoProcessor(file_db=mock_file)
        extra = processor.generate_extra_data()

    assert extra.duration == 12.3
    assert extra.has_audio is True
    assert extra.has_video is True
    assert extra.codec_video == "h264"
    assert extra.codec_audio == "aac"
    assert extra.channels == 2
    assert extra.height == 720
    assert extra.width == 1280
    assert extra.sample_rate == 44100


def test_generate_extra_data_uses_flac_fallback_when_duration_missing(mock_storage, mock_file, sample_video_path, tmp_path):
    fallback_path = str(tmp_path / "fallback.flac")
    Path(fallback_path).write_bytes(b"flac")

    with (
        patch.object(VideoProcessor, "get_storage_details", return_value=(mock_storage, sample_video_path, "videos/1")),
        patch("libs.files.processors.video.GenericStorage.get_temporary_local_path", return_value=fallback_path),
        patch(
            "libs.files.processors.video.analyze_local_file_with_ffprobe",
            side_effect=[{"has_audio": True, "has_video": True}, {"duration": 45.6}],
        ),
        patch("libs.files.processors.video.ffmpegio.transcode") as mock_transcode,
    ):
        processor = VideoProcessor(file_db=mock_file)
        extra = processor.generate_extra_data()

    assert extra.duration == 45.6
    mock_transcode.assert_called_once()
    assert not os.path.exists(fallback_path)


def test_generate_extra_data_returns_none_when_fallback_transcode_fails(mock_storage, mock_file, sample_video_path, tmp_path):
    fallback_path = str(tmp_path / "fallback.flac")

    with (
        patch.object(VideoProcessor, "get_storage_details", return_value=(mock_storage, sample_video_path, "videos/1")),
        patch("libs.files.processors.video.GenericStorage.get_temporary_local_path", return_value=fallback_path),
        patch("libs.files.processors.video.analyze_local_file_with_ffprobe", return_value={"has_audio": True}),
        patch("libs.files.processors.video.ffmpegio.transcode", side_effect=RuntimeError("boom")),
    ):
        processor = VideoProcessor(file_db=mock_file)
        extra = processor.generate_extra_data()

    assert extra is None


def test_missing_storage_raises_error(mock_file):
    with patch.object(VideoProcessor, "get_storage_details", side_effect=NoStorageAvailableError()):
        with pytest.raises(NoStorageAvailableError):
            VideoProcessor(file_db=mock_file)
