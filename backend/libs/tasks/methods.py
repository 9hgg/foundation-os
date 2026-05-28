import threading
import uuid

from psycopg2.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from libs.db import context_db
from libs.logger import print, print_error, print_warning
from libs.tasks.models import Task, TaskSlot
from libs.tasks.tasks_manager import TasksManager

from .config import TASKS_SETTINGS

shutdown = False
running_tasks = False


def signal_handler(sig, frame):
    print("Signal to stop received. Waiting for current task to finish...")

    global shutdown, running_tasks
    shutdown = True

    if not running_tasks:
        print("No running tasks. Exiting...")
        # exit(0)


PROCESSOR_INSTANCE_ID = TASKS_SETTINGS.PROCESSOR_ID + "-" + str(uuid.uuid4())


def clear_slots():
    with context_db() as db:
        # clear slots
        db.query(TaskSlot).filter(
            TaskSlot.processor_id == PROCESSOR_INSTANCE_ID
        ).delete()
        db.commit()


def process_tasks():
    global running_tasks
    running_tasks = True
    # list tasks
    with context_db() as db:
        nb_not_started_tasks = (
            Task.query(db)
            #
            .filter(Task.started == False).count()
        )
    print(f"Number of not started tasks: {nb_not_started_tasks}")
    # if 1:
    #     exit(0)

    while True:
        # handle shutdown
        if shutdown:
            print("Exiting gracefully...")
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
                print("No more task to process")
                break
            else:
                print(
                    f"Task {first_task_without_a_slot} to process",
                )
            task_id_to_launch = first_task_without_a_slot[0]

            # add it to the slots to prevent other workers from picking it up
            try:
                task_slot = TaskSlot(
                    task_id=task_id_to_launch, processor_id=PROCESSOR_INSTANCE_ID
                )
                db.add(task_slot)
                db.commit()
                TasksManager.execute_task(task_id_to_launch)
            except UniqueViolation as e:
                # rely on the database ACID properties to prevent race conditions
                print_warning("[UniqueViolation]", e)
                db.rollback()
            except IntegrityError as e:
                print_warning("[IntegrityError]", e)
                db.rollback()
            except Exception as e:
                print_error(e)
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

    print(f"Number of failed tasks: {len(failed_task_ids)}")

    recreated_tasks = 0
    for failed_task_id in failed_task_ids:
        if shutdown:
            print("Exiting gracefully...")
            clear_slots()
            exit(0)

        try:
            recreated_task = TasksManager.recreate_task(failed_task_id, priority=0)
            recreated_tasks += 1
            print(f"Recreated failed task {failed_task_id} as {recreated_task.id}")
        except Exception as e:
            print_error(e)

    if recreated_tasks > 0:
        await launch_tasks_processing()


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
        print(f"Worker {worker_name}: attempting to launch")

        try:
            # Call the worker method
            result = worker_method.fn()
            print(f"Successfully launched task processing using worker {worker_name}")
            print(f"Worker result: {result}")
            worker_available = True
            break

        except Exception as e:
            print_error(f"Failed to launch worker {worker_name}: {e}")

    # If no worker was available, call the current server
    if not worker_available:
        print("No workers available, launching task processing on current server")
        process_tasks()
