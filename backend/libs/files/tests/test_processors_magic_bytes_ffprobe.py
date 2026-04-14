from unittest.mock import MagicMock, patch

from libs.files.processors.magic_bytes.ffprobe_parser import get_possible_type_via_ffprobe


def test_get_possible_type_via_ffprobe_returns_video_from_forward_probe():
    storage = MagicMock()
    storage.get_size.return_value = 2048
    storage.get_bytes_range.return_value = (MagicMock(), b"chunk", False)

    with (
        patch("libs.files.processors.magic_bytes.ffprobe_parser.ffprobe_stream", return_value=(0, b"{}", b"")),
        patch(
            "libs.files.processors.magic_bytes.ffprobe_parser.analyze_ffprobe_output",
            return_value={"has_video": True, "has_audio": True},
        ),
    ):
        result = get_possible_type_via_ffprobe(storage, "folder")

    assert result == {"has_video": True, "has_audio": True}


def test_get_possible_type_via_ffprobe_returns_audio_from_backward_probe():
    storage = MagicMock()
    storage.get_size.return_value = 2048
    storage.get_bytes_range.side_effect = [
        (MagicMock(), b"chunk1", False),
        (MagicMock(), b"chunk2", False),
        (MagicMock(), b"chunk3", False),
    ]

    with (
        patch("libs.files.processors.magic_bytes.ffprobe_parser.ffprobe_stream", return_value=(0, b"{}", b"")),
        patch(
            "libs.files.processors.magic_bytes.ffprobe_parser.analyze_ffprobe_output",
            side_effect=[{"has_video": False, "has_audio": False}, {"has_video": False, "has_audio": True}],
        ),
    ):
        result = get_possible_type_via_ffprobe(storage, "folder")

    assert result == {"has_video": False, "has_audio": True}


def test_get_possible_type_via_ffprobe_returns_none_when_no_probe_data():
    storage = MagicMock()
    storage.get_size.return_value = 100

    def fake_get_bytes_range(*args, **kwargs):
        start = kwargs["start"]
        if start <= 0 and "blob" not in kwargs:
            return MagicMock(), b"chunk1", True
        if start <= 0 and "blob" in kwargs:
            return MagicMock(), None, True
        return MagicMock(), b"chunk", False

    storage.get_bytes_range.side_effect = fake_get_bytes_range

    with patch("libs.files.processors.magic_bytes.ffprobe_parser.ffprobe_stream", return_value=(1, b"", b"")):
        assert get_possible_type_via_ffprobe(storage, "folder") is None


def test_get_possible_type_via_ffprobe_returns_none_on_exception():
    storage = MagicMock()
    storage.get_size.return_value = 100
    storage.get_bytes_range.return_value = (MagicMock(), b"chunk", False)

    with patch("libs.files.processors.magic_bytes.ffprobe_parser.ffprobe_stream", side_effect=RuntimeError("boom")):
        assert get_possible_type_via_ffprobe(storage, "folder") is None
