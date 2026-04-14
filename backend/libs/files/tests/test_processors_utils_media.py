import json
from types import SimpleNamespace
from unittest.mock import patch

from libs.files.processors.utils.media import analyze_local_file_with_ffprobe, get_video_duration_with_ffmpeg_null


def test_analyze_local_file_with_ffprobe_reads_audio_and_video_data():
    payload = {
        "format": {"duration": "12.34"},
        "streams": [
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "44100",
                "channels": 2,
                "channel_layout": "stereo",
                "bits_per_raw_sample": "16",
                "bit_rate": "128000",
            },
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
                "disposition": {"attached_pic": 0},
            },
        ],
    }
    completed = SimpleNamespace(stdout=json.dumps(payload), stderr="")

    with patch("libs.files.processors.utils.media.subprocess.run", return_value=completed):
        result = analyze_local_file_with_ffprobe("video.mp4")

    assert result == {
        "kind_from_ffmpeg": "video",
        "has_video": True,
        "video_codec": "h264",
        "has_audio": True,
        "audio_codec": "aac",
        "duration": 12.34,
        "sample_rate": 44100,
        "channels": 2,
        "channel_layout": "stereo",
        "bit_depth": 16,
        "bit_rate": 128000.0,
        "width": 1920.0,
        "height": 1080.0,
    }


def test_analyze_local_file_with_ffprobe_uses_ffmpeg_null_for_missing_duration():
    payload = {"format": {}, "streams": [{"codec_type": "audio", "codec_name": "mp3"}]}
    completed = SimpleNamespace(stdout=json.dumps(payload), stderr="")

    with (
        patch("libs.files.processors.utils.media.subprocess.run", return_value=completed),
        patch("libs.files.processors.utils.media.get_video_duration_with_ffmpeg_null", return_value=7.5),
    ):
        result = analyze_local_file_with_ffprobe("audio.mp3")

    assert result["duration"] == 7.5
    assert result["kind_from_ffmpeg"] == "audio"


def test_analyze_local_file_with_ffprobe_returns_none_on_invalid_json():
    completed = SimpleNamespace(stdout="not-json", stderr="")
    with patch("libs.files.processors.utils.media.subprocess.run", return_value=completed):
        assert analyze_local_file_with_ffprobe("broken.bin") is None


def test_get_video_duration_with_ffmpeg_null_parses_duration():
    completed = SimpleNamespace(stdout="", stderr="Duration: 00:01:02.50")
    with patch("libs.files.processors.utils.media.subprocess.run", return_value=completed):
        assert get_video_duration_with_ffmpeg_null("video.mp4") == 62.5


def test_get_video_duration_with_ffmpeg_null_returns_none_without_duration():
    completed = SimpleNamespace(stdout="", stderr="no duration here")
    with patch("libs.files.processors.utils.media.subprocess.run", return_value=completed):
        assert get_video_duration_with_ffmpeg_null("video.mp4") is None


def test_get_video_duration_with_ffmpeg_null_returns_none_on_exception():
    with patch("libs.files.processors.utils.media.subprocess.run", side_effect=RuntimeError("boom")):
        assert get_video_duration_with_ffmpeg_null("video.mp4") is None
