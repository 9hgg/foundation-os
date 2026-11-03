import uuid

import sqlalchemy as sa
import sqlmodel
from pydantic import ConfigDict, Field
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import (
    ResourceDisplayProfile,
    ResourceWithConfig,
)
from libs.utils.types import BaseModelWithConfig


class StorageSettings(ResourceWithConfig, table=True):
    """
    StorageSettings model class.
    This class represents the settings required to configure a storage system.
    It inherits from ResourceWithConfig and uses SQLModel for ORM capabilities.
    Attributes:
        `__tablename__` (str): The name of the database table.
        `__kind__` (str): The kind of resource, set to "storage_settings".
        `__title__` (str): The title of the resource, set to "Storage setting".
        `__description__` (str): A description of the resource.
        `__private__` (bool): Indicates if the resource is private.
        `name` (str): The name of the storage setting, can be nullable.
        `kind` (str): The type of storage, such as GCP, S3, or local. Defaults to "gcp".
        `config` (dict): A dictionary containing the configuration details for the storage. Uses JSONB for `storage` in the database.
    """

    __tablename__ = "storage_settings"
    __kind__: str = "storage_settings"
    __title__: str = "Storage setting"
    __description__: str = "A StorageSettings contains all the details to implement a 'Storage'"
    __private__: bool = True
    __config_type__ = dict

    name: str = sqlmodel.Field(nullable=True)

    # can be GCP, S3, local, ...
    kind: str = sqlmodel.Field(nullable=False, default="gcp")

    config: dict = sqlmodel.Field(sa_column=sa.Column(JSONB, nullable=False), default_factory=dict)


class FileAlternative(BaseModelWithConfig):
    description: str | None = None
    # e.g. "squared.jpg"
    alternative_filename: str | None = None
    # vs "original" or "default". e.g. "squared", "720p", "1080p", "audio_only", ...
    storage_suffix: str
    size: float | None = None
    mime: str  # e.g. "image/jpeg"
    kind: str  # e.g. "image", "video", "audio", ...
    extension: str  # e.g. ".jpg", ".mp4", ".mp3", ...
    presigned_url: str | None = None
    presigned_url_expiration: float | None = None


class ExtraDetailsFile(BaseModelWithConfig):
    # Tolerate unknown keys (e.g. the legacy "hash" key, now promoted to the top-level
    # File.hash/hash_client columns) instead of the base model's extra="forbid" -- this is
    # stored JSONB that accumulates fields across schema versions, and rows written before a
    # field was removed must still load without crashing until backfilled.
    model_config = ConfigDict(**{**BaseModelWithConfig.model_config, "extra": "ignore"})

    # audio/video only
    duration: float | None = None
    has_audio: bool | None = False
    has_video: bool | None = False
    width: float | None = None
    height: float | None = None
    sample_rate: float | None = None
    channels: float | None = None
    codec_audio: str | None = None
    codec_video: str | None = None
    alternative_formats: list[FileAlternative] = Field(default_factory=list)


class FileConfig(BaseModelWithConfig):
    __kind__ = "fileConfig"
    __description__ = "The config of a file."
    __title__ = "File config"
    __private__ = True
    __category__ = "config"

    client_duration: float | None = None


class File(ResourceWithConfig, table=True):
    __tablename__ = "files"
    __kind__ = "file"
    __title__ = "File"
    __description__ = "A file holds the data to retrieve a file from the server."
    __config_type__ = FileConfig
    __extra_type__ = ExtraDetailsFile
    __display_profile__ = ResourceDisplayProfile(
        kind="file",
        title_fields=("public_filename", "original_filename", "filename", "name", "id"),
        subtitle_fields=("description", "mime"),
        status_fields=("unprocessable", "in_storage"),
        date_fields=("time_updated", "time_created"),
        metadata_fields=("kind", "mime", "extension", "size", "size_client", "duration", "width", "height", "has_audio", "has_video"),
    )

    public_filename: str | None = sqlmodel.Field(default=None, description="Human-readable name shown to users. Use this field to search by file name.")
    description: str | None = sqlmodel.Field(default=None, description="Optional free-text description of the file.")

    extension: str | None = sqlmodel.Field(default=None, description="File extension resolved after processing, e.g. '.mp4', '.jpg', '.pdf'.")
    kind: str | None = sqlmodel.Field(default=None, description="Media kind: 'audio', 'video', 'image', 'pdf', or other.")

    # FROM CLIENT
    extension_client: str | None = sqlmodel.Field(default=None, description="Extension as reported by the client before server-side processing.")
    mime_client: str | None = sqlmodel.Field(default=None, description="MIME type as reported by the client, e.g. 'video/quicktime'.")
    original_filename: str | None = sqlmodel.Field(default=None, description="Original filename as uploaded by the client, before any renaming.")
    size_client: float | None = sqlmodel.Field(default=None, description="File size in bytes as reported by the client.")
    hash_client: str | None = sqlmodel.Field(default=None, description="SHA-256 hex digest as computed by the client before upload, e.g. for immediate content-based duplicate detection before the server-side hash is ready.")

    unprocessable: bool | None = sqlmodel.Field(default=None, description="True if the file could not be processed; None while status is unknown.")
    mime: str | None = sqlmodel.Field(default=None, description="Server-resolved MIME type, e.g. 'image/jpeg'.")
    size: float | None = sqlmodel.Field(default=None, description="File size in bytes resolved after upload.")
    hash: str | None = sqlmodel.Field(default=None, description="SHA-256 hex digest of the file content, computed server-side independently of media processing. None for files not hashed yet.")

    storage_id: uuid.UUID | None = sqlmodel.Field(default=None, nullable=False, foreign_key="storage_settings.id", description="ID of the storage backend that holds this file.")
    storage_folder_path: str | None = sqlmodel.Field(default=None, description="Internal path within the storage backend.")
    in_storage: bool = sqlmodel.Field(sa_column=sa.Column(sa.Boolean, nullable=False, server_default="false"), description="True once the file has been successfully uploaded to storage.")
    upload_url: str | None = sqlmodel.Field(default=None, description="Temporary pre-signed URL for the client to upload the file.")

    # extra data, can be used by the StorageClass
    # to store extra data like alternative formats, ...
    extra: ExtraDetailsFile = sqlmodel.Field(
        sa_column=sa.Column(JSONB, nullable=False),
        default_factory=lambda: ExtraDetailsFile(),
    )

    @property
    def extra_(self) -> ExtraDetailsFile:
        if isinstance(self.extra, ExtraDetailsFile):
            return self.extra
        self.extra = ExtraDetailsFile(**self.extra)
        return self.extra

    @extra_.setter
    def extra_(self, value: ExtraDetailsFile | dict):
        if isinstance(value, dict):
            value = ExtraDetailsFile(**value)
        self.extra = value

    def model_post_init(self, __context):
        super().model_post_init(__context)
        if isinstance(self.extra, dict):
            self.extra = ExtraDetailsFile(**self.extra)
        if isinstance(self.storage_id, str):
            self.storage_id = uuid.UUID(self.storage_id)

    config: FileConfig = sqlmodel.Field(sa_type=JSONB, nullable=False, default_factory=lambda: FileConfig())
