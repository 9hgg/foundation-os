"""What a downloaded file is called.

The "original" alternative is stored as a placeholder: empty extension, octet-stream mime. It
must never win over what the file record knows, or a download arrives with no extension and no
type -- which is what happened once callers began naming downloads after the question they answer
instead of letting the stored filename through.
"""

from types import SimpleNamespace

import pytest

from libs.files.storage.methods import describe_alternative, named_with_extension, sanitized_download_name


@pytest.mark.parametrize(
    ("file_name", "extension", "expected"),
    [
        ("Tell us about yourself", ".webm", "Tell us about yourself.webm"),
        ("Tell us about yourself", "webm", "Tell us about yourself.webm"),
        # Already named: nothing doubled.
        ("recording.webm", ".webm", "recording.webm"),
        ("RECORDING.WEBM", ".webm", "RECORDING.WEBM"),
        # Nothing known about the format: leave the name alone rather than invent a dot.
        ("recording", "", "recording"),
        # A different extension is appended, not swapped -- transcodes name themselves.
        ("recording.webm", ".mp4", "recording.webm.mp4"),
    ],
)
def test_named_with_extension(file_name, extension, expected):
    assert named_with_extension(file_name, extension) == expected


def test_an_empty_extension_no_longer_swallows_the_append():
    """`"anything".endswith("")` is True, which is how this went unnoticed."""
    assert named_with_extension("answer", "") == "answer"
    assert named_with_extension("answer", ".mov") == "answer.mov"


def _file(extension=".webm", mime="video/webm"):
    return SimpleNamespace(extension=extension, extension_client=None, mime=mime, mime_client=None)


def _alternative(extension, mime):
    return SimpleNamespace(extension=extension, mime=mime)


def test_the_original_is_described_by_the_file_record():
    """Its own record holds the presigned URL cache, not a format: empty extension, octet-stream."""
    placeholder = _alternative("", "application/octet-stream")

    assert describe_alternative(_file(), "original", placeholder) == ("video/webm", ".webm")


def test_a_transcode_is_described_by_its_own_record():
    """The file record still describes the original, so reading it would call an mp4 ".webm"."""
    transcode = _alternative(".mp4", "video/mp4")

    assert describe_alternative(_file(), "default", transcode) == ("video/mp4", ".mp4")


def test_an_unregistered_alternative_is_left_unnamed():
    """A nameless download beats one labelled with the original's extension."""
    assert describe_alternative(_file(), "default", None) == ("application/octet-stream", "")


def test_an_original_with_no_alternative_record_still_uses_the_file():
    assert describe_alternative(_file(), "original", None) == ("video/webm", ".webm")


def test_a_discovered_transcode_is_not_stamped_with_the_original_format():
    assert describe_alternative(_file(), "default", None) == ("application/octet-stream", "")
    assert describe_alternative(_file(), "thumbnail", None) == ("application/octet-stream", "")


def test_a_long_name_keeps_its_extension():
    long_question = "Ou habitez-vous et pourquoi " + "a" * 120 + ".webm"

    trimmed = sanitized_download_name(long_question)

    assert len(trimmed) == 120
    assert trimmed.endswith(".webm")


def test_accents_come_back_composed():
    decomposed = "Où habitez-vous.webm"

    assert sanitized_download_name(decomposed) == "Où habitez-vous.webm"


def test_a_name_that_fits_is_left_alone():
    assert sanitized_download_name("answer.webm") == "answer.webm"


def test_quotes_and_newlines_cannot_break_out_of_the_header():
    assert sanitized_download_name('an"swer\r\n.webm') == "answer.webm"


def test_nothing_left_after_cleaning_is_no_name_at_all():
    assert sanitized_download_name('  "" ') is None


def test_the_original_type_never_comes_from_the_placeholder():
    """What HEAD answers with: 768 originals in production are recorded as octet-stream."""
    placeholder = _alternative("", "application/octet-stream")

    mime, _extension = describe_alternative(_file(), "original", placeholder)

    assert mime == "video/webm"
