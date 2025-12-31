import uuid

from psycopg2.errors import UniqueViolation
from rich import print
from sqlalchemy.exc import IntegrityError

from libs.db import context_db
from libs.logger import print_error, print_warning
from libs.logger.customLogger import print_color
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
    # list tasks
    with context_db() as db:
        nb_not_started_tasks = (
            Task.query(db).filter(Task.failed == True).count()  # noqa: E712
        )
    print(f"Number of failed tasks: {nb_not_started_tasks}")

    while True:
        # handle shutdown
        if shutdown:
            print("Exiting gracefully...")
            clear_slots()
            exit(0)
        with context_db() as db:
            task_id_slot_not_in_slots: tuple | None = (
                db.query(Task.id, TaskSlot.processor_id)
                .outerjoin(
                    TaskSlot,
                    TaskSlot.task_id == Task.id,
                )
                .filter(TaskSlot.task_id == None)  # noqa: E711
                .order_by(Task.priority.desc(), Task.time_created.asc())
                .first()
            )
            if task_id_slot_not_in_slots is None:
                print("No more task to process")
                break
            else:
                print(
                    f"Task {task_id_slot_not_in_slots} to process",
                )
            task_id_not_in_slots = task_id_slot_not_in_slots[0]

            # add it to the slots
            try:
                task_slot = TaskSlot(
                    task_id=task_id_not_in_slots, processor_id=PROCESSOR_INSTANCE_ID
                )
                db.add(task_slot)
                db.commit()
                TasksManager.execute_task(task_id_not_in_slots)
            except UniqueViolation as e:
                print_warning("[UniqueViolation]", e)
                db.rollback()
            except IntegrityError as e:
                print_warning("[IntegrityError]", e)
                db.rollback()
            except Exception as e:
                print_error(e)
                db.rollback()
            break


async def launch_tasks_processing():
    print_color("red", "TASKS ARE NOT BEING PROCESSED")
    sync_launch_tasks_processing()


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
