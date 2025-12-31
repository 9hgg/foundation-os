import math
import os
import sys
import traceback
from copy import deepcopy

import ffmpegio

from libs.files.config import FILES_SETTINGS
from libs.logger import print, print_color
from libs.logger.customLogger import print_error

from ..models import FileAlternative
from ..storage import GenericStorage
from ._generic import GenericProcessor
from .utils import audio as audio_utils
from .utils.media import analyze_local_file_with_ffprobe

cwd = os.getcwd()


class AudioProcessor(GenericProcessor):
    __kind__ = "audio"

    # ALTERNATIVES

    def generate_alternatives(self, *, force: bool = False) -> list[FileAlternative]:
        """
        Generate the alternative files for an audio like:
        - mp3 (compressed for web)
        - flac (loss less)
        - subtitles (srt and json)
        """

        alternative_files = []

        # alternative: "default" (mp3 compressed)
        alternative__default = self.__generate_same_compressed_audio(force=force)
        if alternative__default is not None:
            alternative_files.append(alternative__default)

        # alternative: "flac" (lossless from original file)
        print("generate_alternatives: flac")
        alternative__flac = self.__generate_flac_audio(force=force)
        if alternative__flac is not None:
            alternative_files.append(alternative__flac)

        if FILES_SETTINGS.WHISPER_PATH:
            # alternative: "whisper_transcript"
            print("generate_alternatives: whisper_transcript")
            transcript_files = self.__generate_whisper_transcript(force=force)
            if transcript_files is not None:
                (
                    alternative__whisper_transcript_json,
                    alternative__whisper_transcript_srt,
                ) = transcript_files
                alternative_files.append(alternative__whisper_transcript_json)
                alternative_files.append(alternative__whisper_transcript_srt)

        return alternative_files

    def __generate_same_compressed_audio(self, *, force: bool = False) -> FileAlternative | None:
        """
        Generate a compressed audio file from the original file
        """

        print("generate_same_compressed_audio")

        if self.storage is None:
            print_error("Storage is not available")
            raise PermissionError

        if self.storage_folder_path is None:
            print_error("Storage is not available")
            raise PermissionError

        STORAGE_SUFFIX = "default"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            print_color(
                "green",
                "(__generate_same_compressed_audio): alternative already exists",
                self.storage_folder_path,
                STORAGE_SUFFIX,
            )
            return None

        output_path = GenericStorage.get_temporary_local_path(suffix=".mp3")

        try:
            ffmpegio.transcode(
                self.local_path,
                output_path,
                show_log=True,
                **{
                    "b:a": "96k",
                    # "ar": "44100",
                    "ac": "1",
                },  # type: ignore
                overwrite=True,
            )
            self.storage.upload(
                local_path=output_path,
                storage_folder_path=self.storage_folder_path,
                alternative=STORAGE_SUFFIX,
                force=True,
            )
            file_stats = os.stat(output_path)

            # delete the local file
            os.remove(output_path)

            return FileAlternative(
                alternative_filename="default.mp3",
                storage_suffix=STORAGE_SUFFIX,
                description="default",
                size=file_stats.st_size,
                kind="audio",
                mime="audio/mpeg",
                extension=".mp3",
            )

        except Exception as e:
            sys.stdout.flush()
            traceback.print_exc()
            print("Error while compressing audio")
            print(e)
            return None

    def __generate_flac_audio(self, *, force: bool = False) -> FileAlternative | None:
        """
        Generate a lossless audio file from the original file, in the flac format
        """

        print("generate_flac_audio")

        if self.storage is None:
            print_error("Storage is not available")
            raise PermissionError

        if self.storage_folder_path is None:
            print_error("Storage is not available")
            raise PermissionError

        STORAGE_SUFFIX = "flac"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            print_color(
                "green",
                "(__generate_flac_audio): alternative already exists",
                self.storage_folder_path,
                STORAGE_SUFFIX,
            )
            return None

        output_path = GenericStorage.get_temporary_local_path(suffix=".flac")

        try:
            ffmpegio.transcode(
                self.local_path,
                output_path,
                show_log=True,
                # **{
                #     # "b:a": "96k",
                #     # "ar": "44100",
                #     "ac": "1",
                # },  # type: ignore
                overwrite=True,
            )
            self.storage.upload(
                local_path=output_path,
                storage_folder_path=self.storage_folder_path,
                alternative=STORAGE_SUFFIX,
                force=True,
            )
            file_stats = os.stat(output_path)

            # delete the local file
            os.remove(output_path)

            return FileAlternative(
                alternative_filename="file.flac",
                storage_suffix=STORAGE_SUFFIX,
                description=("FLAC version of the audio. FLAC is a lossless audio format."),
                size=file_stats.st_size,
                kind="audio",
                mime="audio/flac",
                extension=".flac",
            )

        except Exception as e:
            sys.stdout.flush()
            traceback.print_exc()
            print("Error while compressing audio")
            print(e)
            return None

    def __generate_whisper_transcript(self, *, force: bool = False) -> tuple[FileAlternative, FileAlternative] | None:
        """
        Generate a whisper transcript from the original file
        """
        print("generate_whisper_transcript")

        if self.storage is None:
            print_error("Storage is not available")
            raise PermissionError

        if self.storage_folder_path is None:
            print_error("Storage is not available")
            raise PermissionError

        STORAGE_SUFFIX_JSON = "whisper_transcript_json"
        STORAGE_SUFFIX_SRT = "whisper_transcript_srt"

        if (
            not force
            and self.storage.exists_in_storage(
                storage_folder_path=self.storage_folder_path,
                alternative=STORAGE_SUFFIX_JSON,
            )
            and self.storage.exists_in_storage(
                storage_folder_path=self.storage_folder_path,
                alternative=STORAGE_SUFFIX_SRT,
            )
        ):
            print_color(
                "green",
                "(__generate_whisper_transcript): alternative already exists",
                self.storage_folder_path,
                STORAGE_SUFFIX_JSON,
            )
            return None

        output_path_json = GenericStorage.get_temporary_local_path(suffix=".json")
        output_path_srt = GenericStorage.get_temporary_local_path(suffix=".srt")

        model_folder = FILES_SETTINGS.WHISPER_PATH

        if not model_folder or not self.local_path:
            print("Whisper model path or local audio file path is not set.")
            return None

        try:
            from faster_whisper import WhisperModel

            model = WhisperModel(model_folder, device="cpu", compute_type="int8", local_files_only=False)
            segments, info = model.transcribe(
                self.local_path,
                beam_size=5,
                word_timestamps=True,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=200),
            )
            result: list[audio_utils.TranscribedData] = []
            for segment in segments:
                if segment.words is None:
                    continue
                segment_extract: audio_utils.TranscribedData = {
                    "text": segment.text,
                    "start": segment.start,
                    "end": segment.end,
                    "score": round(math.exp(segment.avg_logprob), 2),
                    "words": [
                        {
                            "start": w.start,
                            "end": w.end,
                            "text": w.word,
                            "score": round(w.probability, 2),
                        }
                        for w in segment.words
                    ],
                }
                result.append(segment_extract)

            # JSON
            writer = audio_utils.WRITERS["json"](
                result=deepcopy(result),
                destination=output_path_json,  # type: ignore
            )
            writer.write()
            self.storage.upload(
                local_path=output_path_json,
                storage_folder_path=self.storage_folder_path,
                alternative=STORAGE_SUFFIX_JSON,
                force=True,
            )
            file_stats_json = os.stat(output_path_json)

            # SRT
            writer = audio_utils.WRITERS["srt"](
                result=deepcopy(result),
                destination=output_path_srt,  # type: ignore
            )
            writer.write()
            self.storage.upload(
                local_path=output_path_srt,
                storage_folder_path=self.storage_folder_path,
                alternative=STORAGE_SUFFIX_SRT,
                force=True,
            )
            file_stats_srt = os.stat(output_path_srt)

            return (
                FileAlternative(
                    alternative_filename="file.json",
                    storage_suffix=STORAGE_SUFFIX_JSON,
                    description="Whisper transcript in JSON format",
                    size=file_stats_json.st_size,
                    kind="json",
                    mime="application/json",
                    extension=".json",
                ),
                FileAlternative(
                    alternative_filename="file.srt",
                    storage_suffix=STORAGE_SUFFIX_SRT,
                    description="Whisper transcript in SRT format",
                    size=file_stats_srt.st_size,
                    kind="text",
                    mime="text/plain",
                    extension=".srt",
                ),
            )

        except Exception as e:
            sys.stdout.flush()
            traceback.print_exc()
            print("Error while generating whisper transcript")
            print(e)
        return None

    # EXTRA

    def generate_extra_data(self, *, force: bool = False):
        file_extra = self.file_db.extra_

        media_file_info = analyze_local_file_with_ffprobe(self.local_path)
        print_color("green", "media_file_info:", media_file_info)
        if media_file_info:
            file_extra.duration = media_file_info.get("duration", file_extra.duration)
            file_extra.has_audio = media_file_info.get("has_audio", file_extra.has_audio)
            file_extra.has_video = media_file_info.get("has_video", file_extra.has_video)
            file_extra.codec_video = media_file_info.get("video_codec", file_extra.codec_video)
            file_extra.codec_audio = media_file_info.get("audio_codec", file_extra.codec_audio)
            file_extra.channels = media_file_info.get("channels", file_extra.channels)
            file_extra.height = media_file_info.get("height", file_extra.height)
            file_extra.width = media_file_info.get("width", file_extra.width)
            file_extra.sample_rate = media_file_info.get("sample_rate", file_extra.sample_rate)
        if not file_extra.duration:
            print("Duration is missing on this file, using temporary flac file")
            output_path = GenericStorage.get_temporary_local_path(suffix=".flac")
            try:
                ffmpegio.transcode(
                    self.local_path,
                    output_path,
                    show_log=True,
                    # **{
                    #     # "b:a": "96k",
                    #     # "ar": "44100",
                    #     "ac": "1",
                    # },  # type: ignore
                    overwrite=True,
                )
                media_file_info_from_flac = analyze_local_file_with_ffprobe(output_path)
                if media_file_info_from_flac:
                    file_extra.duration = media_file_info_from_flac.get("duration")
                # delete the local file
                os.remove(output_path)

            except Exception as e:
                sys.stdout.flush()
                traceback.print_exc()
                print("Error while getting duration from temporary flac file")
                print(e)
                return None
        return file_extra
