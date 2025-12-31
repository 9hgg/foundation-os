import uuid
from typing import Optional

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import (
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
    description: Optional[str] = None
    # e.g. "squared.jpg"
    alternative_filename: Optional[str] = None
    # vs "original" or "default". e.g. "squared", "720p", "1080p", "audio_only", ...
    storage_suffix: str
    size: Optional[float] = None
    mime: str  # e.g. "image/jpeg"
    kind: str  # e.g. "image", "video", "audio", ...
    extension: str  # e.g. ".jpg", ".mp4", ".mp3", ...
    presigned_url: Optional[str] = None
    presigned_url_expiration: Optional[float] = None


class ExtraDetailsFile(BaseModelWithConfig):
    # audio/video only
    duration: Optional[float] = None
    has_audio: Optional[bool] = False
    has_video: Optional[bool] = False
    width: Optional[float] = None
    height: Optional[float] = None
    sample_rate: Optional[float] = None
    channels: Optional[float] = None
    codec_audio: Optional[str] = None
    codec_video: Optional[str] = None
    alternative_formats: list[FileAlternative] = []


class FileConfig(BaseModelWithConfig):
    __kind__ = "fileConfig"
    __description__ = "The config of a file."
    __title__ = "File config"
    __private__ = True
    __category__ = "config"

    client_duration: Optional[float] = None


class File(ResourceWithConfig, table=True):
    __tablename__ = "files"
    __kind__ = "file"
    __title__ = "File"
    __description__ = "A file holds the data to retrieve a file from the server."
    __config_type__ = FileConfig
    __extra_type__ = ExtraDetailsFile

    public_filename: Optional[str] = None
    description: Optional[str] = None

    extension: Optional[str] = None
    kind: Optional[str] = None  # audio, video, image, pdf, ...

    # FROM CLIENT
    extension_client: Optional[str] = None  # to use as default until extension is available
    # (=content_type) to use as default for mime until available
    mime_client: Optional[str] = None
    original_filename: Optional[str] = None
    size_client: Optional[float] = None

    unprocessable: Optional[bool] = None  # None until we have a way to check if a file is unprocessable
    mime: Optional[str] = None
    size: Optional[float] = None

    storage_id: Optional[uuid.UUID] = sqlmodel.Field(nullable=False, foreign_key="storage_settings.id")
    # storage_db: Storage | None = sqlmodel.Relationship(back_populates="files")

    # the path to the file in the storage
    # (folder name, file name, ...): anything
    # used by the StorageClass to retrieve the file
    storage_folder_path: Optional[str] = None
    in_storage: bool = sqlmodel.Field(sa_column=sa.Column(sa.Boolean, nullable=False, server_default="false"))
    upload_url: Optional[str] = None

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
