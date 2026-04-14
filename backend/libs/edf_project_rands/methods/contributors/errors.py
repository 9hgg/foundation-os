"""Extraction-related exceptions for contributors extractors."""

class ExtractionError(Exception):
    """Base class for extraction-related errors."""


class FileLookupError(ExtractionError):
    def __init__(self, file_id: str):
        super().__init__(f"File not found: {file_id}")


class StorageLookupError(ExtractionError):
    def __init__(self, storage_id: str):
        super().__init__(f"Storage error: {storage_id}")


class FileDownloadError(ExtractionError):
    def __init__(self, file_id: str):
        super().__init__(f"Failed to download file: {file_id}")
