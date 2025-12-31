
from .types import FILE_TYPES, FileType


def get_possible_types(path: str | None = None, first_bytes: bytes | None = None):
    if path is None and first_bytes is None:
        raise ValueError("path and obj cannot be both None")
    elif path is not None and first_bytes is not None:
        raise ValueError("path and obj cannot be both not None")
    elif path is not None:
        with open(path, "rb") as file:
            obj_: bytes = file.read(128)
    elif first_bytes is not None:
        obj_: bytes = first_bytes
    else:
        raise ValueError("This should not happen")

    stream = " ".join([f"{byte:02X}" for byte in obj_])

    matches: list[FileType] = []
    for file_type in FILE_TYPES:
        for signature in file_type.signature:
            offset = file_type.offset * 2 + file_type.offset
            if signature == stream[offset : len(signature) + offset]:
                # file_type is a match
                matches.append(file_type)

    return matches
