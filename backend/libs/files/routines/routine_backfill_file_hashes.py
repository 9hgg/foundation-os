"""Backfill missing file hashes.

Preview by default::

    python -m libs.files.routines.routine_backfill_file_hashes

Pass ``--apply`` explicitly to download originals and persist their SHA-256
digests. Existing hashes are skipped by the task as an additional safeguard.
"""

import argparse
import signal
import uuid

import structlog

from libs.db import context_db
from libs.files.models import File
from libs.files.tasks import fill_file_hash

logger = structlog.get_logger(__name__)
shutdown = False


def _request_shutdown(_signal_number, _frame) -> None:
    global shutdown
    shutdown = True
    logger.info("file_hash_backfill_shutdown_requested")


def _fetch_file_batch(
    *, after_id: uuid.UUID | None, batch_size: int
) -> list[tuple[uuid.UUID, str | None]]:
    """Fetch one bounded page, closing the DB context before returning."""
    with context_db() as db:
        query = db.query(File.id, File.hash).filter(File.in_storage.is_(True))
        if after_id is not None:
            query = query.filter(File.id > after_id)
        return query.order_by(File.id).limit(batch_size).all()


def backfill_file_hashes(*, apply: bool = False, batch_size: int = 500) -> tuple[int, int]:
    """Return ``(missing, processed)``; mutate storage metadata only if applied."""
    if batch_size < 1:
        raise ValueError

    global shutdown
    shutdown = False
    missing = 0
    processed = 0
    after_id: uuid.UUID | None = None
    while not shutdown:
        rows = _fetch_file_batch(after_id=after_id, batch_size=batch_size)
        if not rows:
            break
        # Advance past the entire page, including failed and already-hashed
        # rows. A bad storage object can therefore never be selected forever.
        after_id = rows[-1][0]
        for file_id, hash_ in rows:
            if hash_ is not None:
                continue
            missing += 1
            if not apply:
                continue
            if shutdown:
                break
            try:
                if fill_file_hash(file_id) is not None:
                    processed += 1
            except Exception:
                logger.exception(
                    "file_hash_backfill_file_failed",
                    file_id=str(file_id),
                )

    logger.info(
        "file_hash_backfill_completed" if apply else "file_hash_backfill_preview",
        missing_count=missing,
        processed_count=processed,
        interrupted=shutdown,
        apply=apply,
    )
    return missing, processed


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill SHA-256 hashes for stored files")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="persist missing hashes (without this flag, only report the count)",
    )
    args = parser.parse_args()
    signal.signal(signal.SIGINT, _request_shutdown)
    backfill_file_hashes(apply=args.apply)


if __name__ == "__main__":
    main()
