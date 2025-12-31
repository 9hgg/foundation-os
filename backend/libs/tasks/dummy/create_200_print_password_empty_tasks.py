from libs.logger import print
from libs.tasks.tasks_manager import TasksManager
from libs.users.tasks import print_users_without_passwords  # noqa: F401

for i in range(200):
    TasksManager.create_task(
        method_name="print_users_without_passwords",
        title=f"Print users without passwords {i}",
        description=f"Print users without passwords {i}",
    )
    if i % 10 == 0:
        print(f"Task {i} created.")
