import datetime
import os
import subprocess
import sys
import threading
import typing

import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert

from libs.db import context_db

from .config import TASKS_SETTINGS
from .models import WorkerHeartbeat
from .runtime_state import is_worker_alive, is_worker_heartbeat_fresh

logger = structlog.get_logger(__name__)


def _get_worker_heartbeat(processor_id: str) -> WorkerHeartbeat | None:
    with context_db() as db:
        return db.get(WorkerHeartbeat, processor_id)


def record_worker_started(processor_id: str, pid: int) -> None:
    # Atomic upsert, not merge(): two workers booting at once both SELECT-miss then INSERT the
    # same processor_id, tripping worker_heartbeats_pkey (Sentry IntegrityError). ON CONFLICT
    # lets the later one overwrite the row instead of raising.
    now = datetime.datetime.now(datetime.UTC)
    statement = (
        pg_insert(WorkerHeartbeat)
        .values(processor_id=processor_id, pid=pid, started_at=now, last_heartbeat_at=now)
        .on_conflict_do_update(index_elements=["processor_id"], set_={"pid": pid, "started_at": now, "last_heartbeat_at": now})
    )
    with context_db() as db:
        db.execute(statement)
        db.commit()


def touch_worker_heartbeat(processor_id: str, pid: int) -> None:
    """No-ops if `pid` no longer owns this row (e.g. a duplicate spawn's row won a
    race and overwrote it) instead of refreshing a timestamp that isn't ours to
    refresh — see `clear_worker_heartbeat` for why ownership matters here.
    """
    with context_db() as db:
        worker = db.get(WorkerHeartbeat, processor_id)
        if worker is None or worker.pid != pid:
            return
        worker.last_heartbeat_at = datetime.datetime.now(datetime.UTC)
        db.add(worker)
        db.commit()


def clear_worker_heartbeat(processor_id: str, pid: int) -> None:
    """Only deletes the row if `pid` still owns it.

    If a heartbeat ever reads falsely stale (e.g. this process's own heartbeat
    thread got delayed under heavy load) a second worker can get spawned for the
    same `processor_id`; it overwrites the row with its own pid via
    `record_worker_started`. Without this check, the first (older) worker's own
    unconditional cleanup on exit would then delete the second worker's still-valid
    row, making the system think no worker is running while one still is.
    """
    with context_db() as db:
        db.query(WorkerHeartbeat).filter(WorkerHeartbeat.processor_id == processor_id, WorkerHeartbeat.pid == pid).delete()
        db.commit()


def is_worker_running(processor_id: str) -> bool:
    worker = _get_worker_heartbeat(processor_id)
    if worker is None:
        return False
    return is_worker_alive(worker)


def is_remote_worker_running(processor_id: str) -> bool:
    """Same idea as `is_worker_running`, for a worker on another machine (e.g. a
    Cloud Run Job execution) — see `is_worker_heartbeat_fresh` for why the pid
    check is skipped.
    """
    worker = _get_worker_heartbeat(processor_id)
    if worker is None:
        return False
    return is_worker_heartbeat_fresh(worker)


def launch_subprocess_worker_if_not_running(*, module: str, processor_id: str) -> bool:
    """Spawn `python -m <module>` as a detached OS subprocess, unless one is already
    alive for this `processor_id`.

    Used instead of running task processing in a thread inside the calling process
    (e.g. the API server) so CPU-heavy tasks can't starve that process's event loop.
    Inherits the current environment/cwd/interpreter, so it picks up whatever env vars
    the caller was started with.

    Returns True if a new subprocess was spawned, False if an existing one is already
    running — that one will still pick up any newly created task on its own, since
    `process_tasks()` re-queries the database every loop iteration.
    """
    if is_worker_running(processor_id):
        logger.info("worker_spawn_skipped", processor_id=processor_id, reason="already_running")
        return False

    logger.info("worker_spawn", processor_id=processor_id, module=module)
    process = subprocess.Popen([sys.executable, "-m", module], start_new_session=True)  # noqa: S603
    # Record the heartbeat from here, right away — the child's own booting (importing
    # the whole app) can take several seconds before it gets a chance to record itself,
    # which would otherwise leave a window where a second rapid call still sees no
    # worker running and spawns a duplicate. The child overwrites this same row with
    # its own periodic heartbeat once it's up.
    record_worker_started(processor_id, process.pid)
    return True


def run_worker_with_heartbeat(processor_id: str, process_fn: typing.Callable[[], None]) -> None:
    """Run `process_fn` (typically `process_tasks`) while recording this OS process's
    pid and a periodic heartbeat, so `is_worker_running` can tell other processes
    whether a worker is already active for `processor_id`.
    """
    pid = os.getpid()
    record_worker_started(processor_id, pid)
    stop_heartbeat_event = threading.Event()

    def heartbeat_loop():
        while not stop_heartbeat_event.wait(TASKS_SETTINGS.HEARTBEAT_INTERVAL_SECONDS):
            touch_worker_heartbeat(processor_id, pid)

    heartbeat_thread = threading.Thread(target=heartbeat_loop, name=f"worker-heartbeat-{processor_id}", daemon=True)
    heartbeat_thread.start()

    try:
        process_fn()
    finally:
        stop_heartbeat_event.set()
        heartbeat_thread.join(timeout=1)
        clear_worker_heartbeat(processor_id, pid)
