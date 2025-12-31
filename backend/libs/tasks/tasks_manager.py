import datetime
import sys
import traceback
import typing
import uuid
from typing import ClassVar

from pydantic import TypeAdapter

from libs.db import context_db
from libs.logger import print, print_color
from libs.tasks.tasks_manager_errors import (
    TaskNotFoundError,
)
from libs.utils.types import BaseModelWithConfig, serialize

from .config import TASKS_SETTINGS
from .models import Task, TaskArguments, TaskArtifacts


class TaskMethod(BaseModelWithConfig):
    method_name: str
    fn: typing.Callable


class WorkerMethod(BaseModelWithConfig):
    worker_name: str
    fn: typing.Callable


class TasksManager:
    """Tasks manager"""

    tasks_methods: ClassVar[dict[str, TaskMethod]] = {}
    workers_methods: ClassVar[dict[str, WorkerMethod]] = {}

    @classmethod
    def enlist_worker(
        #
        cls,
        worker_name: str | None = None,
    ):
        """Register a worker"""

        def decorator(fn: typing.Callable, worker_name=worker_name):
            if worker_name is None:
                worker_name = fn.__name__
            if worker_name in cls.workers_methods:
                # raise WorkerAlreadyEnlistedError(worker_name)
                return
            worker_method = WorkerMethod(worker_name=worker_name, fn=fn)
            cls.workers_methods[worker_name] = worker_method
            print(f"👷 Worker {worker_name} enlisted")
            return fn

        return decorator

    @classmethod
    def enlist_task(
        #
        cls,
        method_name: str | None = None,
    ):
        """Register a task"""

        def decorator(fn: typing.Callable, method_name=method_name):
            if method_name is None:
                method_name = fn.__name__
            if method_name in cls.tasks_methods:
                # raise TaskAlreadyEnlistedError(method_name)
                return
            task_method = TaskMethod(method_name=method_name, fn=fn)
            cls.tasks_methods[method_name] = task_method
            print(f"✅ Task method {method_name} enlisted")
            return fn

        return decorator

    @classmethod
    def execute_task(
        #
        cls,
        task_id: uuid.UUID | str,
        purge_on_success: bool = False,
    processor_id: str | None = TASKS_SETTINGS.PROCESSOR_ID,
    processor_kind: str | None = TASKS_SETTINGS.PROCESSOR_KIND,
    ):
        """Execute a task"""

        task = Task.by_id(obj_id=task_id)
        if task is None:
            print(f"Task {task_id} not found")
            return

        print_color("red", f"Executing task {task.title}")
        print_color("cyan", f"Executing task {task.arguments}")
        print(f"Task description: {task.description}")
        print(f"Processor: {processor_id} ({processor_kind})")

        task.started_at = datetime.datetime.now(datetime.timezone.utc)
        task.started = True
        task.processor_id = processor_id
        task.processor_kind = processor_kind
        cls.update_task(
            task.id,
            {
                "started_at": task.started_at,
                "started": task.started,
                "processor_id": task.processor_id,
                "processor_kind": task.processor_kind,
            },
        )

        task_method = cls.tasks_methods.get(task.method_name)
        artifacts = TaskArtifacts()
        if not task_method:
            task.ended = True
            task.failed = True
            task.ended_at = datetime.datetime.now(datetime.timezone.utc)

            artifacts.error_details = f"Task method {task.method_name} not found"
            task.artifacts = serialize(artifacts)

            cls.update_task(
                task.id,
                {
                    "ended": task.ended,
                    "failed": task.failed,
                    "ended_at": task.ended_at,
                    "artifacts": task.artifacts,
                },
            )
            return

        arguments: TaskArguments = TypeAdapter(TaskArguments).validate_python(
            task.arguments
        )
        print(f"Task arguments ({task.method_name}): {arguments}")

        try:
            artifacts = TaskArtifacts()
            artifacts.return_value = task_method.fn(
                *arguments.args, **arguments.kwargs, task=task, task_manager=cls
            )
            task.artifacts = serialize(artifacts, False, True)
            task.completed = True
        except Exception as e:
            print_color("red", f"Error executing task {task.title}")
            print_color("red", e)
            sys.excepthook(*sys.exc_info())
            exception_text = traceback.format_exc()

            artifacts = TaskArtifacts()
            artifacts.error_details = str(e) + "\n\n" + exception_text
            task.artifacts = serialize(artifacts)
            task.failed = True
        finally:
            task.ended = True

        task.ended_at = datetime.datetime.now(datetime.timezone.utc)
        cls.update_task(
            task.id,
            {
                "ended": task.ended,
                "completed": task.completed,
                "failed": task.failed,
                "ended_at": task.ended_at,
                "artifacts": task.artifacts,
            },
        )

        if purge_on_success and not task.failed:
            cls.purge_one_task(task.id)

    @staticmethod
    def update_task(task_id: uuid.UUID, update_dict: dict):
        Task.patch(obj_id=task_id, update_dict=update_dict)

    @classmethod
    def purge_successful_tasks(cls):
        with context_db() as db:
            Task.query(db).filter(Task.completed == True).delete()  # noqa: E712
            db.commit()

    @classmethod
    def purge_one_task(cls, task_id: uuid.UUID | str):
        with context_db() as db:
            Task.query(db).filter(Task.id == task_id).delete()
            db.commit()

    @classmethod
    def create_task(
        #
        cls,
        *,
        method_name: str,
        custom_id: str | uuid.UUID | None = None,
        title: str | None = None,
        description: str | None = None,
        args: list | None = None,
        kwargs: dict | None = None,
    ) -> Task:
        """Create a task"""

        # Set default values for mutable arguments
        if args is None:
            args = []
        if kwargs is None:
            kwargs = {}

        # check that the method exists
        task_method = cls.tasks_methods.get(method_name)
        if not task_method:
            raise TaskNotFoundError(method_name)

        # if custom_id is a UUID, convert it to a string
        if isinstance(custom_id, uuid.UUID):
            custom_id = custom_id.hex

        # create the task
        task = Task(
            id=uuid.uuid4(),
            custom_id=custom_id or uuid.uuid4().hex,
            method_name=method_name,
            title=title,
            description=description,
            arguments=TaskArguments(args=args, kwargs=kwargs).model_dump(),
        )

        # save the task
        Task.create(obj=task)

        return task
