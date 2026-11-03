import signal

import structlog

# this line is necessary for SQLModel to list all models
from apps.leopar.app import *
from apps.leopar.configs.default import GLOBAL_APP_SETTINGS
from libs.tasks.methods import process_tasks, signal_handler
from libs.tasks.tasks_manager import TasksManager

logger = structlog.get_logger(__name__)

if GLOBAL_APP_SETTINGS.CURRENT_ENV == "prod":
    # TODO: dispatch task processing to a dedicated production worker
    # (separate process/job) instead of relying on the in-process thread
    # fallback used locally.
    pass


@TasksManager.enlist_worker("launch_local_worker_job")
def launch_local_worker_job() -> None:
    """Launch the local worker job."""
    logger.info("local_worker_job_launched")
    process_tasks()


if __name__ == "__main__":
    # Never print the settings object directly — it dumps every secret
    # (APP_SECRET, SESSION_SECRET, DB password, storage keys, ...) in full to
    # stdout, which Cloud Run/Cloud Logging then centralizes and retains.
    logger.info("worker_starting", app_name=GLOBAL_APP_SETTINGS.APP_NAME, env=GLOBAL_APP_SETTINGS.CURRENT_ENV)

    # handles Ctrl-C locally
    signal.signal(signal.SIGINT, signal_handler)
    # handles kill (like docker stop from Cloud Run)
    signal.signal(signal.SIGTERM, signal_handler)

    """Launch the tasks processing locally
    This name==main section is used by the docker image "production-job" to launch the
    tasks processing from Cloud Run jobs
    """
    process_tasks()
