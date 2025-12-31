from ._generic import GenericStorage
from .local import LocalStorage
from .methods import get_file_storage
from .storage_manager import StoragesManager

__all__ = ["GenericStorage", "LocalStorage", "StoragesManager", "get_file_storage"]
