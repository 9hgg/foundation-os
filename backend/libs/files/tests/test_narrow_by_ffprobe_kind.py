"""A .webp is a RIFF file, so it matches the wav signature as well as its own.

That spurious audio match is what sends it to ffprobe, and ffprobe calls a still image a video
("image" is not an answer it can give). Narrowing on that verdict used to drop every candidate,
leaving real files in production with no kind, no mime and no extension.
"""

from libs.files.processors.magic_bytes.parser import get_possible_types
from libs.files.tasks import narrow_by_ffprobe_kind

WEBP_HEADER = b"RIFF" + (1000).to_bytes(4, "little") + b"WEBP" + b"VP8 " + b"\x00" * 32
PNG_HEADER = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + b"\x00" * 32


def test_a_webp_header_also_matches_wav():
    kinds = {(t.type, t.extension) for t in get_possible_types(first_bytes=WEBP_HEADER)}
    assert ("image", "webp") in kinds
    assert ("audio", "wav") in kinds, "the RIFF collision is the reason this code path exists"


def test_a_png_header_is_unambiguous():
    assert [(t.type, t.extension) for t in get_possible_types(first_bytes=PNG_HEADER)] == [("image", "png")]


def test_a_webp_survives_ffprobe_calling_it_a_video():
    candidates = get_possible_types(first_bytes=WEBP_HEADER)
    kept = narrow_by_ffprobe_kind(candidates, "video")
    assert kept, "narrowing to nothing would leave the file unclassified"
    assert ("image", "webp") in {(t.type, t.extension) for t in kept}


def test_a_real_audio_verdict_still_narrows():
    candidates = get_possible_types(first_bytes=WEBP_HEADER)
    kept = narrow_by_ffprobe_kind(candidates, "audio")
    assert [(t.type, t.extension) for t in kept] == [("audio", "wav")]
