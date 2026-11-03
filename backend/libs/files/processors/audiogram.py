"""The shape of a file's sound, precomputed.

A player used to draw this by downloading the whole media file and decoding it in the browser. That
cost the listener the file a second time -- and, for anything served through a proxy, cost the owner
the bandwidth and counted a download for a picture nobody listened to. It also simply failed on long
files: an hour of audio decodes to hundreds of megabytes of PCM, and three hours does not decode at
all.

So the shape is computed once, here, and stored beside the file.

Four decisions worth knowing about:

**Loudness is levelled before measuring.** A single `loudnorm` pass puts every file at the same
reference before the bins are taken, so a quietly recorded episode has a readable shape instead of a
flat line, and two episodes of one show look like they belong together. It normalises what we
*measure*, never what we serve -- the audio a listener downloads is untouched.

**Bins are RMS, not peaks, and they are stored in decibels.** The point of the drawing is to find
the moment to jump to. A peak makes speech look like a solid block, because one consonant fills the
bin; RMS follows the energy, so sentences, pauses and music read as different things. That energy is
then written on the ear's scale rather than the meter's: speech sits some 35 dB below the loudest
moment of its own file, so splitting the linear range into sixteen levels puts seven bins in ten on
zero and draws a flat line. In decibels the same file spreads across all sixteen.

**Resolution adapts, between a target and a floor.** A bin is a hundredth of a second at best and a
tenth at worst. Short files -- the ones anyone actually zooms into -- keep the full rate; long ones
give up precision they were never going to be read at, rather than growing without bound.

**It is bytes, not JSON.** Two bins to a byte behind a small header. The same hour that costs 469 KB
as base64'd JSON is 32 KB here, which is what makes it reasonable to fetch before drawing anything.
"""

import math
import os
import struct
import subprocess

import numpy as np
import structlog

logger = structlog.get_logger(__name__)

#: Bins per second to aim for. A waveform pane is around 1800 CSS pixels, so five seconds filling one
#: at this rate is roughly 4px per bin -- fine enough to zoom into, and the renderer aggregates for
#: anything wider.
TARGET_BINS_PER_SECOND = 100

#: The rate never drops below this, however long the file. A tenth of a second is still a sentence
#: rather than a paragraph, which is the resolution the drawing exists to give.
MIN_BINS_PER_SECOND = 10

#: Where the target starts giving way. Reached at about eleven minutes; past that the rate falls
#: towards the floor, and once it meets the floor the file grows again rather than coarsening further.
SOFT_MAX_BINS = 65_536

#: What the samples are read at. Ample for an envelope: the drawing follows loudness over tens of
#: milliseconds, not waveform detail, and a lower rate keeps a long file cheap to process.
SAMPLE_RATE = 8000

#: -16 LUFS, the same reference Rumble Studio normalises listening audio to.
LOUDNESS_TARGET = -16.0

AUDIOGRAM_ALTERNATIVE = "audiogram"
AUDIOGRAM_FILENAME = "audiogram.bin"
AUDIOGRAM_MIME = "application/octet-stream"

#: Bumped when the meaning of the bytes changes, so a reader can tell a stale file from a current one
#: rather than drawing something wrong. 2: bins are decibels over FLOOR_DB, not linear amplitude.
AUDIOGRAM_VERSION = 2

#: Sixteen levels of loudness per bin. Fewer would band visibly; more costs a byte each and would not
#: show, because a bar is drawn from several bins averaged together and the average lands between them.
BITS_PER_BIN = 4
LEVELS = 2**BITS_PER_BIN - 1

#: How far under a file's loudest moment still draws as something. A pause has to reach zero height
#: to read as a pause, and -48 dB is where quiet passages land: a deeper floor lifts room tone off
#: the baseline, a shallower one flattens speech back down towards it.
FLOOR_DB = -48.0

#: Under this an RMS bin is silence, and log10(0) is not a number.
SILENCE = 1e-6

#: `SPAG`, version, bits per bin, two spare, then count, rate, duration, peak. Little-endian, which
#: is what a DataView reads by default on every machine this runs on.
HEADER = struct.Struct("<4sBBHIfff")
MAGIC = b"SPAG"


class AudiogramExtractionError(Exception):
    """ffmpeg could not be read for this file. The caller decides whether that is fatal."""

    def __init__(self, detail: str = "no readable audio"):
        super().__init__(f"Could not extract audio to measure: {detail}")


class NotAnAudiogramError(AudiogramExtractionError):
    """These bytes are something else. The magic exists so a reader can tell."""

    def __init__(self):
        super().__init__("the bytes do not begin with an audiogram header")


def bin_count_for(duration: float) -> int:
    """How many bins a file of this length gets.

    The target rate until the file would get large, then falling, then held at the floor -- so
    precision is spent where it can be seen and given up where it cannot.
    """
    if duration <= 0:
        return 1
    floor_bins = math.ceil(duration * MIN_BINS_PER_SECOND)
    target_bins = math.ceil(duration * TARGET_BINS_PER_SECOND)
    return max(1, min(target_bins, max(SOFT_MAX_BINS, floor_bins)))


def _read_normalised_samples(local_path: str) -> np.ndarray:
    """Mono 16-bit samples at SAMPLE_RATE, loudness-levelled, as a numpy array in [-1, 1].

    Streamed through ffmpeg rather than decoded in memory: a three-hour file is a few hundred
    megabytes at this rate and there is no reason to hold the original anywhere.
    """
    command = [
        "ffmpeg",
        "-nostdin",
        "-i",
        local_path,
        "-map",
        "a:0",
        "-af",
        f"loudnorm=I={LOUDNESS_TARGET}:TP=-1.5:LRA=11",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-f",
        "s16le",
        "-",
    ]
    completed = subprocess.run(command, capture_output=True, check=False)  # noqa: S603
    if completed.returncode != 0 or not completed.stdout:
        raise AudiogramExtractionError(completed.stderr.decode("utf-8", "replace")[-500:])

    return np.frombuffer(completed.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def build_audiogram(local_path: str) -> bytes:
    """The bytes an audiogram alternative holds, for one media file.

    Raises AudiogramExtractionError when the file has no readable audio -- a silent video, something
    truncated -- which is a reason to skip the alternative, not to fail the whole processing run.
    """
    samples = _read_normalised_samples(local_path)
    if samples.size == 0:
        raise AudiogramExtractionError

    duration = samples.size / SAMPLE_RATE
    bins = bin_count_for(duration)
    samples_per_bin = max(1, samples.size // bins)

    # Trimmed to a whole number of bins so the reshape is exact; the remainder is at most one bin,
    # which is a hundredth of a second of a file that is minutes long.
    usable = samples[: samples_per_bin * bins].reshape(bins, samples_per_bin)
    rms = np.sqrt(np.mean(np.square(usable), axis=1))

    # Scaled against the loudest bin rather than against full scale: after levelling, the loudest
    # moment of a quiet recording is still well below 1.0, and drawing it against full scale would
    # give back the flat line the levelling exists to avoid. In decibels, for the same reason one
    # step further -- dividing by the loudest bin fixes where the range sits, not how a file is
    # spread across it, and linearly a file piles up against the bottom of it either way.
    loudest = float(rms.max())
    if loudest > 0:
        decibels = 20 * np.log10(np.maximum(rms, SILENCE) / loudest)
        shaped = np.clip((decibels - FLOOR_DB) / -FLOOR_DB, 0.0, 1.0)
    else:
        shaped = np.zeros_like(rms)
    quantised = np.rint(shaped * LEVELS).astype(np.uint8)

    # Two bins to a byte, first one in the high nibble. An odd count leaves the last low nibble
    # empty, which a reader never sees because it knows the count.
    if quantised.size % 2:
        quantised = np.append(quantised, np.uint8(0))
    packed = ((quantised[0::2] << BITS_PER_BIN) | quantised[1::2]).astype(np.uint8)

    header = HEADER.pack(MAGIC, AUDIOGRAM_VERSION, BITS_PER_BIN, 0, bins, bins / duration, duration, loudest)
    return header + packed.tobytes()


def write_audiogram(local_path: str, output_path: str) -> int:
    """Write the audiogram for *local_path* to *output_path*. Returns its size in bytes."""
    with open(output_path, "wb") as output:
        output.write(build_audiogram(local_path))
    return os.stat(output_path).st_size


def read_audiogram(payload: bytes) -> dict:
    """The inverse. What the frontend does in ten lines of DataView, for tests to check against."""
    magic, version, bits, _reserved, bins, bins_per_second, duration, peak = HEADER.unpack_from(payload)
    if magic != MAGIC:
        raise NotAnAudiogramError

    body = np.frombuffer(payload, dtype=np.uint8, offset=HEADER.size)
    unpacked = np.empty(body.size * 2, dtype=np.uint8)
    unpacked[0::2] = body >> BITS_PER_BIN
    unpacked[1::2] = body & LEVELS
    return {
        "version": version,
        "bitsPerBin": bits,
        "binCount": bins,
        "binsPerSecond": bins_per_second,
        "duration": duration,
        "peak": peak,
        "bins": unpacked[:bins].tolist(),
    }
