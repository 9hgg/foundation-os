import threading
import uuid

import structlog
from psycopg2.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from libs.db import context_db
from libs.tasks.models import Task, TaskSlot
from libs.tasks.tasks_manager import TasksManager

from .config import TASKS_SETTINGS

logger = structlog.get_logger(__name__)

shutdown = False
running_tasks = False


def signal_handler(sig, frame):
    logger.info("task_processing_stop_signal_received")

    global shutdown, running_tasks
    shutdown = True

    if not running_tasks:
        logger.info("task_processing_no_running_tasks_exiting")
        # exit(0)


PROCESSOR_INSTANCE_ID = TASKS_SETTINGS.PROCESSOR_ID + "-" + str(uuid.uuid4())


def clear_slots():
    with context_db() as db:
        # clear slots
        db.query(TaskSlot).filter(TaskSlot.processor_id == PROCESSOR_INSTANCE_ID).delete()
        db.commit()


def process_tasks():
    global running_tasks
    running_tasks = True
    # list tasks
    with context_db() as db:
        nb_not_started_tasks = (
            Task.query(db)
            #
            .filter(not Task.started)
            .count()
        )
    logger.info("tasks_not_started_count", count=nb_not_started_tasks)
    # if 1:
    #     exit(0)

    while True:
        # handle shutdown
        if shutdown:
            logger.info("task_processing_exiting_gracefully")
            running_tasks = False
            clear_slots()
            exit(0)
        with context_db() as db:
            first_task_without_a_slot: tuple | None = (
                db.query(Task.id, TaskSlot.processor_id)
                .outerjoin(
                    TaskSlot,
                    TaskSlot.task_id == Task.id,
                )
                .filter(Task.started == False)  # noqa: E712
                .filter(TaskSlot.task_id == None)  # noqa: E711
                .order_by(Task.priority.desc(), Task.time_created.asc())
                .first()
            )
            if first_task_without_a_slot is None:
                logger.info("no_more_task_to_process")
                break
            else:
                logger.info("task_to_process", task=str(first_task_without_a_slot))
            task_id_to_launch = first_task_without_a_slot[0]

            # add it to the slots to prevent other workers from picking it up
            try:
                task_slot = TaskSlot(task_id=task_id_to_launch, processor_id=PROCESSOR_INSTANCE_ID)
                db.add(task_slot)
                db.commit()
                TasksManager.execute_task(task_id_to_launch)
            except UniqueViolation as exc:
                # rely on the database ACID properties to prevent race conditions
                logger.warning(
                    "task_slot_unique_violation",
                    task_id=str(task_id_to_launch),
                    error=str(exc),
                )
                db.rollback()
            except IntegrityError as exc:
                logger.warning(
                    "task_slot_integrity_error",
                    task_id=str(task_id_to_launch),
                    error=str(exc),
                )
                db.rollback()
            except Exception:
                logger.exception("task_processing_failed", task_id=str(task_id_to_launch))
                db.rollback()


async def retry_failed_tasks():
    with context_db() as db:
        failed_task_ids = [
            str(task_id)
            for (task_id,) in (
                Task.query(db)
                .filter(Task.failed == True)  # noqa: E712
                .order_by(Task.priority.desc(), Task.time_created.asc())
                .with_entities(Task.id)
                .all()
            )
        ]

    logger.info("failed_tasks_count", count=len(failed_task_ids))

    recreated_tasks = 0
    for failed_task_id in failed_task_ids:
        if shutdown:
            logger.info("task_processing_exiting_gracefully")
            clear_slots()
            exit(0)

        try:
            recreated_task = TasksManager.recreate_task(failed_task_id, priority=0)
            recreated_tasks += 1
            logger.info(
                "failed_task_recreated",
                failed_task_id=failed_task_id,
                recreated_task_id=str(recreated_task.id),
            )
        except Exception:
            logger.exception("task_recreation_failed", failed_task_id=failed_task_id)

    if recreated_tasks > 0:
        await launch_tasks_processing()


def run_task_here(task_id: uuid.UUID | str) -> None:
    """Run one task in this process, right now, instead of waking a worker.

    For work that is small and wanted immediately — a verification link, a password reset, a
    confirmation — waking the worker costs a container start, so the mail lands minutes after the
    person asked for it, or never if the job is capped. Running it here costs a thread and a few
    hundred milliseconds of IO.

    The task row is created and updated exactly as a worker would, so it is tracked, retried and
    visible in the admin like any other. Only the choice of who executes it differs.

    Not for anything heavy: this thread lives in the API process, so an export or a mix belongs on
    the worker where it cannot compete with serving requests.
    """
    threading.Thread(
        target=TasksManager.execute_task,
        args=(task_id,),
        name=f"run-task-here-{task_id}",
        daemon=True,
    ).start()


async def launch_tasks_processing():
    processing_thread = threading.Thread(
        target=sync_launch_tasks_processing,
        name="launch-tasks-processing",
        daemon=True,
    )
    processing_thread.start()


def sync_launch_tasks_processing():
    """
    Try to launch task processing on available workers.
    If no worker is available or responds with 2XX, fallback to current server.
    """
    worker_available = False

    # Use registered workers from TasksManager
    for worker_name, worker_method in TasksManager.workers_methods.items():
        logger.info("worker_launch_attempt", worker_name=worker_name)

        try:
            # Call the worker method
            result = worker_method.fn()
            logger.info(
                "worker_launch_succeeded",
                worker_name=worker_name,
                status="success",
                result_type=type(result).__name__,
            )
            worker_available = True
            break

        except Exception:
            logger.exception("worker_launch_failed", worker_name=worker_name)

    # If no worker was available, call the current server
    if not worker_available:
        logger.info("no_workers_available_launching_on_current_server")
        process_tasks()
