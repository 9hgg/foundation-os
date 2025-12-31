import signal
import typing
import uuid

from libs.db import context_db
from libs.files.models import File
from libs.files.tasks import generate_file_alternatives
from libs.logger import print

shutdown = False


def signal_handler(sig, frame):
    print("Signal to stop received. Waiting for current task to finish...")
    global shutdown
    shutdown = True


signal.signal(signal.SIGINT, signal_handler)


with context_db() as db:
    file_id_tuples: list[typing.Tuple[uuid.UUID]] = db.query(File.id).all()

for file_id in file_id_tuples:
    if shutdown:
        print("Exiting gracefully...")
        exit(0)
    generate_file_alternatives(None, file_id[0])
    # break
print("Done")
