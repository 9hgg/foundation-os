from libs.tasks.tasks_manager import TasksManager


@TasksManager.enlist_task()
def print_users_without_passwords(**kwargs):
    """Print users without passwords"""

    from libs.db import context_db
    from libs.users.models import User

    # time.sleep(10)
    with context_db() as db:
        users = User.query(db).filter(User.password_hashed == None).all()  # noqa: E711
    print("Users without passwords:")
    for user in users:
        print(f" - {user.email}")
    # return users
