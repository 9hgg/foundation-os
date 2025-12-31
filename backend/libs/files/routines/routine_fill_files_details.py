import signal
import typing
import uuid

from libs.db import context_db
from libs.files.models import File
from libs.files.tasks import fill_file_details
from libs.logger import print

shutdown = False


def signal_handler(sig, frame):
    print("Signal to stop received. Waiting for current task to finish...")
    global shutdown
    shutdown = True


signal.signal(signal.SIGINT, signal_handler)


with context_db() as db:
    file_id_tuples: list[typing.Tuple[uuid.UUID]] = (
        db.query(File.id).where(File.mime == None).all()  # noqa: E711
    )

for file_id in file_id_tuples:
    if shutdown:
        print("Exiting gracefully...")
        exit(0)
    fill_file_details(None, file_id[0])
    # break
print("Done")
