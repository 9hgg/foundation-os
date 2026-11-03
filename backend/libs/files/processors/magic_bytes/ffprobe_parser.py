import json
import subprocess
from io import BytesIO

import structlog

from ...storage import GenericStorage

logger = structlog.get_logger(__name__)


# Function to probe data using ffprobe
def ffprobe_stream(data):
    cmd = [
        "ffprobe",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "-i",
        "pipe:0",
    ]
    process = subprocess.Popen(  # noqa: S603
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stdout_data, stderr_data = process.communicate(input=data)
    return process.returncode, stdout_data, stderr_data


def get_possible_type_via_ffprobe(  # noqa: C901
    storage: GenericStorage, storage_folder_path: str, alternative="original"
):
    """
    This functions tries to only read the first bytes (then the last bytes) to get info,
    to be efficient.
    """
    BYTES_INCREMENT = 512
    total_bytes = storage.get_size(storage_folder_path=storage_folder_path)
    start_byte = 0

    file_blob, file_bytes, end_reached = storage.get_bytes_range(
        storage_folder_path=storage_folder_path,
        alternative=alternative,
        start=start_byte,
        end=start_byte + BYTES_INCREMENT,
    )
    buffer = BytesIO(file_bytes)

    end_reached = False
    ffprobe_returned_data = False
    while True:
        try:
            # put cursor at the beginning of the buffer
            buffer.seek(0)
            # probe the data
            code, stdout_data, _stderr_data = ffprobe_stream(buffer.read())
            if code == 0:
                ffprobe_returned_data = True
                analysis_result = analyze_ffprobe_output(stdout_data)
                # break if video
                if (analysis_result is not None and analysis_result["has_video"]) or (
                    analysis_result is not None and analysis_result["has_audio"]
                ):
                    return analysis_result

        except Exception:
            logger.exception("ffprobe_partial_analysis_failed", direction="forward")
            return None

        if end_reached:
            break

        if start_byte > 1024 + 1:
            # we stop looking for file headers after 1024 bytes
            break

        #### GET MORE BYTES
        start_byte += BYTES_INCREMENT + 1

        file_blob, file_bytes, end_reached = storage.get_bytes_range(
            storage_folder_path=storage_folder_path,
            alternative=alternative,
            start=start_byte,
            end=start_byte + BYTES_INCREMENT,
            blob=file_blob,
        )

        if file_bytes is None:
            break

        # TODO: confirm we had the new bytes at the end of the previous bytes
        buffer.seek(0, 2)
        buffer.write(file_bytes)

    # try backwards
    start_byte = total_bytes - BYTES_INCREMENT
    if start_byte < 0:
        start_byte = 0
    end_byte = total_bytes

    file_blob, file_bytes, end_reached = storage.get_bytes_range(
        storage_folder_path=storage_folder_path,
        alternative=alternative,
        start=start_byte,
        end=end_byte,
    )
    buffer = BytesIO(file_bytes)
    end_reached = False

    while True:
        try:
            # put cursor at the beginning of the buffer
            buffer.seek(0)
            # probe the data
            code, stdout_data, _stderr_data = ffprobe_stream(buffer.read())
            if code == 0:
                ffprobe_returned_data = True
                analysis_result = analyze_ffprobe_output(stdout_data)
                # break if video
                if (analysis_result is not None and analysis_result["has_video"]) or (
                    analysis_result is not None and analysis_result["has_audio"]
                ):
                    return analysis_result

        except Exception:
            logger.exception("ffprobe_partial_analysis_failed", direction="backward")
            return None

        if start_byte < total_bytes - 512:
            # we are 512 bytes away from the end but still no meta data
            # so we increase the BYTES_INCREMENT to 2Mo to go further backward
            BYTES_INCREMENT = 1024 * 1024 * 2
        if start_byte < total_bytes - 1024 * 1024 * 5:
            # 5 Mo backward -> we stop this loop
            break

        #### GET MORE BYTES
        start_byte -= BYTES_INCREMENT
        end_byte = start_byte + BYTES_INCREMENT - 1
        if start_byte < 0:
            start_byte = 0
        file_blob, file_bytes, end_reached = storage.get_bytes_range(
            storage_folder_path=storage_folder_path,
            alternative=alternative,
            start=start_byte,
            end=end_byte,
            blob=file_blob,
        )

        if file_bytes is None:
            break

        new_bytesio = BytesIO()
        new_bytesio.write(file_bytes)
        buffer.seek(0)
        new_bytesio.write(buffer.read())  # we append the previous buffer to the new bytes
        buffer = new_bytesio

    if not ffprobe_returned_data:
        return None

    return analyze_ffprobe_output(stdout_data)


def analyze_ffprobe_output(data):
    # parse ffprobe data
    try:
        ffprobe_data = json.loads(data)

        kind_from_ffmpeg = None
        has_audio = False
        has_video = False
        audio_codec = None
        video_codec = None
        for stream in ffprobe_data.get("streams", []):
            if stream["codec_type"] == "audio":
                has_audio = True
                audio_codec = stream.get("codec_name", "")
                continue
            if stream["codec_type"] == "video" and stream.get("disposition", {}).get("attached_pic", 0) < 1:
                has_video = True
                video_codec = stream.get("codec_name", "")
        if has_video:
            kind_from_ffmpeg = "video"
        elif has_audio:
            kind_from_ffmpeg = "audio"

        return {  # noqa: TRY300
            "kind_from_ffmpeg": kind_from_ffmpeg,
            # "extension": extension,
            "has_video": has_video,
            "video_codec": video_codec,
            "has_audio": has_audio,
            "audio_codec": audio_codec,
        }

    except Exception as exc:
        logger.warning("ffprobe_output_parse_failed", error_type=type(exc).__name__)
        return None
