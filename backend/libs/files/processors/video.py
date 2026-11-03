import math
import os
from copy import deepcopy

import ffmpeg
import ffmpegio
import structlog

from libs.files.config import FILES_SETTINGS
from libs.files.processors.utils.media import analyze_local_file_with_ffprobe

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


class VideoProcessor(GenericProcessor):
    __kind__ = "video"

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
        Generate the alternative files for a video like:
        - thumbnail
        - default (specific audio and video codecs)
        - subtitles (srt and json)
        """

        alternative_files = []

        # alternative: "thumbnail"
        logger.debug("video_alternative_generation_started", alternative="thumbnail")
        thumbnail_file = self.__generate_video_thumbnail(force=force)
        if thumbnail_file is not None:
            alternative_files.append(thumbnail_file)

        # alternative: "squared" -- the same centre-crop an image gets, so a video can stand in as
        # artwork wherever a square is expected (an episode's cover, Apple's itunes:image).
        logger.debug("video_alternative_generation_started", alternative="squared")
        squared_file = self.__generate_square_centered_frame(force=force)
        if squared_file is not None:
            alternative_files.append(squared_file)

        # alternative: "audiogram" -- a video has a soundtrack, and the player draws it the same way.
        logger.debug("video_alternative_generation_started", alternative="audiogram")
        audiogram_file = self._generate_audiogram(force=force)
        if audiogram_file is not None:
            alternative_files.append(audiogram_file)

        # alternative: "default" (specific audio and video codecs)
        logger.debug("video_alternative_generation_started", alternative="default")
        default_file = self.__generate_default_video(force=force)
        if default_file is not None:
            alternative_files.append(default_file)

        # alternative: "whisper_transcript"
        logger.debug("video_alternative_generation_started", alternative="whisper_transcript")
        transcript_files = self.__generate_whisper_transcript(force=force)
        if transcript_files is not None:
            (
                alternative__whisper_transcript_json,
                alternative__whisper_transcript_srt,
            ) = transcript_files
            alternative_files.append(alternative__whisper_transcript_json)
            alternative_files.append(alternative__whisper_transcript_srt)

        return alternative_files

    def __generate_video_thumbnail(self, *, force: bool = False) -> FileAlternative | None:
        """
        Generate a thumbnail from the video
        """

        logger.debug("video_thumbnail_generation_started")

        if self.storage is None:
            logger.error("video_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("video_processor_storage_unavailable", missing="storage_folder_path")
            raise PermissionError

        STORAGE_SUFFIX = "thumbnail"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("video_alternative_already_exists", alternative=STORAGE_SUFFIX)
            return None

        output_path = GenericStorage.get_temporary_local_path(suffix=".jpg")

        try:
            (
                ffmpeg.input(self.local_path, ss="00:00:01")  # seek to 1 second
                .output(output_path, vframes=1)  # output one frame
                .run(overwrite_output=True)
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
                alternative_filename="thumbnail.jpg",
                storage_suffix=STORAGE_SUFFIX,
                description="thumbnail",
                size=file_stats.st_size,
                kind="image",
                mime="image/jpeg",
                extension=".jpg",
            )

        except Exception as error:
            logger.warning("video_thumbnail_generation_failed", error_type=type(error).__name__)
            return None

    def __generate_square_centered_frame(
        self,
        *,
        force: bool = False,
        min_size: int = 1400,
        max_size: int = 3000,
    ) -> FileAlternative | None:
        """A centred square crop of the video's first usable frame.

        The same shape, suffix and filename the image processor produces, because the callers do not
        care which kind of file they were handed -- an episode's artwork is a square, and a video
        episode should be able to supply its own instead of borrowing the show's.

        The bounds match the image processor's for the same reason: Apple requires an itunes:image
        between 1400 and 3000 pixels square, so a crop smaller or larger than that is grown or
        shrunk to land inside it.
        """
        logger.debug("video_squared_generation_started")

        if self.storage is None:
            logger.error("video_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("video_processor_storage_unavailable", missing="storage_folder_path")
            raise PermissionError

        STORAGE_SUFFIX = "squared"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("video_alternative_already_exists", alternative=STORAGE_SUFFIX)
            return None

        output_path = GenericStorage.get_temporary_local_path(suffix=".jpg")

        try:
            # crop=min(iw,ih) square about the centre, then scale into Apple's range. Done by
            # ffmpeg rather than by decoding the frame ourselves: it already has the frame open.
            (
                ffmpeg.input(self.local_path, ss="00:00:01")
                .output(
                    output_path,
                    vframes=1,
                    vf=(
                        "crop='min(iw,ih)':'min(iw,ih)',"
                        f"scale='if(lt(iw,{min_size}),{min_size},if(gt(iw,{max_size}),{max_size},iw))':-1"
                    ),
                )
                .run(overwrite_output=True)
            )
            self.storage.upload(
                local_path=output_path,
                storage_folder_path=self.storage_folder_path,
                alternative=STORAGE_SUFFIX,
                force=True,
            )
            file_stats = os.stat(output_path)
            os.remove(output_path)

            return FileAlternative(
                alternative_filename="squared.jpg",
                storage_suffix=STORAGE_SUFFIX,
                description="squared",
                size=file_stats.st_size,
                kind="image",
                mime="image/jpeg",
                extension=".jpg",
            )

        except Exception as error:
            logger.warning("video_squared_generation_failed", error_type=type(error).__name__)
            return None

    def __generate_default_video(self, *, force: bool = False) -> FileAlternative | None:
        """
        Generate a default video from the original file
        """

        logger.debug("video_default_generation_started")

        if self.storage is None:
            logger.error("video_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("video_processor_storage_unavailable", missing="storage_folder_path")
            raise PermissionError

        STORAGE_SUFFIX = "default"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("video_alternative_already_exists", alternative=STORAGE_SUFFIX)
            return None

        output_path = GenericStorage.get_temporary_local_path(suffix=".mp4")

        try:
            ffmpegio.transcode(
                self.local_path,
                output_path,
                show_log=True,
                **{
                    "b:v": "1000k",
                    "b:a": "96k",
                    "ac": "1",
                },
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
                alternative_filename="default.mp4",
                storage_suffix=STORAGE_SUFFIX,
                description="default",
                size=file_stats.st_size,
                kind="video",
                mime="video/mp4",
                extension=".mp4",
            )

        except Exception as error:
            logger.warning("video_compression_failed", error_type=type(error).__name__)
            return None

    def __generate_whisper_transcript(self, *, force: bool = False) -> tuple[FileAlternative, FileAlternative] | None:
        """
        Generate a whisper transcript from the original file
        """
        logger.debug("video_transcript_generation_started")

        if self.storage is None:
            logger.error("video_processor_storage_unavailable", missing="storage")
            raise PermissionError

        if self.storage_folder_path is None:
            logger.error("video_processor_storage_unavailable", missing="storage_folder_path")
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
            logger.debug("video_transcript_already_exists")
            return None

        output_path_json = GenericStorage.get_temporary_local_path(suffix=".json")
        output_path_srt = GenericStorage.get_temporary_local_path(suffix=".srt")

        model_folder = FILES_SETTINGS.WHISPER_PATH

        if not model_folder or not self.local_path:
            logger.warning(
                "video_transcript_prerequisite_missing",
                model_configured=bool(model_folder),
                local_file_available=bool(self.local_path),
            )
            return None

        # No audio stream -> nothing to transcribe. Skip cleanly instead of letting
        # faster-whisper's audio decoder blow up (IndexError: tuple index out of range).
        try:
            media_file_info = analyze_local_file_with_ffprobe(self.local_path)
        except Exception as error:
            logger.warning("video_transcript_media_analysis_failed", error_type=type(error).__name__)
            return None
        if not media_file_info or not media_file_info.get("has_audio"):
            logger.debug("video_transcript_audio_stream_missing")
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
                destination=output_path_json,
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
                destination=output_path_srt,
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
            logger.warning("video_transcript_generation_failed", error_type=type(error).__name__)
        return None

    # EXTRA

    def generate_extra_data(self, *, force: bool = False):
        file_extra = self.file_db.extra_

        media_file_info = analyze_local_file_with_ffprobe(self.local_path)
        logger.debug("video_media_analysis_completed", media_info_available=bool(media_file_info))
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
            logger.debug("video_duration_fallback_started")
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
                logger.warning("video_duration_fallback_failed", error_type=type(error).__name__)
                return None
        return file_extra
