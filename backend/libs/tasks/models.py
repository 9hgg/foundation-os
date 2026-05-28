import datetime
import typing
import uuid

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB

from libs.mcp.display import ResourceDisplayProfile
from libs.resource import Resource
from libs.utils.types import BaseModelWithConfig


class TaskArtifacts(BaseModelWithConfig):
    return_value: typing.Any = None
    error_details: str | None = None
    llm_token_usage: dict | None = None


class TaskArguments(BaseModelWithConfig):
    args: list = []
    kwargs: dict = {}


class TaskSlot(sqlmodel.SQLModel, table=True):
    """A TaskSlot is not a resource like other elements so it directly inherit from SQLModel."""

    __tablename__ = "task_slots"
    task_id: uuid.UUID = sqlmodel.Field(
        sa_column=sa.Column(
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    processor_id: str | None = None


class Task(Resource, table=True):
    __tablename__ = "tasks"
    __kind__ = "task"
    __description__ = "A Task is a model to represent a task to be executed"
    __title__ = "Task"
    __example__ = "Task"
    __mcp_display__ = ResourceDisplayProfile(
        kind="task",
        title_fields=("title", "method_name", "custom_id", "id"),
        subtitle_fields=("description",),
        status_fields=("failed", "completed", "ended", "started"),
        date_fields=("ended_at", "started_at", "last_heartbeat_at", "time_updated", "time_created"),
        metadata_fields=("method_name", "priority", "progress", "processor_kind"),
    )

    # custom id can be used to be sure to create
    # only one specific task (like email_id+attempt)
    custom_id: str = sqlmodel.Field(
        nullable=False,
        unique=True,
        default_factory=lambda: uuid.uuid4().hex,
    )

    ## INSTANCIATION DETAILS
    # will match a method to be called in the tasks manager
    method_name: str
    arguments: dict = sqlmodel.Field(
        sa_column=sa.Column(JSONB, nullable=False),
        default_factory=lambda: TaskArguments(),
    )
    title: str | None = None
    description: str | None = None
    # can be used to classify kind of task (mail, export, processing...)
    kind: str | None = None
    priority: int = 100

    ## PROCESSING DETAILS

    # processor (can be a cloudrun worker, a local instance...)
    processor_id: str | None = None
    processor_kind: str | None = None  # cloudrun, local, ...

    # state
    started: bool = False
    # completed is true on success only
    completed: bool = False
    # ended is true on success OR failure
    ended: bool = False
    # failed is true on failure only
    failed: bool = False

    started_at: datetime.datetime | None = sqlmodel.Field(
        sa_type=sa.DateTime(timezone=True),
        default=None,
    )
    ended_at: datetime.datetime | None = sqlmodel.Field(
        sa_type=sa.DateTime(timezone=True),
        default=None,
    )
    progress: float = 0.0  # between 0 and 100
    last_heartbeat_at: datetime.datetime | None = sqlmodel.Field(
        sa_type=sa.DateTime(timezone=True),
        default=None,
    )

    ## RESULTS
    # should be parsed as TaskArtifacts
    artifacts: dict | None = sqlmodel.Field(sa_column=sa.Column(JSONB), default=None)


class WorkerConfig(BaseModelWithConfig):
    __kind__ = "workerConfig"
    __description__ = "The config of a worker."
    __title__ = "Worker config"
    __private__ = True
    __category__ = "config"

    # Add any additional fields or methods specific to the worker config here
    current_task_id: str | None = None


# TODO: convert to SQLModel to be able to enlist workers through GUI
# class Worker(BaseModelWithConfig):  # until we use it in the DB
#     __tablename__ = "workers"  # type: ignore  # noqa: PGH003
#     __kind__ = "worker"
#     __title__ = "Worker"
#     __description__ = "A worker object for processing tasks."
#     # __config_type__ = WorkerConfig

#     name: str | None = None
#     description: str | None = None
#     kind: str = "url"
#     state: str = "enlisted"
#     cpus: int | None = None
#     gpus: int | None = None
#     memory: float | None = None
#     url: str | None = None

#     config: WorkerConfig = sqlmodel.Field(
#         sa_type=JSONB,
#         nullable=False,
#         default_factory=lambda: WorkerConfig(),
#     )


# DEFAULT_WORKER = Worker(
#     name="default_worker",
#     description="The default worker for processing tasks.",
#     url="http://localhost:8000/api/tasks/processing/launch-from-server",
# )


# ALL_WORKERS = [DEFAULT_WORKER]
