from libs.db import context_db
from libs.logger import print_color

from .constants import (
    LOCAL_STORAGE_SETTINGS,
    LOCAL_STORAGE_SETTINGS_ID,
)
from .models import StorageSettings


def seed_file_settings():
    # Create the default storage settings for local storage
    print_color("cyan", "[files.seed] seeding files settings")

    with context_db() as db:
        if not StorageSettings.in_db(obj_id=LOCAL_STORAGE_SETTINGS_ID, _db=db):
            print_color(
                "cyan",
                "[files.seed] creating file settings (LOCAL)",
                LOCAL_STORAGE_SETTINGS_ID,
            )
            storage_settings_db = LOCAL_STORAGE_SETTINGS

            StorageSettings.create(obj=storage_settings_db, _db=db)

    print_color("cyan", "[files.seed] done seeding files settings")
