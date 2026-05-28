import datetime

from .config import TASKS_SETTINGS
from .models import Task


def _normalize_datetime(value: datetime.datetime | None) -> datetime.datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value


def get_task_heartbeat_age_seconds(
    task: Task, now: datetime.datetime | None = None
) -> float | None:
    heartbeat_reference = _normalize_datetime(task.last_heartbeat_at)
    if heartbeat_reference is None:
        return None

    current_time = _normalize_datetime(now) or datetime.datetime.now(
        datetime.timezone.utc
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
