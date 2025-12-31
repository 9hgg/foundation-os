import os
from uuid import UUID

from .models import StorageSettings
from .storage.local import LocalStorage, LocalStorageConfig

cwd = os.getcwd()


# DEV LOCAL : storage for development purposes
LOCAL_STORAGE_SETTINGS_ID = UUID("fe180252-e274-0be4-ebdf-54c5c5726245")
LOCAL_STORAGE_CONFIG = LocalStorageConfig(
    path=f"{cwd}/storage",
)
LOCAL_STORAGE_SETTINGS = StorageSettings(
    id=LOCAL_STORAGE_SETTINGS_ID,
    name="DEFAULT_LOCAL",
    kind="local",
    config=LOCAL_STORAGE_CONFIG.model_dump(),
)
LOCAL_STORAGE = LocalStorage(
    storage_settings=LOCAL_STORAGE_SETTINGS,
)
