import signal

# this line is necessary for SQLModel to list all models
from apps.leopar.app import *
from apps.leopar.configs.default import GLOBAL_APP_SETTINGS
from libs.tasks.methods import process_tasks, signal_handler
from libs.tasks.tasks_manager import TasksManager

if GLOBAL_APP_SETTINGS.CURRENT_ENV == "prod":
    # TODO: implement some EDF HPC worker processing?
    pass


@TasksManager.enlist_worker("launch_local_worker_job")
def launch_local_worker_job() -> None:
    """Launch the local worker job."""
    print("Launching local worker job...")
    process_tasks()


if __name__ == "__main__":
    print(GLOBAL_APP_SETTINGS)

    # handles Ctrl-C locally
    signal.signal(signal.SIGINT, signal_handler)
    # handles kill (like docker stop from Cloud Run)
    signal.signal(signal.SIGTERM, signal_handler)

    """Launch the tasks processing locally
    This name==main section is used by the docker image "production-job" to launch the
    tasks processing from Cloud Run jobs
    """
    process_tasks()
