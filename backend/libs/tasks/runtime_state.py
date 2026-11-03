import datetime
import os

from .config import TASKS_SETTINGS
from .models import Task, WorkerHeartbeat


def _normalize_datetime(value: datetime.datetime | None) -> datetime.datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.UTC)
    return value


def get_task_heartbeat_age_seconds(
    task: Task, now: datetime.datetime | None = None
) -> float | None:
    heartbeat_reference = _normalize_datetime(task.last_heartbeat_at)
    if heartbeat_reference is None:
        return None

    current_time = _normalize_datetime(now) or datetime.datetime.now(
        datetime.UTC
    )
    return max(0.0, (current_time - heartbeat_reference).total_seconds())


def is_task_effectively_running(
    task: Task, now: datetime.datetime | None = None
) -> bool:
    if not task.started or task.ended:
        return False

    heartbeat_age_seconds = get_task_heartbeat_age_seconds(task, now)
    if heartbeat_age_seconds is None:
        return False

    return heartbeat_age_seconds <= TASKS_SETTINGS.HEARTBEAT_STALE_AFTER_SECONDS


def is_task_stale(task: Task, now: datetime.datetime | None = None) -> bool:
    return task.started and not task.ended and not is_task_effectively_running(
        task, now
    )


def is_pid_alive(pid: int) -> bool:
    """True if a process with this pid currently exists on this machine."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # exists but owned by someone else (shouldn't happen for our own subprocess) — still alive
        return True
    return True


def is_worker_heartbeat_fresh(worker: WorkerHeartbeat, now: datetime.datetime | None = None) -> bool:
    """Same recency check as `is_worker_alive`, minus the OS-pid check.

    For a worker running on a different machine than the caller (e.g. a Cloud Run
    Job execution checked from the API's VM), the recorded pid belongs to a foreign
    process namespace — `os.kill(pid, 0)` here would check for an unrelated local
    process, not the remote one. Heartbeat recency alone is what's available.
    """
    heartbeat_reference = _normalize_datetime(worker.last_heartbeat_at)
    if heartbeat_reference is None:
        return False

    current_time = _normalize_datetime(now) or datetime.datetime.now(datetime.UTC)
    heartbeat_age_seconds = (current_time - heartbeat_reference).total_seconds()
    return heartbeat_age_seconds <= TASKS_SETTINGS.HEARTBEAT_STALE_AFTER_SECONDS


def is_worker_alive(worker: WorkerHeartbeat, now: datetime.datetime | None = None) -> bool:
    """True if a same-machine subprocess worker is still doing its job.

    Checks both the heartbeat recency and the OS pid: the heartbeat alone can't tell a
    hard-killed process from one that's just between updates, and the pid alone can't
    tell a stuck process from a genuinely dead one whose pid got reused.
    """
    heartbeat_reference = _normalize_datetime(worker.last_heartbeat_at)
    if heartbeat_reference is None:
        return False

    current_time = _normalize_datetime(now) or datetime.datetime.now(datetime.UTC)
    heartbeat_age_seconds = (current_time - heartbeat_reference).total_seconds()
    if heartbeat_age_seconds > TASKS_SETTINGS.HEARTBEAT_STALE_AFTER_SECONDS:
        return False

    return is_pid_alive(worker.pid)
