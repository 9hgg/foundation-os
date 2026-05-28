import uuid
from typing import Optional

import sqlalchemy as sa
import sqlmodel
from sqlalchemy import Index

from libs.mcp.display import ResourceDisplayProfile
from libs.resource import ResourceWithConfig
from libs.utils.types import SQLMODEL_BASE_CONFIG_DICT, BaseModelWithConfig


class FolderConfig(BaseModelWithConfig):
    __kind__ = "folderConfig"
    __description__ = "The config of a folder."
    __title__ = "Folder config"
    __private__ = False
    __category__ = "config"
    pass


class Folder(ResourceWithConfig, table=True):
    __tablename__ = "folders"
    __kind__ = "folder"
    __description__ = "Folder can contains any resource."
    __title__ = "Folder"
    __private__ = False
    __config_type__ = FolderConfig
    __mcp_display__ = ResourceDisplayProfile(
        kind="folder",
        title_fields=("name", "title", "id"),
        metadata_fields=("for_kind",),
        date_fields=("time_updated", "time_created"),
    )

    name: str | None

    parent_id: Optional[uuid.UUID] = sqlmodel.Field(
        sa_column=sa.Column(
            sa.ForeignKey("folders.id", ondelete="SET NULL"),
        ),
    )

    # Relationship to self to define hierarchy
    # parent: Optional["Folder"] = sqlmodel.Relationship(back_populates="subfolders")
    # subfolders: List["Folder"] = sqlmodel.Relationship(back_populates="parent")

    for_kind: str | None = None
    for_id: uuid.UUID | None = None

    config: FolderConfig = sqlmodel.Field(
        sa_type=sa.JSON,
        nullable=False,
        default_factory=lambda: FolderConfig(),
    )


# create index out of for_kind and for_id
Index("idx_folders_for", "folders.for_kind", "folders.for_id")


class FolderToResource(sqlmodel.SQLModel, table=True):
    """Any resource can be in a folder
    This table is used to "put a resource in a folder".
    This is independent of the "for" aspect of the folder.
    For example, a "app" folder for app "myapp" can contain:
     - a "file" resource,
     - a "folder" resource (different from a subfolder by the way),
     - a "task" resource,
       etc.
    """

    __tablename__ = "relation_folders_blocks"
    folder_id: uuid.UUID = sqlmodel.Field(
        sa_column=sa.Column(
            sa.ForeignKey("folders.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    resource_kind: str = sqlmodel.Field(primary_key=True)
    resource_id: uuid.UUID | None = sqlmodel.Field(primary_key=True)

    model_config = SQLMODEL_BASE_CONFIG_DICT
