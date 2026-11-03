import time

from libs.tasks.tasks_manager import TasksManager

# execute_task() always injects these into every task call — echoing them back
# in a return value breaks serialization (task_manager is the TasksManager
# class itself, not JSON-serializable).
_INJECTED_KWARGS = {"task", "task_manager"}


@TasksManager.enlist_task()
def dummy_task(**kwargs):
    """Print users without passwords"""

    time.sleep(5)
    print("Dummy task executed", kwargs)
    return {key: value for key, value in kwargs.items() if key not in _INJECTED_KWARGS}
