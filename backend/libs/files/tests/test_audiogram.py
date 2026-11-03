"""What the drawing under a player is made of.

These run ffmpeg against generated tones rather than mocking it: the thing worth testing is that a
real file comes back with a readable shape, and the parts most likely to break -- the filter string,
the sample format, the reshape, the packing -- are exactly the parts a mock would paper over.
"""

import subprocess

import pytest

from libs.files.processors.audiogram import (
    AUDIOGRAM_VERSION,
    LEVELS,
    MIN_BINS_PER_SECOND,
    SOFT_MAX_BINS,
    TARGET_BINS_PER_SECOND,
    AudiogramExtractionError,
    bin_count_for,
    build_audiogram,
    read_audiogram,
    write_audiogram,
)


def _generate(path, filter_complex: str, inputs: list[str]) -> str:
    generated: list[str] = []
    for spec in inputs:
        generated += ["-f", "lavfi", "-i", spec]
    command = ["ffmpeg", "-nostdin", *generated, "-y", str(path)]
    if filter_complex:
        command[-2:-2] = ["-filter_complex", filter_complex]
    subprocess.run(command, capture_output=True, check=True)  # noqa: S603
    return str(path)


@pytest.fixture(scope="module")
def tone_silence_tone(tmp_path_factory) -> str:
    """A second of tone, a second of silence, a second of tone -- a shape with an obvious answer."""
    return _generate(
        tmp_path_factory.mktemp("audiogram") / "shape.wav",
        "[0][1][2]concat=n=3:v=0:a=1",
        ["sine=frequency=440:duration=1", "anullsrc=duration=1", "sine=frequency=220:duration=1"],
    )


@pytest.fixture(scope="module")
def loud_quiet_silence(tmp_path_factory) -> str:
    """A tone, the same tone 30 dB down, then silence.

    The case a tone-and-silence file cannot catch: something audible but far below the file's own
    peak, which is where nearly every spoken recording actually lives.
    """
    return _generate(
        tmp_path_factory.mktemp("audiogram") / "quiet.wav",
        "[1]volume=0.03[quiet];[0][quiet][2]concat=n=3:v=0:a=1",
        ["sine=frequency=440:duration=1", "sine=frequency=440:duration=1", "anullsrc=duration=1"],
    )


def _read(path: str) -> dict:
    return read_audiogram(build_audiogram(path))


def test_the_drawing_follows_the_sound(tone_silence_tone):
    bins = _read(tone_silence_tone)["bins"]

    # Sampled inside each second rather than at the boundaries, which straddle two.
    assert sum(bins[10:90]) / 80 > LEVELS * 0.8, "a tone should be near the top of the range"
    assert sum(bins[110:190]) / 80 == 0, "silence should be flat"
    assert sum(bins[210:290]) / 80 > LEVELS * 0.8


def test_a_short_file_keeps_the_full_rate(tone_silence_tone):
    """The files anyone zooms into are short ones, and they are cheap, so they keep every bin."""
    audiogram = _read(tone_silence_tone)

    assert audiogram["binCount"] == pytest.approx(3 * TARGET_BINS_PER_SECOND, abs=2)
    assert audiogram["duration"] == pytest.approx(3.0, abs=0.1)
    assert audiogram["binsPerSecond"] == pytest.approx(TARGET_BINS_PER_SECOND, abs=1)


@pytest.mark.parametrize(
    ("minutes", "expected_rate"),
    [
        (1, TARGET_BINS_PER_SECOND),
        (10, TARGET_BINS_PER_SECOND),
        (60, None),
        (180, MIN_BINS_PER_SECOND),
        (600, MIN_BINS_PER_SECOND),
    ],
)
def test_resolution_falls_towards_the_floor_and_stops_there(minutes, expected_rate):
    """Full rate while it is cheap, then less, and never below a tenth of a second.

    Without the floor a long file would keep coarsening until a bin covered a paragraph; without the
    ceiling an hour would cost half a megabyte to answer "roughly where am I".
    """
    duration = minutes * 60
    rate = bin_count_for(duration) / duration

    assert rate >= MIN_BINS_PER_SECOND
    assert rate <= TARGET_BINS_PER_SECOND
    if expected_rate is not None:
        assert rate == pytest.approx(expected_rate, rel=0.01)


def test_no_file_costs_more_than_a_handful_of_kilobytes():
    """An hour capped, and a very long one bounded by the floor rather than by nothing."""
    assert bin_count_for(3600) == SOFT_MAX_BINS
    assert bin_count_for(3 * 3600) == 3 * 3600 * MIN_BINS_PER_SECOND

    # Two bins to a byte, so this is very nearly the file size in kilobytes.
    assert bin_count_for(3600) / 2 / 1024 < 33
    assert bin_count_for(3 * 3600) / 2 / 1024 < 55


def test_two_bins_fit_in_a_byte(tone_silence_tone):
    # The whole reason this is bytes and not JSON: an hour as a base64'd array of numbers came to
    # 469 KB, and a page fetches this before it can draw anything.
    payload = build_audiogram(tone_silence_tone)
    audiogram = read_audiogram(payload)

    assert isinstance(payload, bytes)
    assert len(audiogram["bins"]) == audiogram["binCount"]
    assert max(audiogram["bins"]) <= LEVELS
    assert len(payload) <= 24 + audiogram["binCount"] // 2 + 1


def test_the_loudest_moment_reaches_the_top(tone_silence_tone):
    """Scaled against the file's own loudest bin, so a quiet recording is readable rather than flat.

    The absolute level is kept alongside, so nothing has to be reprocessed to get it back.
    """
    audiogram = _read(tone_silence_tone)

    assert max(audiogram["bins"]) == LEVELS
    assert 0 < audiogram["peak"] < 1


def test_a_quiet_passage_is_not_drawn_as_silence(loud_quiet_silence):
    """The bug this scale exists to fix.

    Split linearly, sixteen levels are all spent near the peak: something 30 dB down lands on
    0.03 * 15 = 0.47, rounds to zero, and draws at exactly the height of a pause. A real recording is
    mostly 30-odd dB down -- so a whole library drew as a flat line, and every level above about two
    went unused. On the ear's scale the same passage has to sit visibly off the floor, and visibly
    under the loudest moment, or the drawing is not telling anyone where to jump to.
    """
    bins = _read(loud_quiet_silence)["bins"]

    # Sampled inside each second rather than at the boundaries, which straddle two.
    loud = sum(bins[10:90]) / 80
    quiet = sum(bins[110:190]) / 80
    silence = sum(bins[210:290]) / 80

    assert silence == 0, "a pause still has to reach the floor"
    assert quiet > LEVELS * 0.2, "30 dB down is quiet, not absent"
    assert quiet < loud * 0.75, "and it still has to read as quieter than the loud passage"


def test_every_level_earns_its_place(loud_quiet_silence):
    """Sixteen levels are only worth their bits if a file is spread over them.

    Linearly this file used three of the sixteen; the levels were there, the scale was what kept
    everything piled against the bottom of them.
    """
    bins = _read(loud_quiet_silence)["bins"]

    assert len(set(bins)) >= 3
    assert max(bins) == LEVELS


def test_a_file_with_no_audio_is_skipped_rather_than_fatal(tmp_path):
    """A silent video or a truncated upload should cost its own alternative, not the whole run."""
    silent_video = _generate(tmp_path / "silent.mp4", "", ["testsrc=size=64x64:duration=1"])

    with pytest.raises(AudiogramExtractionError):
        build_audiogram(silent_video)


def test_what_gets_written_is_what_a_player_reads(tone_silence_tone, tmp_path):
    output = tmp_path / "audiogram.bin"

    size = write_audiogram(tone_silence_tone, str(output))

    written = read_audiogram(output.read_bytes())
    assert size == output.stat().st_size
    assert written["version"] == AUDIOGRAM_VERSION
    assert len(written["bins"]) == written["binCount"]


def test_something_that_is_not_an_audiogram_is_refused():
    # The magic exists so a reader can tell, rather than drawing whatever the bytes happen to be.
    with pytest.raises(AudiogramExtractionError):
        read_audiogram(b"not an audiogram at all, but long enough to unpack a header from")
