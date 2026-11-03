import structlog
from rich import print

from libs.db import context_db

from .constants import (
    LOCAL_STORAGE_SETTINGS,
    LOCAL_STORAGE_SETTINGS_ID,
)
from .models import StorageSettings

logger = structlog.get_logger(__name__)


def seed_file_settings():
    # Create the default storage settings for local storage
    logger.info("files_seed_started")

    with context_db() as db:
        if not StorageSettings.in_db(obj_id=LOCAL_STORAGE_SETTINGS_ID, _db=db):
            logger.info("file_settings_created", settings_id=LOCAL_STORAGE_SETTINGS_ID)

            storage_settings_db = StorageSettings.create(
                obj=LOCAL_STORAGE_SETTINGS, _db=db
            )
            print("storage_settings_db:",storage_settings_db)

    logger.info("files_seed_completed")
