import datetime
import uuid

from libs.tasks.models import Task
from libs.tasks.runtime_state import is_task_effectively_running, is_task_stale


def _make_task(
    *,
    started: bool,
    ended: bool,
    heartbeat_age_seconds: int,
) -> Task:
    current_time = datetime.datetime.now(datetime.timezone.utc)
    return Task(
        id=uuid.uuid4(),
        custom_id=uuid.uuid4().hex,
        method_name="test_method",
        arguments={"args": [], "kwargs": {}},
        started=started,
        ended=ended,
        last_heartbeat_at=current_time
        - datetime.timedelta(seconds=heartbeat_age_seconds),
    )


def test_task_is_effectively_running_when_heartbeat_is_fresh():
    task = _make_task(started=True, ended=False, heartbeat_age_seconds=5)

    assert is_task_effectively_running(task)
    assert not is_task_stale(task)


def test_task_is_stale_when_heartbeat_is_too_old():
    task = _make_task(started=True, ended=False, heartbeat_age_seconds=120)

    assert not is_task_effectively_running(task)
    assert is_task_stale(task)


def test_finished_task_is_not_considered_running():
    task = _make_task(started=True, ended=True, heartbeat_age_seconds=5)

    assert not is_task_effectively_running(task)
    assert not is_task_stale(task)
