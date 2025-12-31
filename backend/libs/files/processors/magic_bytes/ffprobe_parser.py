import json
import subprocess
import sys
import traceback
from io import BytesIO

from libs.logger import print, print_error

from ...storage import GenericStorage


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
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout_data, stderr_data = process.communicate(input=data)
    return process.returncode, stdout_data, stderr_data


def get_possible_type_via_ffprobe(storage: GenericStorage, storage_folder_path: str, alternative="original"):
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
            code, stdout_data, stderr_data = ffprobe_stream(buffer.read())
            # print_color("blue", "probe_result code:", code)
            # print_color("green", "probe_result stdout_data:", stdout_data)
            # print_color("red", "probe_result stderr_data:", stderr_data)
            if code == 0:
                ffprobe_returned_data = True
                analysis_result = analyze_ffprobe_output(stdout_data)
                # break if video
                if analysis_result is not None and analysis_result["has_video"]:
                    # print_color("yellow", "ffprobe returned data with video")
                    return analysis_result
                elif analysis_result is not None and analysis_result["has_audio"]:
                    # print_color("yellow", "ffprobe returned data with audio only")
                    return analysis_result

        except Exception as e:
            # trace
            traceback.print_exc()
            sys.stdout.flush()
            print_error("Error while parsing ffprobe")
            print(e)
            return None

        if end_reached:
            # print("End reached forward", start_byte, start_byte + BYTES_INCREMENT)
            break

        if start_byte > 1024 + 1:
            # we stop looking for file headers after 1024 bytes
            # print_warning("start_byte > 1025, stopping forward")
            break

        #### GET MORE BYTES
        # print("getting more bytes over blob")
        start_byte += BYTES_INCREMENT + 1

        file_blob, file_bytes, end_reached = storage.get_bytes_range(
            storage_folder_path=storage_folder_path,
            alternative=alternative,
            start=start_byte,
            end=start_byte + BYTES_INCREMENT,
            blob=file_blob,
        )

        if file_bytes is None:
            # print("No file bytes when going forward")
            break

        # TODO: confirm we had the new bytes at the end of the previous bytes
        buffer.seek(0, 2)
        buffer.write(file_bytes)

        # print buffer size
        # print("buffer size:", buffer.tell(), "/", total_bytes)

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
            code, stdout_data, stderr_data = ffprobe_stream(buffer.read())
            # print_color("blue", "probe_result code:", code)
            # print_color("green", "probe_result stdout_data:", stdout_data)
            # print_color("red", "probe_result stderr_data:", stderr_data)
            if code == 0:
                ffprobe_returned_data = True
                analysis_result = analyze_ffprobe_output(stdout_data)
                # break if video
                if analysis_result is not None and analysis_result["has_video"]:
                    # print_color("yellow", "ffprobe returned data with video backwards")
                    return analysis_result
                # break if audio
                elif analysis_result is not None and analysis_result["has_audio"]:
                    # print_color(
                    #     "yellow", "ffprobe returned data with audio only backwards"
                    # )
                    return analysis_result
            # else:
            #     print("ffprobe error at start_byte:", start_byte, total_bytes)

        except Exception as e:
            # trace
            traceback.print_exc()
            sys.stdout.flush()
            print_error("Error while parsing ffprobe backwards")
            print(e)
            return None

        # if end_reached:
        #     not relevant for backward
        #     print_warning("end_reached")
        #     break

        if start_byte < total_bytes - 512:
            # we are 512 bytes away from the end but still no meta data
            # so we increase the BYTES_INCREMENT to 2Mo to go further backward
            BYTES_INCREMENT = 1024 * 1024 * 2
            # print_warning("start_byte < total_bytes - 512")
        if start_byte < total_bytes - 1024 * 1024 * 5:
            # 5 Mo backward -> we stop this loop
            # print_warning("start_byte < total_bytes - 1024 * 1024 * 5")
            break

        #### GET MORE BYTES
        # print("getting more bytes over blob backwards")
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
            # print("No file bytes when going backwards")
            break

        new_bytesio = BytesIO()
        new_bytesio.write(file_bytes)
        buffer.seek(0)
        new_bytesio.write(buffer.read())  # we append the previous buffer to the new bytes
        buffer = new_bytesio

        # print buffer size
        # print("BACKWARD buffer size:", buffer.tell(), "/", total_bytes)

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

        return {
            "kind_from_ffmpeg": kind_from_ffmpeg,
            # "extension": extension,
            "has_video": has_video,
            "video_codec": video_codec,
            "has_audio": has_audio,
            "audio_codec": audio_codec,
        }

    except Exception as e:
        # trace
        traceback.print_exc()
        sys.stdout.flush()
        print_error("Error while parsing ffprobe")
        print(e)
        return None


# def get_media_info(
#     local_file_path: str,
#     title: str = "",
# ) -> typing.Union[dict, None]:
#     file_stats = os.stat(local_file_path)

#     code, stdout_data, stderr_data = probe_media(buffer.read())
#     ffprobe_data = json.loads(data)

#     has_audio = False
#     has_video = False
#     try:
#         for stream in ffprobe_data.get("streams", []):
#             if stream["codec_type"] == "audio":
#                 has_audio = True
#                 continue
#             if (
#                 stream["codec_type"] == "video"
#                 and stream.get("disposition", {}).get("attached_pic", 0) < 1
#             ):
#                 has_video = True
#     except:
#         pass

#     # duration
#     duration = None
#     try:
#         duration = round(float(ffprobe_data["format"]["duration"]), 2)
#     except Exception as e:
#         print("probe error on duration:", e)
#         traceback.print_exc()
#         pass

#     # sample rate
#     sample_rate = None
#     try:
#         for stream in ffprobe_data.get("streams", []):
#             if stream["codec_type"] == "audio":
#                 sample_rate = int(stream["sample_rate"])
#                 break
#     except Exception:
#         # print("probe error:", e)
#         # traceback.print_exc()
#         pass

#     # channels
#     channels = None
#     channel_layout = None
#     try:
#         for stream in ffprobe_data.get("streams", []):
#             if stream["codec_type"] == "audio":
#                 channels = int(stream["channels"])
#                 channel_layout = stream["channel_layout"]
#                 break
#     except Exception:
#         # print("probe error:", e)
#         # traceback.print_exc()
#         pass

#     # bit depth
#     bit_depth = None
#     try:
#         for stream in ffprobe_data.get("streams", []):
#             if stream["codec_type"] == "audio":
#                 bit_depth = int(float(stream.get("bits_per_raw_sample")))
#                 break
#     except Exception:
#         pass
#         # print("probe error:", e)
#         # traceback.print_exc()

#     # bit rate
#     bit_rate = None
#     try:
#         for stream in ffprobe_data.get("streams", []):
#             if stream["codec_type"] == "audio":
#                 bit_rate = float(stream["bit_rate"])
#                 break
#     except Exception:
#         pass
#         # print("probe error:", e)
#         # traceback.print_exc()

#     width = None
#     height = None
#     try:
#         for stream in ffprobe_data.get("streams", []):
#             if stream["codec_type"] == "video":
#                 width = float(stream["width"])
#                 height = float(stream["height"])
#                 break
#     except Exception:
#         pass
#         # print("probe error:", e)
#         # traceback.print_exc()

#     # rms = None
#     # lDBFS = None
#     # if not ignore_pydub:
#     #     try:
#     #         clear_sound_after = False
#     #         if sound is None:
#     #             clear_sound_after = True
#     #             sound = pydub.AudioSegment.from_file(local_file_path)
#     #         rms = sound.rms
#     #         lDBFS = round(sound.dBFS, 2)
#     #         if clear_sound_after:
#     #             del sound
#     #     except Exception as e:
#     #         print("pydub error:", e)
#     #         traceback.print_exc()

#     return {
#         "title": title,
#         "duration": duration,
#         "sample_rate": sample_rate,
#         "channels": channels,
#         "channel_layout": channel_layout,
#         "bit_depth": bit_depth,
#         "bit_rate": bit_rate,
#         # "rms": rms,
#         # "lDBFS": lDBFS,
#         "size_bytes": file_stats.st_size,
#         "size_megabytes": file_stats.st_size / (1024 * 1024),
#         "width": width,
#         "height": height,
#         "has_audio": has_audio,
#         "has_video": has_video,
#     }
