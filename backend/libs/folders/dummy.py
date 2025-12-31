import random
import uuid

from libs.db import context_db
from libs.folders.methods import get_subfolders
from libs.folders.models import Folder


def seed_1000_random_folders_with_subfolders():
    with context_db() as db:
        folder_ids = [x[0] for x in db.query(Folder.id).all()]
        print(f"Found {len(folder_ids)} folders", folder_ids[:10])
        for i in range(5000):
            new_folder_id = uuid.uuid4()
            Folder.create(
                obj_dict={
                    "id": new_folder_id,
                    "name": f"Folder {1000 + i}",
                    "parent_id": random.choice(folder_ids) if folder_ids else None,
                },
            )
            folder_ids.append(new_folder_id)


def print_folder_recursive(folder_id: uuid.UUID, level: int = 0):
    folder = Folder.get_first_by(id=folder_id)
    if not folder:
        return

    # print(level * "\t" + f"- {level} {folder.name} - {folder.id}")

    sub_folders = get_subfolders(folder_id=folder.id)
    for f in sub_folders:
        # if f.id != folder_id:
        #     continue
        if f.parent_id != folder_id:
            continue
        print_folder_recursive(folder_id=f.id, level=level + 1)


def get_some_example():
    original_folder = Folder.get_first_by(id="e78e60eb-6cec-46ef-b357-493d71ef0acc")
    if not original_folder:
        return

    print(original_folder)

    sub_folders = get_subfolders(folder_id=original_folder.id)
    print(f"Found {len(sub_folders)} subfolders")
    # print_folder_recursive(folder_id=original_folder.id)


if __name__ == "__main__":
    # seed_1000_random_folders_with_subfolders()

    get_some_example()
