from fastapi import BackgroundTasks
from fastapi.responses import HTMLResponse

from libs.db.methods import context_db
from libs.endpoints import create_crud_endpoints
from libs.i18n.deps import Translator__dep
from libs.logger.customLogger import print_color, print_warning
from libs.users.deps import CurrentUser__dep
from libs.utils.types import EndpointError, EndpointOutput

from .methods import launch_tasks_processing, process_tasks, retry_failed_tasks
from .models import Task, TaskSlot
from .runtime_state import is_task_effectively_running, is_task_stale
from .tasks_manager import TasksManager


def create_crud_task_router(prefix: str = "/api/tasks"):
    crud_task_router = create_crud_endpoints(
        Task, prefix=prefix, tags=["tasks"], include_bypass=True
    )

    @crud_task_router.get("/enlisted-methods")
    async def list_enlisted_task_methods(
        current_user_db: CurrentUser__dep,
        translator: Translator__dep,
    ):
        if not current_user_db or not current_user_db.email_verified:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate(
                        "You must be logged in as a verified admin to list enlisted task methods (email not verified)."
                    ),
                    code="Unauthorized",
                )
            )

        if not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate(
                        "You must be logged in as a verified admin to list enlisted task methods (not an admin)."
                    ),
                    code="Unauthorized",
                )
            )

        return EndpointOutput(
            result={"methodNames": sorted(TasksManager.tasks_methods.keys())}
        )

    @crud_task_router.get("/processing/{taskId}/progress")
    async def get_task_progress(taskId: str):
        task_db = Task.by_id(obj_id=taskId)
        # print_color("blue", f"Get task progress for {taskId}", task_db)
        if not task_db:
            return EndpointOutput(
                error=EndpointError(
                    title="Not found", description=f"Task {taskId} not found"
                )
            )

        # Extract progress and status fields using property access
        result = {
            "id": task_db.id,
            "progress": task_db.progress,
            "started": task_db.started,
            "completed": task_db.completed,
            "ended": task_db.ended,
            "failed": task_db.failed,
            "actually_running": is_task_effectively_running(task_db),
            "stale": is_task_stale(task_db),
        }

        # If artifacts has a 'taskId' key, return it
        artifacts = task_db.artifacts
        if (
            artifacts
            and "return_value" in artifacts
            and isinstance(artifacts["return_value"], dict)
            and "task_id" in artifacts["return_value"]
        ):
            result["artifactTaskId"] = artifacts["return_value"]["task_id"]

        print_color("purple", result)

        return EndpointOutput(result=result)

    @crud_task_router.get("/processing/launch-from-server")
    async def launch_tasks_processing_from_server(
        #
        background_tasks: BackgroundTasks,
        translator: Translator__dep,
    ):
        background_tasks.add_task(process_tasks)
        return EndpointOutput(message=translator.translate("Tasks processing launched"))

    @crud_task_router.get("/processing/purge-all")
    async def update_all(
        current_user_db: CurrentUser__dep,
    ):
        if not current_user_db:
            return EndpointOutput(
                error=EndpointError(
                    title="Not identified",
                    description="You are not identified",
                )
            )

        if "joris" not in current_user_db.email:
            return EndpointOutput(
                error=EndpointError(
                    title="Not allowed",
                    description="You are not allowed to call this endpoint",
                )
            )

        with context_db() as db:
            # File.extra is JSONB, we want to filter where extra.duration is NULL
            tasks_db = (
                db.query(Task)
                # .filter(File.extra["duration"].astext == None)
                # .filter(File.kind == "image")
                # .filter(File.id == "5e763d92-e55a-4067-9293-0cbe417ea1c1")
                # .filter(File.in_storage == False)
                .all()
            )

        print("Tasks:", len(tasks_db))

        tasks_stopped = 0

        with context_db() as db:
            for task_db in tasks_db:
                print_warning("You want to update this task:", task_db.id)

                Task.query(db).filter(Task.id == task_db.id).delete()
                db.commit()
                tasks_stopped += 1
                # break

        return EndpointOutput(result={"stoppedTasks": tasks_stopped})

    @crud_task_router.get("/processing/retry-failed")
    async def retry_failed_tasks_(translator: Translator__dep):
        await retry_failed_tasks()
        return EndpointOutput(
            message=translator.translate("Failed tasks retry launched")
        )

    @crud_task_router.get("/{task_id}/recreate")
    async def recreate_task(
        task_id: str,
        background_tasks: BackgroundTasks,
        current_user_db: CurrentUser__dep,
        translator: Translator__dep,
    ):
        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate(
                        "You must be logged in as a verified admin to recreate tasks."
                    ),
                    code="Unauthorized",
                )
            )

        task_db = Task.by_id(obj_id=task_id)
        if not task_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not found"),
                    description=translator.translate(f"Task {task_id} not found"),
                    code="ItemNotFound",
                )
            )

        if is_task_effectively_running(task_db):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Task already running"),
                    description=translator.translate(
                        "Running tasks cannot be recreated."
                    ),
                    code="TaskAlreadyRunning",
                )
            )

        recreated_task = TasksManager.recreate_task(task_db, priority=0)

        background_tasks.add_task(launch_tasks_processing)

        return EndpointOutput(
            message=translator.translate("Task recreated"),
            result={
                "taskId": str(recreated_task.id),
                "sourceTaskId": str(task_db.id),
            },
        )

    @crud_task_router.delete("/{task_id}")
    async def delete_task(
        task_id: str,
        current_user_db: CurrentUser__dep,
        translator: Translator__dep,
    ):
        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate(
                        "You must be logged in as a verified admin to delete tasks."
                    ),
                    code="Unauthorized",
                )
            )

        task_db = Task.by_id(obj_id=task_id)
        if not task_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not found"),
                    description=translator.translate(f"Task {task_id} not found"),
                    code="ItemNotFound",
                )
            )

        if is_task_effectively_running(task_db):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Task already running"),
                    description=translator.translate(
                        "Running tasks cannot be deleted."
                    ),
                    code="TaskAlreadyRunning",
                )
            )

        with context_db() as db:
            db.query(TaskSlot).filter(TaskSlot.task_id == task_db.id).delete()
            db.query(Task).filter(Task.id == task_db.id).delete()
            db.commit()

        return EndpointOutput(
            message=translator.translate("Task deleted"),
            result={"taskId": str(task_db.id)},
        )

    @crud_task_router.get("/processing/create-dummy-tasks")
    async def create_dummy_tasks_():
        pass

    @crud_task_router.get("/processing/state")
    async def get_test_details():
        all_tasks = Task.query().all()
        completed = 0
        failed = 0
        ended = 0
        started = 0

        for task in all_tasks:
            if task.ended:
                ended += 1
            if task.completed:
                completed += 1
            if task.failed:
                failed += 1
            if task.started:
                started += 1
        total = len(all_tasks)
        running = started - ended

        html = f"""
        <html>
        <head>
            <title>Task Processing State</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 2em; }}
                table {{ border-collapse: collapse; min-width: 350px; }}
                th, td {{ border: 1px solid #ccc; padding: 8px 16px; text-align: left; }}
                th {{ background: #f0f0f0; }}
                tr:nth-child(even) {{ background: #fafafa; }}
            </style>
        </head>
        <body>
            <h2>Task Processing State</h2>
            <table>
                <tr><th>Total tasks</th><td>{total}</td></tr>
                <tr><th>Started</th><td>{started}</td></tr>
                <tr><th>&nbsp;&nbsp;&nbsp;Running</th><td>{running}</td></tr>
                <tr><th>Ended</th><td>{ended}</td></tr>
                <tr><th>&nbsp;&nbsp;&nbsp;Completed</th><td>{completed}</td></tr>
                <tr><th>&nbsp;&nbsp;&nbsp;Failed</th><td>{failed}</td></tr>

            </table>
            <p style='color: #888; font-size: 0.9em;'>Note: ended = completed + failed</p>
        </body>
        </html>
        """
        return HTMLResponse(content=html)

    return crud_task_router
