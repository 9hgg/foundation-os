import math
import os
from copy import deepcopy

import ffmpeg
import ffmpegio
import structlog
from PIL import Image

from libs.files.config import FILES_SETTINGS

from ..models import FileAlternative
from ..storage import GenericStorage
from ._generic import GenericProcessor
from .audiogram import (
    AUDIOGRAM_ALTERNATIVE,
    AUDIOGRAM_FILENAME,
    AUDIOGRAM_MIME,
    AudiogramExtractionError,
    write_audiogram,
)
from .utils import audio as audio_utils
from .utils.media import analyze_local_file_with_ffprobe

cwd = os.getcwd()


class _NonFatalLogger:
    """Keep diagnostic failures from changing media-processing behavior."""

    def __init__(self) -> None:
        self._logger = structlog.get_logger(__name__)

    def __getattr__(self, name: str):
        method = getattr(self._logger, name)

        def emit(*args, **kwargs):
            try:
                return method(*args, **kwargs)
            except Exception:
                return None

        return emit


logger = _NonFatalLogger()


class AudioProcessor(GenericProcessor):
    __kind__ = "audio"

    # ALTERNATIVES

    def _generate_audiogram(self, *, force: bool = False) -> FileAlternative | None:
        """The shape of this file's sound, for a player to draw without fetching the file itself.

        A file with no readable audio -- a silent video, a truncated upload -- simply has no
        audiogram. That is a missing drawing, not a failed processing run, so it is logged and
        skipped rather than raised.
        """
        if self.storage is None or self.storage_folder_path is None:
            logger.error("audiogram_storage_unavailable")
            raise PermissionError

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=AUDIOGRAM_ALTERNATIVE,
        ):
            logger.debug("audiogram_already_exists")
            return None

        output_path = GenericStorage.get_temporary_local_path(suffix=".bin")
        try:
            size = write_audiogram(self.local_path, output_path)
        except AudiogramExtractionError as error:
            logger.info("audiogram_skipped", reason=str(error))
            return None
        except Exception as error:
            logger.warning("audiogram_generation_failed", error_type=type(error).__name__)
            return None

        self.storage.upload(
            local_path=output_path,
            storage_folder_path=self.storage_folder_path,
            alternative=AUDIOGRAM_ALTERNATIVE,
            force=True,
        )
        os.remove(output_path)

        return FileAlternative(
            alternative_filename=AUDIOGRAM_FILENAME,
            storage_suffix=AUDIOGRAM_ALTERNATIVE,
            description="audiogram",
            size=size,
            kind="data",
            mime=AUDIOGRAM_MIME,
            extension=".bin",
        )

    def generate_alternatives(self, *, force: bool = False) -> list[FileAlternative]:
        """
        Generate the alternative files for an audio like:
        - thumbnail (extracted from embedded artwork, if present)
        - mp3 (compressed for web)
        - flac (loss less)
        - subtitles (srt and json)
        """

        alternative_files = []

        # alternative: "thumbnail" (embedded artwork, if present)
        logger.debug("audio_alternative_generation_started", alternative="thumbnail")
        alternative__thumbnail = self.__generate_audio_thumbnail(force=force)
        if alternative__thumbnail is not None:
            alternative_files.append(alternative__thumbnail)

        # alternative: "default" (mp3 compressed)
        alternative__default = self.__generate_same_compressed_audio(force=force)
        if alternative__default is not None:
            alternative_files.append(alternative__default)

        # alternative: "flac" (lossless from original file)
        logger.debug("audio_alternative_generation_started", alternative="flac")
        alternative__flac = self.__generate_flac_audio(force=force)
        if alternative__flac is not None:
            alternative_files.append(alternative__flac)

        if FILES_SETTINGS.WHISPER_PATH:
            # alternative: "whisper_transcript"
            logger.debug("audio_alternative_generation_started", alternative="whisper_transcript")
            transcript_files = self.__generate_whisper_transcript(force=force)
            if transcript_files is not None:
                (
                    alternative__whisper_transcript_json,
                    alternative__whisper_transcript_srt,
                ) = transcript_files
                alternative_files.append(alternative__whisper_transcript_json)
                alternative_files.append(alternative__whisper_transcript_srt)

        # alternative: "audiogram" -- what a player draws instead of downloading this file to
        # decode it in the browser.
        alternative__audiogram = self._generate_audiogram(force=force)
        if alternative__audiogram is not None:
            alternative_files.append(alternative__audiogram)

        return alternative_files

    def __generate_audio_thumbnail(self, *, force: bool = False) -> FileAlternative | None:  # noqa: C901
        """
        Extract the embedded artwork (cover art) from the audio file and use it as a thumbnail.
        Returns None if no embedded artwork is found.
        """

        logger.debug("audio_thumbnail_generation_started")

        if self.storage is None:
            logger.error("audio_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("audio_processor_storage_unavailable", missing="storage_folder_path")
            raise PermissionError

        STORAGE_SUFFIX = "thumbnail"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("audio_alternative_already_exists", alternative=STORAGE_SUFFIX)
            return None

        raw_artwork_path = GenericStorage.get_temporary_local_path(suffix=".jpg")
        output_path = GenericStorage.get_temporary_local_path(suffix=".jpg")

        try:
            # Extract the embedded artwork stream from the audio file.
            # ffmpeg treats the cover art as a video stream; -an drops audio, -vcodec copy
            # copies the image stream as-is. If no artwork exists ffmpeg raises an error.
            (
                ffmpeg.input(self.local_path)
                .output(raw_artwork_path, an=None, vcodec="copy", vframes=1)
                .run(overwrite_output=True, quiet=True)
            )
        except ffmpeg.Error:
            # No embedded artwork — expected for audio files without cover art.
            logger.debug("audio_embedded_artwork_missing")
            for path in (raw_artwork_path, output_path):
                if os.path.exists(path):
                    os.remove(path)
            return None

        try:
            # Resize the artwork to a standard 200x200 thumbnail.
            with Image.open(raw_artwork_path) as pil_image:
                pil_image = pil_image.convert("RGB")
                pil_image.thumbnail((200, 200), Image.Resampling.LANCZOS)
                pil_image.save(output_path, format="JPEG", quality=85, optimize=True)
        except Exception as error:
            logger.warning("audio_thumbnail_resize_failed", error_type=type(error).__name__)
            for path in (raw_artwork_path, output_path):
                if os.path.exists(path):
                    os.remove(path)
            return None
        finally:
            if os.path.exists(raw_artwork_path):
                os.remove(raw_artwork_path)

        self.storage.upload(
            local_path=output_path,
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
            force=True,
        )
        file_stats = os.stat(output_path)
        os.remove(output_path)

        return FileAlternative(
            alternative_filename="thumbnail.jpg",
            storage_suffix=STORAGE_SUFFIX,
            description="Thumbnail extracted from embedded audio artwork",
            size=file_stats.st_size,
            kind="image",
            mime="image/jpeg",
            extension=".jpg",
        )

    def __generate_same_compressed_audio(self, *, force: bool = False) -> FileAlternative | None:
        """
        Generate a compressed audio file from the original file
        """

        logger.debug("audio_default_generation_started")

        if self.storage is None:
            logger.error("audio_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("audio_processor_storage_unavailable", missing="storage_folder_path")
            raise PermissionError

        STORAGE_SUFFIX = "default"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("audio_alternative_already_exists", alternative=STORAGE_SUFFIX)
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
                },  # type: ignore[arg-type]
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

        except Exception as error:
            logger.warning("audio_compression_failed", error_type=type(error).__name__)
            return None

    def __generate_flac_audio(self, *, force: bool = False) -> FileAlternative | None:
        """
        Generate a lossless audio file from the original file, in the flac format
        """

        logger.debug("audio_flac_generation_started")

        if self.storage is None:
            logger.error("audio_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("audio_processor_storage_unavailable", missing="storage_folder_path")
            raise PermissionError

        STORAGE_SUFFIX = "flac"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("audio_alternative_already_exists", alternative=STORAGE_SUFFIX)
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
                # },
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

        except Exception as error:
            logger.warning("audio_flac_generation_failed", error_type=type(error).__name__)
            return None

    def __generate_whisper_transcript(self, *, force: bool = False) -> tuple[FileAlternative, FileAlternative] | None:
        """
        Generate a whisper transcript from the original file
        """
        logger.debug("audio_transcript_generation_started")

        if self.storage is None:
            logger.error("audio_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("audio_processor_storage_unavailable", missing="storage_folder_path")
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
            logger.debug("audio_transcript_already_exists")
            return None

        output_path_json = GenericStorage.get_temporary_local_path(suffix=".json")
        output_path_srt = GenericStorage.get_temporary_local_path(suffix=".srt")

        model_folder = FILES_SETTINGS.WHISPER_PATH

        if not model_folder or not self.local_path:
            logger.warning(
                "audio_transcript_prerequisite_missing",
                model_configured=bool(model_folder),
                local_file_available=bool(self.local_path),
            )
            return None

        try:
            from faster_whisper import WhisperModel

            model = WhisperModel(model_folder, device="cpu", compute_type="int8", local_files_only=False)
            segments, info = model.transcribe(
                self.local_path,
                beam_size=5,
                word_timestamps=True,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 200},
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
                destination=output_path_json,  # type: ignore[arg-type]
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
                destination=output_path_srt,  # type: ignore[arg-type]
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

        except Exception as error:
            logger.warning("audio_transcript_generation_failed", error_type=type(error).__name__)
        return None

    # EXTRA

    def generate_extra_data(self, *, force: bool = False):
        file_extra = self.file_db.extra_

        media_file_info = analyze_local_file_with_ffprobe(self.local_path)
        logger.debug("audio_media_analysis_completed", media_info_available=bool(media_file_info))
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
            logger.debug("audio_duration_fallback_started")
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
                    # },
                    overwrite=True,
                )
                media_file_info_from_flac = analyze_local_file_with_ffprobe(output_path)
                if media_file_info_from_flac:
                    file_extra.duration = media_file_info_from_flac.get("duration")
                # delete the local file
                os.remove(output_path)

            except Exception as error:
                logger.warning("audio_duration_fallback_failed", error_type=type(error).__name__)
                return None
        return file_extra
