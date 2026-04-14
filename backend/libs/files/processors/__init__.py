import typing

from ._generic import GenericProcessor
from .audio import AudioProcessor
from .document import DocumentProcessor
from .image import ImageProcessor
from .video import VideoProcessor

PROCESSOR_MAPPING: dict[str, type[GenericProcessor]] = {
    "audio": AudioProcessor,
    "document": DocumentProcessor,
    "image": ImageProcessor,
    # "text": TextProcessor,
    "video": VideoProcessor,
}
