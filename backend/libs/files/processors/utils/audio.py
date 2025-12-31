import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import TextIO, TypedDict, cast


class WordData(TypedDict):
    text: str
    start: float | str
    end: float | str
    score: float
class TranscribedData(TypedDict):
    text: str
    start: float | str
    end: float | str
    score: float
    words: list[WordData]


def format_timestamp(seconds: float, decimal_marker: str = "."):
    assert seconds >= 0, "non-negative timestamp expected"
    milliseconds = round(seconds * 1000.0)

    hours = milliseconds // 3_600_000
    milliseconds -= hours * 3_600_000

    minutes = milliseconds // 60_000
    milliseconds -= minutes * 60_000

    seconds = milliseconds // 1_000
    milliseconds -= seconds * 1_000

    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{decimal_marker}{milliseconds:03d}"


@dataclass(kw_only=True)
class ResultWriter:
    result: list[TranscribedData]
    destination: os.PathLike

    def write(self):
        with open(self.destination, "w", encoding="utf-8") as f:
            self._write_result(self.result, f)

    def _write_result(self, result: list[TranscribedData], file: TextIO):
        raise NotImplementedError


@dataclass(kw_only=True)
class SubtitlesWriter(ResultWriter):
    decimal_marker: str

    def iterate_result(self, result: list[TranscribedData]):
        for segment in result:
            segment_start = self.format_timestamp(cast(float, segment["start"]))
            segment_end = self.format_timestamp(cast(float, segment["end"]))
            segment_text = segment["text"].strip()
            yield segment_start, segment_end, segment_text

    def format_timestamp(self, seconds: float):
        return format_timestamp(
            seconds=seconds,
            decimal_marker=self.decimal_marker,
        )


@dataclass(kw_only=True)
class WriteSRT(SubtitlesWriter):
    decimal_marker: str = ","

    def _write_result(self, result: list[TranscribedData], file: TextIO):
        for i, (start, end, text) in enumerate(self.iterate_result(result), start=1):
            print(f"{i}\n{start} --> {end}\n{text}\n", file=file, flush=True)


@dataclass(kw_only=True)
class WriteVTT(SubtitlesWriter):
    decimal_marker: str = "."

    def _write_result(self, result: list[TranscribedData], file: TextIO):
        print("WEBVTT\n", file=file)
        for start, end, text in self.iterate_result(result):
            print(f"{start} --> {end}\n{text}\n", file=file, flush=True)


@dataclass(kw_only=True)
class WriteASS(SubtitlesWriter):
    # TODO: implement this like https://github.com/jianfch/stable-ts/blob/ff79549bd01f764427879f07ecd626c46a9a430a/stable_whisper/text_output.py#L133
    pass


@dataclass(kw_only=True)
class WriteJSON(ResultWriter):
    def _write_result(self, result: list[TranscribedData], file: TextIO):
        self.transform_result(result)
        json.dump(result, file)

    def transform_result(self, result: list[TranscribedData]):
        for s in result:
            s["start"] = self.format_timestamp(cast(float, s["start"]))
            s["end"] = self.format_timestamp(cast(float, s["end"]))
            s["text"] = s["text"].strip()
            if len(s["words"]) > 0:
                for w in s["words"]:
                    w["start"] = self.format_timestamp(cast(float, w["start"]))
                    w["end"] = self.format_timestamp(cast(float, w["end"]))
                    w["text"] = w["text"].strip()

    def format_timestamp(self, seconds: float):
        return format_timestamp(seconds=seconds)


WRITERS: Mapping[str, type[ResultWriter]] = {
    "json": WriteJSON,
    "srt": WriteSRT,
    "vtt": WriteVTT,
}
