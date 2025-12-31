import uuid

from sqlalchemy.orm import Session

from ..models import StorageSettings
from ._generic import GenericStorage
from .local import LocalStorage
from .storage_manager import StoragesManager

# always register the LocalStorage class
StoragesManager.register_storage("local")(LocalStorage)


def get_storage(storage_settings: StorageSettings):
    storage_class = StoragesManager.get_storage(storage_settings.kind)
    if storage_class is None:
        raise Exception(f"Unknown storage kind: {storage_settings.kind}")

    return storage_class(storage_settings=storage_settings)


CACHED_STORAGE: dict[uuid.UUID, GenericStorage] = {}


def get_file_storage(
    storage_id: uuid.UUID, _db: Session | None = None
) -> GenericStorage:
    """
    Get the storage of a file.
    Use the storage_id of the file to get the storage_settings.
    Use the storage_settings to get the storage.
    """

    if storage_id in CACHED_STORAGE:
        # print("Using cached storage")
        return CACHED_STORAGE[storage_id]

    storage_settings = StorageSettings.by_id(storage_id, _db=_db)
    if storage_settings is None:
        raise Exception("Storage not found")
    app_storage = get_storage(storage_settings)
    CACHED_STORAGE[storage_id] = app_storage
    return app_storage
