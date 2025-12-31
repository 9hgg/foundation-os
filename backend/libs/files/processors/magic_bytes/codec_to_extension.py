CODEC_CONTAINER_MAP = {
    "Video": {
        "H.264": ["mp4", "mkv", "mov", "flv", "avi", "ts", "3gp"],
        "HEVC": ["mp4", "mkv", "mov", "ts"],
        "MPEG-4": ["mp4", "mkv", "mov", "avi"],
        "VP8": ["webm", "mkv"],
        "VP9": ["webm", "mkv"],
        "AV1": ["mp4", "mkv", "webm"],
        "Theora": ["ogg", "ogv", "mkv"],
        "WMV": ["wmv", "asf"],
        "DivX": ["avi", "mkv", "divx"],
        "XviD": ["avi", "mkv"],
        "ProRes": ["mov", "mkv"],
        "Motion JPEG": ["mov", "avi", "mkv"],
        "Sorenson Spark": ["flv"],
        "VP6": ["flv", "mkv"],
        "MPEG-2": ["mpg", "mpeg", "ts", "vob", "mkv"],
    },
    "Audio": {
        "AAC": ["mp4", "mkv", "mov", "flv", "3gp", "aac", "m4a"],
        "MP3": ["mp3", "webm", "mp4", "mkv", "mov", "avi"],
        "FLAC": ["flac", "webm", "mkv"],
        "AC3": ["mkv", "avi", "ac3"],
        "PCM": ["wav", "mov", "avi", "mkv"],
        "Opus": ["webm", "opus", "ogg", "mkv"],
        "Vorbis": ["ogg", "ogv", "webm", "mkv"],
        "WMA": ["wmv", "wma", "asf"],
        "ALAC": ["m4a", "mov", "mp4", "mkv"],
        "DTS": ["mkv", "dts", "ts", "m2ts"],
        "E-AC-3": ["mkv", "eac3", "ts", "m2ts"],
        "Speex": ["ogg", "spx", "mkv"],
    },
}


def recommend_extension(*, video_codec: str | None, audio_codec: str | None) -> str | None:
    # ensure one is not none
    if video_codec is None and audio_codec is None:
        print("Both video_codec and audio_codec cannot be None")
        return

    # Convert the keys in the CODEC_CONTAINER_MAP to lowercase for comparison
    video_containers = set()
    if video_codec is not None:
        video_codec = video_codec.lower()
        for codec, containers in CODEC_CONTAINER_MAP["Video"].items():
            if codec.lower() == video_codec:
                video_containers = set(containers)
                break

    audio_containers = set()
    if audio_codec is not None:
        audio_codec = audio_codec.lower()
        for codec, containers in CODEC_CONTAINER_MAP["Audio"].items():
            if codec.lower() == audio_codec:
                audio_containers = set(containers)
                break

    # Find the intersection of compatible containers for both audio and video codecs
    if video_codec is None:
        return next(iter(audio_containers))
    elif audio_codec is None:
        return next(iter(video_containers))
    else:
        common_containers = video_containers.intersection(audio_containers)
        if common_containers:
            return next(iter(common_containers))
        else:
            print("No common container format found for the given codecs.")
            return
