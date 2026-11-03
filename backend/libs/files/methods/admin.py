import argparse
import datetime

import structlog

from libs.acl.models import Acl
from libs.db import context_db
from libs.folders.models import FolderToResource

from ..models import File

logger = structlog.get_logger(__name__)


class NegativeFileAgeError(ValueError):
    """Raised when a negative cleanup age is requested."""


def delete_files_not_in_storage(
    *,
    older_than: datetime.timedelta = datetime.timedelta(hours=24),
    dry_run: bool = False,
    now: datetime.datetime | None = None,
) -> int:
    """Delete stale File rows whose upload never reached storage.

    The age threshold protects uploads that may still be active. Associated ACL
    and folder-membership rows are deleted in the same database transaction.

    Returns the number of files deleted.
    """
    if older_than < datetime.timedelta():
        raise NegativeFileAgeError

    now = now or datetime.datetime.now(datetime.UTC)
    cutoff = now - older_than

    with context_db() as db:
        file_ids = [
            row[0]
            for row in (
                db.query(File.id)
                .filter(File.in_storage.is_(False))
                .filter(File.time_created < cutoff)
                .all()
            )
        ]

        if dry_run or not file_ids:
            action = "Would delete" if dry_run else "Deleted"
            logger.info("stale_files_cleanup", action=action, file_count=len(file_ids), dry_run=dry_run)
            return len(file_ids)

        db.query(Acl).filter(
            Acl.resource_kind == File.__kind__,
            Acl.resource_id.in_(file_ids),
        ).delete(synchronize_session=False)
        db.query(FolderToResource).filter(
            FolderToResource.resource_kind == File.__kind__,
            FolderToResource.resource_id.in_(file_ids),
        ).delete(synchronize_session=False)
        db.query(File).filter(File.id.in_(file_ids)).delete(synchronize_session=False)
        db.commit()

    logger.info("stale_files_deleted", file_count=len(file_ids))
    return len(file_ids)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Delete stale file uploads that never reached storage")
    parser.add_argument("--older-than-hours", type=float, default=24, help="Minimum age in hours (default: 24)")
    parser.add_argument("--dry-run", action="store_true", help="Report candidates without deleting them")
    args = parser.parse_args()
    delete_files_not_in_storage(
        older_than=datetime.timedelta(hours=args.older_than_hours),
        dry_run=args.dry_run,
    )
