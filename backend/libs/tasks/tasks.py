import time

from libs.tasks.tasks_manager import TasksManager


@TasksManager.enlist_task()
def dummy_task(**kwargs):
    """Print users without passwords"""

    time.sleep(5)
    print("Dummy task executed", kwargs)
    return kwargs
