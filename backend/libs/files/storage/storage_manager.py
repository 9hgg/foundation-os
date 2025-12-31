import typing
from typing import ClassVar

from libs.logger.customLogger import print
from libs.utils.types import BaseModelWithConfig

from ._generic import GenericStorage


class AlreadyEnlistedStorageError(Exception):
    """Exception raised when trying to enlist a storage that is already registered."""

    def __init__(self, storage_name: str):
        super().__init__(f"Storage '{storage_name}' is already enlisted.")
        self.storage_name = storage_name


class StorageNotFoundError(Exception):
    """Exception raised when a requested storage is not found."""

    def __init__(self, storage_name: str):
        super().__init__(f"Storage '{storage_name}' not found.")
        self.storage_name = storage_name


class EnlistedStorage(BaseModelWithConfig):
    config_name: str
    storage: type[GenericStorage]


class StoragesManager:
    """Storages manager"""

    storages: ClassVar[dict[str, EnlistedStorage]] = {}

    @classmethod
    def register_storage(
        #
        cls,
        storage_name: str = "default",
    ):
        """Register a storage"""

        def decorator(fn: typing.Callable, storage_name=storage_name):
            if storage_name is None:
                storage_name = fn.__name__
            if storage_name in cls.storages:
                raise AlreadyEnlistedStorageError(storage_name)
            storage_class = EnlistedStorage(config_name=storage_name, storage=fn)
            cls.storages[storage_name] = storage_class
            print(f"💾 Storage {storage_name} registered")
            return fn

        return decorator

    @classmethod
    def get_storage(cls, config_name: str = "default") -> GenericStorage:
        """Get a storage by name"""
        if config_name not in cls.storages:
            raise StorageNotFoundError(config_name)
        return cls.storages[config_name].storage
