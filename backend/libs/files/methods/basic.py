import errno
import os
import tempfile
import urllib.request

############################################################
#                                                          #
#                         BASICS                           #
#                                                          #
############################################################


def mkdir_p(path):
    """
    Create a directory if it does not exist
    Args:
        path (str): path to the directory
    """
    try:
        os.makedirs(path)
    except OSError as exc:  # Python >2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise


def delete_local_file(path: str, handle: int | None = None):
    """
    Delete local file
    """
    try:
        if handle is not None:
            os.close(handle)
        os.remove(path)
        return True
    except Exception:
        return False


def download_locally(url: str, filename: str):
    """
    Download an url to a local file
    """
    tmp_local_filename = None
    try:
        mkstemp_handle, tmp_local_filename = tempfile.mkstemp()
        urllib.request.urlretrieve(url, tmp_local_filename)  # type: ignore
        os.close(mkstemp_handle)
        return tmp_local_filename
    except Exception as e:
        print("download_locally: error while downloading file", e)
        try:
            if tmp_local_filename:
                os.remove(tmp_local_filename)
        except Exception:
            pass
        tmp_local_filename = None

    return tmp_local_filename
