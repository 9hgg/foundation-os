import typing

from fastapi import Depends, Request

from libs.files.config import FILES_SETTINGS
from libs.files.storage.methods import get_file_storage

from ..storage._generic import GenericStorage


def get_default_file_storage(
    #
    request: Request,
) -> GenericStorage | None:


    return get_file_storage(FILES_SETTINGS.DEFAULT_STORAGE_ID)


    # if settings.CURRENT_ENV == "prod":
    #     from ..constants import (
    #         GCP_STORAGE,
    #     )

    #     default_storage: GenericStorage = GCP_STORAGE
    # elif settings.CURRENT_ENV == "dev":
    #     from ..constants import (
    #         DEV_GCP_STORAGE,
    #     )

    #     default_storage = DEV_GCP_STORAGE
    # elif settings.CURRENT_ENV == "devLocal":
    #     from ..constants import (
    #         LOCAL_STORAGE,
    #     )

    #     default_storage = LOCAL_STORAGE

    # return default_storage
    # return settings.DEFAULT_STORAGE


CurrentStorage__dep = typing.Annotated[GenericStorage | None, Depends(get_default_file_storage)]
