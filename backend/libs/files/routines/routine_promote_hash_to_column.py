"""One-time migration: promote the legacy ``extra["hash"]`` JSONB entry to the
new top-level ``hash`` column, and seed ``hash_client`` from ``hash`` for any
row that doesn't have one yet -- historical uploads have no original
client-computed hash on file, so the server-computed one is the best
available stand-in.

Also strips the now-redundant ``hash`` key out of ``extra`` on every row it
touches, so there is only ever one place a file's hash can live going
forward.

Preview by default::

    python -m libs.files.routines.routine_promote_hash_to_column

Pass ``--apply`` explicitly to persist.
"""

import argparse
import signal
import uuid

import structlog

from libs.db import context_db
from libs.files.models import File

logger = structlog.get_logger(__name__)
shutdown = False


def _request_shutdown(_signal_number, _frame) -> None:
    global shutdown
    shutdown = True
    logger.info("file_hash_promote_shutdown_requested")


def _legacy_hash(extra: object) -> str | None:
    if isinstance(extra, dict):
        return extra.get("hash")
    return getattr(extra, "hash", None)


def _needs_promotion(*, hash_: str | None, hash_client: str | None, extra: object) -> bool:
    legacy = _legacy_hash(extra)
    if legacy is not None:
        return True
    return bool(hash_ is not None and hash_client is None)


def _fetch_file_batch(
    *, after_id: uuid.UUID | None, batch_size: int
) -> list[tuple[uuid.UUID, str | None, str | None, object]]:
    """Fetch one bounded page, closing the DB context before returning."""
    with context_db() as db:
        query = db.query(File.id, File.hash, File.hash_client, File.extra)
        if after_id is not None:
            query = query.filter(File.id > after_id)
        return query.order_by(File.id).limit(batch_size).all()


def promote_hash_to_column(*, apply: bool = False, batch_size: int = 500) -> tuple[int, int]:
    """Return ``(needing_promotion, processed)``; mutate rows only if applied."""
    if batch_size < 1:
        raise ValueError

    global shutdown
    shutdown = False
    needing_promotion = 0
    processed = 0
    after_id: uuid.UUID | None = None
    while not shutdown:
        rows = _fetch_file_batch(after_id=after_id, batch_size=batch_size)
        if not rows:
            break
        after_id = rows[-1][0]
        for file_id, hash_, hash_client, extra in rows:
            if not _needs_promotion(hash_=hash_, hash_client=hash_client, extra=extra):
                continue
            needing_promotion += 1
            if not apply or shutdown:
                continue

            legacy = _legacy_hash(extra)
            new_hash = hash_ or legacy
            new_hash_client = hash_client or new_hash
            extra_dict = dict(extra) if isinstance(extra, dict) else extra.model_dump()
            extra_dict.pop("hash", None)

            try:
                File.patch(
                    obj_id=file_id,
                    update_dict={
                        "hash": new_hash,
                        "hash_client": new_hash_client,
                        "extra": extra_dict,
                    },
                )
                processed += 1
            except Exception:
                logger.exception("file_hash_promote_file_failed", file_id=str(file_id))

    logger.info(
        "file_hash_promote_completed" if apply else "file_hash_promote_preview",
        needing_promotion_count=needing_promotion,
        processed_count=processed,
        interrupted=shutdown,
        apply=apply,
    )
    return needing_promotion, processed


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote legacy extra.hash to the hash/hash_client columns")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="persist the promotion (without this flag, only report the count)",
    )
    args = parser.parse_args()
    signal.signal(signal.SIGINT, _request_shutdown)
    promote_hash_to_column(apply=args.apply)


if __name__ == "__main__":
    main()
