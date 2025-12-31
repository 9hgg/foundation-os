import errno
import os

from .config import FILES_UTILS_SETTINGS


def mkdir_p(path: str) -> None:
    """
    Create a directory and its parent directories if they do not exist.
    Args:
        path (str): The path of the directory to be created.
    Raises:
        OSError: If an error occurs while creating the directory.
    """

    try:
        os.makedirs(path)
    except OSError as exc:  # Python >2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise


def get_or_create_temp_folder(folder_name="my_temp_folder"):
    # Get the system's temporary directory

    # temp_dir = tempfile.gettempdir()

    temp_dir = FILES_UTILS_SETTINGS.STORAGE_FOLDER

    # Path to the custom temporary folder
    custom_temp_path = os.path.join(temp_dir, folder_name)

    print("CUSTOM TEMP DIR:", custom_temp_path)
    print("Absolute path:", os.path.abspath(custom_temp_path))

    # Create the folder if it doesn't already exist
    os.makedirs(custom_temp_path, exist_ok=True)

    return custom_temp_path


def add_subfolder(folder_path: str, subfolder: str):
    full_path = os.path.join(folder_path, subfolder)
    os.makedirs(full_path, exist_ok=True)
