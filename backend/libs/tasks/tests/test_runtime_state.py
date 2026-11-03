import datetime
import os
import uuid

from libs.tasks.models import Task, WorkerHeartbeat
from libs.tasks.runtime_state import (
    is_pid_alive,
    is_task_effectively_running,
    is_task_stale,
    is_worker_alive,
)


def _make_task(
    *,
    started: bool,
    ended: bool,
    heartbeat_age_seconds: int,
) -> Task:
    current_time = datetime.datetime.now(datetime.UTC)
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


def test_is_pid_alive_for_the_current_process():
    assert is_pid_alive(os.getpid())


def test_is_pid_alive_false_for_a_pid_that_does_not_exist():
    # PIDs are 16-bit on most systems; this one is vanishingly unlikely to be in use.
    assert not is_pid_alive(2**30)


def _make_worker(*, heartbeat_age_seconds: int, pid: int) -> WorkerHeartbeat:
    current_time = datetime.datetime.now(datetime.UTC)
    return WorkerHeartbeat(
        processor_id="test-worker",
        pid=pid,
        started_at=current_time,
        last_heartbeat_at=current_time - datetime.timedelta(seconds=heartbeat_age_seconds),
    )


def test_worker_is_alive_when_heartbeat_is_fresh_and_pid_exists():
    worker = _make_worker(heartbeat_age_seconds=5, pid=os.getpid())

    assert is_worker_alive(worker)


def test_worker_is_not_alive_when_heartbeat_is_stale():
    worker = _make_worker(heartbeat_age_seconds=120, pid=os.getpid())

    assert not is_worker_alive(worker)


def test_worker_is_not_alive_when_pid_no_longer_exists():
    worker = _make_worker(heartbeat_age_seconds=5, pid=2**30)

    assert not is_worker_alive(worker)
