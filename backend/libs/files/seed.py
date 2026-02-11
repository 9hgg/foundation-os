from rich import print

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

            storage_settings_db = StorageSettings.create(
                obj=LOCAL_STORAGE_SETTINGS, _db=db
            )
            print("storage_settings_db:",storage_settings_db)

    print_color("cyan", "[files.seed] done seeding files settings")
