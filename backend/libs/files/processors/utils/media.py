import contextlib
import json
import re
import subprocess
import sys
import traceback

from libs.logger import print, print_error


def analyze_local_file_with_ffprobe(file_path):
    # parse ffprobe data
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                "-i",
                file_path,
            ],
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )

        ffprobe_data = json.loads(result.stdout)

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

        # duration
        duration = None
        with contextlib.suppress(KeyError):
            duration = round(float(ffprobe_data["format"]["duration"]), 2)

        if duration is None:
            duration = get_video_duration_with_ffmpeg_null(file_path)

        # sample rate
        sample_rate = None
        try:
            for stream in ffprobe_data.get("streams", []):
                if stream["codec_type"] == "audio":
                    sample_rate = int(stream["sample_rate"])
                    break
        except Exception:
            # print("probe error:", e)
            # traceback.print_exc()
            pass

        # channels
        channels = None
        channel_layout = None
        try:
            for stream in ffprobe_data.get("streams", []):
                if stream["codec_type"] == "audio":
                    channels = int(stream["channels"])
                    channel_layout = stream["channel_layout"]
                    break
        except Exception:
            # print("probe error:", e)
            # traceback.print_exc()
            pass

        # bit depth
        bit_depth = None
        try:
            for stream in ffprobe_data.get("streams", []):
                if stream["codec_type"] == "audio":
                    bit_depth = int(float(stream.get("bits_per_raw_sample")))
                    break
        except Exception:
            pass
            # print("probe error:", e)
            # traceback.print_exc()

        # bit rate
        bit_rate = None
        try:
            for stream in ffprobe_data.get("streams", []):
                if stream["codec_type"] == "audio":
                    bit_rate = float(stream["bit_rate"])
                    break
        except Exception:
            pass
            # print("probe error:", e)
            # traceback.print_exc()

        width = None
        height = None
        try:
            for stream in ffprobe_data.get("streams", []):
                if stream["codec_type"] == "video":
                    width = float(stream["width"])
                    height = float(stream["height"])
                    break
        except Exception:
            pass
            # print("probe error:", e)
            # traceback.print_exc()

        return {
            "kind_from_ffmpeg": kind_from_ffmpeg,
            # "extension": extension,
            "has_video": has_video,
            "video_codec": video_codec,
            "has_audio": has_audio,
            "audio_codec": audio_codec,
            "duration": duration,
            "sample_rate": sample_rate,
            "channels": channels,
            "channel_layout": channel_layout,
            "bit_depth": bit_depth,
            "bit_rate": bit_rate,
            "width": width,
            "height": height,
        }

    except Exception as e:
        # trace
        traceback.print_exc()
        sys.stdout.flush()
        print_error("Error while parsing ffprobe")
        print(e)
        return None


def get_video_duration_with_ffmpeg_null(file_path):
    print("Trying to get duration through ffmpeg-null trick")
    try:
        # Run ffmpeg with null output to get the duration from the log
        result = subprocess.run(
            ["ffmpeg", "-i", file_path, "-f", "null", "-"],
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )

        # Combine stdout and stderr
        output = result.stderr + result.stdout

        # Use regex to find the duration in the output
        duration_match = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", output)

        if duration_match:
            hours = int(duration_match.group(1))
            minutes = int(duration_match.group(2))
            seconds = float(duration_match.group(3))
            total_seconds = hours * 3600 + minutes * 60 + seconds
            return total_seconds
        else:
            return None
    except:  # noqa
        return None
